## Plan: Replace EMA tracker with per-track Kalman prediction (plus 1-miss inference grace)

### Summary
Implement a **constant-velocity Kalman filter per gate track** in `LiveGateStabilizer`, associate detections against the **predicted** state (Mahalanobis + hard pixel cap), and propagate tracks on **every frame** via `step(frame_idx, dets_or_none)` so overlays don’t freeze between inference calls. Add a **1-miss grace per inference call** with **confidence decay on misses** to eliminate most flicker without reintroducing long-lived ghosts.

This plan explicitly fixes:
- EMA steady-state lag inflating match distance (and thus track breakage)
- dict-insertion-order greedy matching bugs
- asymmetric hysteresis (strict show, immediate hide)
- freeze-then-jump on non-inference frames

---

## Decisions (locked)
- Motion model: **full Kalman** (state `[cx, by, vx, vy]`)
- Display policy: **1 missed inference call grace**, then hide
- Between-stride behavior: **per-frame prediction** (no optical flow in this phase)
- `_greedy_assign`: **copy inline** (do not import from `tracking.py`)

---

## 1) `LiveGateStabilizer` refactor (Kalman + `step()`)
**File:** `/Users/quan/Documents/personal/Stanford application project/ski_racing/detection.py:492`

### 1.1 Public API
- Add: `step(frame_idx: int, dets: list | None) -> list`
  - `dets is None`: predict-only (non-inference frame) → **do not** increment `stale_calls`, **do not** apply miss confidence decay
  - `dets is []`: inference happened but no detections → **increment** `stale_calls` for all tracks + apply miss confidence decay
  - `dets is list[dict]`: normal update path
- Keep: `update(dets: list) -> list` as a legacy wrapper:
  - Maintain `self._update_call_idx` (int), initialized to `0` in `__init__`
  - On each `update(dets)`: increment `self._update_call_idx += 1` **before** calling `step(self._update_call_idx, dets)`
  - Note in docstring: velocities are in “px per update call” for legacy usage; this is intentional and backward compatible

### 1.2 Helper: local greedy assignment (no imports)
- Implement `_greedy_assign(cost_triples)` as a private staticmethod on `LiveGateStabilizer` (or a small module-level helper in `detection.py`), using the 7-line pattern:
  - sort `(cost, track_id, det_i)` ascending
  - greedily choose unique `(track_id, det_i)` pairs

### 1.3 Track state (remove old position keys)
Per track dict (in `self._tracks`), store:
- `track_id: int`
- `x: np.ndarray shape (4,)` = `[cx, by, vx, vy]`
- `P: np.ndarray shape (4,4)`
- `class: int`, `class_name: str`
- `confidence_ema: float`
- `hits: int`
- `stale_calls: int`

**Important:** do **not** store `center_x` / `base_y` as top-level keys anymore. All position reads for output and matching must use `x[0]` / `x[1]` exclusively.

### 1.4 Parameters (constructor)
Keep existing parameters, and add:
- `max_shown_stale_calls: int = 0` (call sites will set to `1`)
- `stale_conf_decay: float = 0.85`
- `meas_sigma_px: float = 10.0`  (R)
- `accel_sigma_px: float = 8.0`  (Q)
- `maha_threshold: float = 3.0`
- `class_mismatch_cost: float = 0.75`

Also reinterpret:
- `alpha`: **confidence EMA alpha only** (position is KF now)
- `match_threshold`: a **hard pixel-distance cap** used in addition to Mahalanobis gating

Back-compat mapping:
- If `show_stale=True`, treat it as `max_shown_stale_calls = max_stale_calls` (legacy “show everything until dropped” behavior).
- If `show_stale=False`, use `max_shown_stale_calls` exactly (default 0 = strict; overlay will set 1).

### 1.5 Kalman math (exact)
State: `x = [cx, by, vx, vy]ᵀ`

Predict with `dt = max(1, frame_idx - self._last_step_frame_idx)` where `self._last_step_frame_idx` starts as `None`:
- If `self._last_step_frame_idx is None`, use `dt = 1` for the first call
- Update `self._last_step_frame_idx = frame_idx` at the end of `step()`

Matrices:
- `F(dt) = [[1,0,dt,0],[0,1,0,dt],[0,0,1,0],[0,0,0,1]]`
- `R = diag([meas_sigma_px², meas_sigma_px²])`
- `Q(dt)` from white-noise acceleration model (per axis block):
  - `[[dt⁴/4, dt³/2],[dt³/2, dt²]] * accel_sigma_px²`
  - Assemble into 4×4 block-diagonal for x/y

Update:
- `H = [[1,0,0,0],[0,1,0,0]]`
- innovation `y = z - Hx`, `S = HPHᵀ + R`, Mahalanobis `sqrt(yᵀ S⁻¹ y)`
- Kalman gain `K = P Hᵀ S⁻¹`
- Update `x = x + K y`
- Covariance update: use `P = (I - K H) P`
  - Add a short code comment noting Joseph form exists for numerical stability, but we keep the standard form for simplicity/size (so future edits don’t “fix” it blindly)

### 1.6 Association + lifecycle logic
Candidate extraction:
- Parse detections robustly; accept only dicts with numeric `center_x`, `base_y`, `confidence`
- Ignore dets with `confidence < update_conf_min`

For each predicted track and each candidate:
- `px_dist = ||z - Hx||₂`
- `mahal` as above
- Gate requires: `mahal <= maha_threshold` **and** `px_dist <= match_threshold`
- Cost: `mahal + (class_mismatch_cost if class differs else 0.0)`

Assignment:
- Build all gated triples and run `_greedy_assign` to avoid dict-order dependence.

Matched track:
- KF update
- `hits += 1`, `stale_calls = 0`
- `confidence_ema = alpha * det_conf + (1-alpha) * confidence_ema`
- refresh `class/class_name`

Unmatched tracks on **inference steps** (`dets is not None`):
- `stale_calls += 1`
- `confidence_ema *= stale_conf_decay`

Spawn new tracks:
- For unmatched detections with `confidence >= spawn_conf`, create a new KF track with:
  - `x = [cx, by, 0, 0]`
  - `P = diag([meas_sigma_px², meas_sigma_px², 50², 50²])`
  - `hits=1`, `stale_calls=0`, `confidence_ema=det_conf`

Drop tracks:
- Remove when `stale_calls > max_stale_calls`

### 1.7 Display policy (1-miss inference grace)
`_shown_tracks()` returns tracks satisfying:
- `hits >= min_hits_to_show`
- `confidence_ema >= display_conf`
- `stale_calls <= max_shown_stale_calls` (overlay sets this to 1)
Output gate dict must include:
- `center_x = float(track["x"][0])`
- `base_y   = float(track["x"][1])`
- plus metadata fields already returned today (`track_id`, `class`, `class_name`, `confidence_ema`, `hits`, `stale_calls`)

---

## 2) Call-site changes: per-frame stepping (no frozen cache)
### 2.1 Live test overlay
**File:** `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py:105`

Replace “freeze cached between inference calls” with:
- On inference frames: compute `dets`, call `cached = stabilizer.step(frame_idx, dets)`
- On non-inference frames: call `cached = stabilizer.step(frame_idx, None)`

Instantiate stabilizer with:
- `max_shown_stale_calls=1`
- `stale_conf_decay=0.85`
- `meas_sigma_px=10.0`, `accel_sigma_px=8.0`, `maha_threshold=3.0`
- `match_threshold=130.0` (hard cap; prediction-based matching keeps it safe)

### 2.2 Demo visualization live mode
**File:** `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py:55`

Mirror the same stepping logic:
- Inference frames: `shown = live_stabilizer.step(frame_num, dets)`
- Non-inference frames: `shown = live_stabilizer.step(frame_num, None)`
- Render from `shown` every frame

---

## 3) Tests (update existing + add new)
**File:** `/Users/quan/Documents/personal/Stanford application project/tests/test_live_gate_stabilizer.py:16`

### 3.1 Ensure existing tests still pass via `update()`
- Existing tests continue using `update()` unchanged.
- They implicitly validate that `_shown_tracks()` reads from `track["x"]` correctly (since old keys won’t exist).

### 3.2 Add four new unittest cases (explicitly for new behavior)
1) Predict-only doesn’t increment staleness  
   - `step(t, det)` confirm shown → `step(t+1, None)` still shown and `stale_calls` unchanged
2) 1-miss inference grace  
   - with `max_shown_stale_calls=1`: after a miss `step(t, [])` still shown; after second consecutive miss hidden
3) Confidence decays on misses  
   - verify `confidence_ema` multiplies by `stale_conf_decay` on inference miss
4) Order-independent assignment  
   - two tracks + two detections in swapped order → assignment matches geometric best (not creation order)

---

## 4) Acceptance criteria (video-level)
Re-run the same three videos (`1571_raw`, `1575_raw`, `IMG_1310`) with `stride=3`:

- **No freeze-then-jump:** circles move every frame (prediction)
- **Flicker reduction:** isolated single misses should not blank the overlay
- **No multi-call ghosting:** on inference calls, `(raw_count==0 && shown_count>0)` can occur for at most **1 consecutive inference call** (by design)

---

## Assumptions / explicit non-goals
- This phase does **not** add optical flow or homography/GMC.
- dt units are “frames” for real `step(frame_idx, ...)` call sites and “update-calls” for `update()` legacy usage; both are acceptable as internal units because the filter is purely kinematic in pixel space.
