# PLAN: Stabilize live gate detection (accuracy-first)

**Target doc:** `/Users/quan/Documents/personal/Stanford application project/docs/plans/PLAN_stabilize_gate_detection.md`

## Problem statement (what’s happening in the 3 reviewed videos)
In the live overlay outputs under:
- `/Users/quan/Documents/personal/Stanford application project/artifacts/outputs/gate_live/stable_20260303_193250/1571_raw_live_gates.mp4`
- `/Users/quan/Documents/personal/Stanford application project/artifacts/outputs/gate_live/stable_20260303_193250/1575_raw_live_gates.mp4`
- `/Users/quan/Documents/personal/Stanford application project/artifacts/outputs/gate_live/stable_20260303_193250/IMG_1310_live_gates.mp4`

…the system draws “unreal gates” primarily because the *live stabilizer output is treated as “current detections” even when it is stale*.

Concrete examples from the existing run summaries:
- `/Users/quan/Documents/personal/Stanford application project/artifacts/outputs/gate_live/stable_20260303_193250/1571_raw_live_gates_summary.json`
  - Frame `1377`: `count=0` but `stable_count=5` (“raw=0, stable=5” ghosts).
- `/Users/quan/Documents/personal/Stanford application project/artifacts/outputs/gate_live/stable_20260303_193250/1575_raw_live_gates_summary.json`
  - Many frames where `count<=1` but `stable_count` remains large (e.g., frame `126`: raw=1 stable=19; frame `498`: raw=0 stable=13), causing circles to drift onto skier/snow.

## Root causes (code-level)
1. `/Users/quan/Documents/personal/Stanford application project/ski_racing/detection.py` → `LiveGateStabilizer.update()`:
   - Returns **stale tracks** as part of its output (unmatched tracks remain visible).
   - On empty detections, it can **return `_last_valid`** (hold-last-valid fallback), guaranteeing ghosts when YOLO drops out.
2. `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`:
   - Draws the stabilizer output as if it were *current detections* and logs `stable_count=len(cached)`.
3. Threshold behavior:
   - Real gates can drop below `conf=0.25` in close/blur frames (e.g., 1571 frame 1377 has top conf ~0.238), producing empty `dets`; the stabilizer then “fills in” with stale output, which becomes visibly wrong as the camera/scene changes.

## Goals / success criteria (accuracy-first)
- Eliminate “ghost gates” (do not draw stale/unconfirmed tracks as real gates).
- Fix close-gate dropouts without reintroducing noisy spawns:
  - Run detection at a low threshold for **updates**,
  - Use a higher threshold for **spawning**.

### Acceptance criteria (verifiable checkpoints)
**Criterion #1 (after Phase 1):**
- For inference calls: `raw_count == 0 ⇒ shown_count == 0` (no stale/held output shown).

**Criteria #2–#4 (after Phase 2A+2B):**
- #2: No “stable > raw” inflation in accuracy-first mode:
  - `shown_count > raw_count` occurs **0 times** (on inference calls).
- #3: Close-gate dropout improved:
  - Known case like `1571_raw` frame `1377` should now show the visible gate again (via low-conf update path), rather than blank or ghosts.
- #4: Manual spot-check:
  - Frames that previously showed circles on skier/snow (e.g. `1575` around frame `498`) should not show those circles unless YOLO actually detects gates there.

## Suggested execution order (explicit checkpoints)
Phase 1 → verify criterion #1 → Phase 2A+2B → verify criteria #2+3+4 → Phase 3 → Phase 4  
(Phase 0 + Phase 2C are optional follow-ups)

---

# Phase 1 — Core fix: stop showing stale/unconfirmed tracks
**Why:** This is the main “unreal gates” fix. It removes ghosts by changing what the stabilizer returns as “shown”.

## Changes
### 1) Update `LiveGateStabilizer` output semantics
File: `/Users/quan/Documents/personal/Stanford application project/ski_racing/detection.py`

**Add per-track state**
- Track fields: `track_id`, `center_x`, `base_y`, `confidence_ema`, `hits`, `stale_calls`.

**Update logic**
- Matched: EMA update position/conf, `hits += 1`, `stale_calls = 0`.
- Unmatched: `stale_calls += 1`.
- Remove: `stale_calls > max_stale_calls` (keep default `max_stale_calls=3`).

**Output policy (accuracy-first)**
- New parameters:
  - `min_hits_to_show=2`
  - `show_stale=False`
  - (Phase 2 adds spawn/display thresholds; Phase 1 can ignore for now)
- `update(dets)` returns only “shown” tracks:
  - `hits >= min_hits_to_show`
  - and `stale_calls == 0` when `show_stale=False`

**Remove/guard hold-last-valid**
- On empty `dets`, do **not** return `_last_valid` in accuracy-first mode:
  - increment `stale_calls`,
  - return shown list (likely empty).

### 2) Update live overlay call sites to use accuracy-first mode
- `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`
  - Instantiate stabilizer with: `LiveGateStabilizer(show_stale=False, min_hits_to_show=2, ...)`
  - Keep existing `count` logging as `raw_count`.
  - Treat returned list length as `shown_count` (can continue using the existing `stable_count` field, but its semantics become “shown_count”).
- `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py`
  - Live mode should draw only the returned list (shown tracks).

## Verification checkpoint (must pass before Phase 2)
Re-run the same 3 videos and confirm **criterion #1**:
- For every inference row in `per_call`: if `count == 0` then `stable_count == 0`.

Recommended command (example output dir):
- `python3 /Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py "/Users/quan/Documents/personal/Stanford application project/eval/gate_live_videos" --gate-model "/Users/quan/Documents/personal/Stanford application project/models/gate_detector_best.pt" --stride 3 --conf 0.25 --iou 0.45 --infer-width 1280 --output-dir "/Users/quan/Documents/personal/Stanford application project/artifacts/outputs/gate_live/accuracy_phase1"`

---

# Phase 2 — Two-threshold detection (2A+2B only)
**Why:** After Phase 1, ghosts are gone but close/blur gates can still drop out (raw becomes empty at `conf=0.25`). This phase fixes the dropout by lowering the detect threshold used for *updates*, while keeping spawning strict.

## Phase 2A — Run YOLO at low conf for candidate detections
Files:
- `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`
- `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py`

Set (live overlay only):
- `detect_conf_low = 0.15`
- `gate_iou = 0.55`

Implementation detail:
- Call detector as: `detect_in_frame(..., conf=detect_conf_low, iou=gate_iou)`

## Phase 2B — Separate “spawn” threshold from “detect/update” threshold
File: `/Users/quan/Documents/personal/Stanford application project/ski_racing/detection.py`

Add stabilizer parameters (used by live overlay call sites):
- `spawn_conf = 0.35` (only detections ≥ 0.35 can spawn new tracks)
- Optional (but simple) `update_conf_min = 0.15` (ignore detections below this entirely; should equal `detect_conf_low`)
- Optional `display_conf = 0.30` (track must have `confidence_ema >= display_conf` to be shown)

Matching semantics:
- Track updates can use detections from the low-conf list (≥ `update_conf_min`).
- New tracks can only be created from detections with `det.confidence >= spawn_conf`.

Keep `min_hits_to_show=2` and `show_stale=False`.

## Verification checkpoint (must pass before Phase 3)
Re-run the 3 videos and verify **criteria #2–#4**:
- #2: `shown_count > raw_count` never occurs on inference calls.
- #3: Close-gate dropout improved (1571 frame 1377 shows the visible gate again).
- #4: Manual spot-check that circles no longer drift onto skier/snow during detector dropouts.

Recommended command (example output dir):
- `python3 /Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py "/Users/quan/Documents/personal/Stanford application project/eval/gate_live_videos" --gate-model "/Users/quan/Documents/personal/Stanford application project/models/gate_detector_best.pt" --stride 3 --conf 0.15 --iou 0.55 --infer-width 1280 --output-dir "/Users/quan/Documents/personal/Stanford application project/artifacts/outputs/gate_live/accuracy_phase2"`

---

# Phase 3 — Apply the same live-overlay policy everywhere
**Why:** Ensure demo overlays match the corrected semantics.

File: `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py`
- In live mode, run YOLO with `conf=0.15`, `iou=0.55`.
- Instantiate `LiveGateStabilizer(show_stale=False, min_hits_to_show=2, spawn_conf=0.35, display_conf=0.30)`.
- Draw only the returned “shown” tracks.

---

# Phase 4 — Tests + scoped defaults (guard against unintended pipeline shifts)
## 4A) Unit tests
Add pytest coverage for `LiveGateStabilizer`:
- `dets=[]` with `show_stale=False` returns `[]`
- `min_hits_to_show=2` prevents first-hit display
- `spawn_conf` prevents spawning low-conf detections
- unmatched tracks are not shown when stale (`stale_calls>0`)

Target test location:
- `/Users/quan/Documents/personal/Stanford application project/tests/test_live_gate_stabilizer.py`

## 4B) Scoped defaults guard (do NOT change pipeline defaults)
Explicit guard per your note:
- Do **not** change defaults in:
  - `/Users/quan/Documents/personal/Stanford application project/ski_racing/pipeline.py`
  - `/Users/quan/Documents/personal/Stanford application project/scripts/process_video.py`
- Keep the threshold changes **scoped to live overlay paths only**:
  - `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`
  - `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py`

(If desired, only update documentation/help text to recommend `0.35/0.55` for pipeline runs, but do not alter defaults.)

---

# Optional follow-ups (deferred)
## Optional Phase 0 — Visual diagnostics (`--draw-raw-boxes`)
Add `--draw-raw-boxes` for debugging; useful for demos but not required for the fix.

## Optional Phase 2C — Candidate tracks
Defer unless Phase 2A+2B still misses gates that never exceed `spawn_conf`. Candidate tracks add complexity; only revisit if needed after Phase 2 verification.
