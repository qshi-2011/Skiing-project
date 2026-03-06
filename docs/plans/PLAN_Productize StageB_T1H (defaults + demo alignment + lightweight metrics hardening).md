## Productize StageB_T1H — Presets, Defaults, Metrics, and Memory Sync

### Summary
StageB_T1H meets all locked success criteria (blanks/streak/ghost policy/latency/ratio). Next, we remove the remaining “parameter drift” risk by introducing a **single shared preset source** and making **T1H the default** for:
- `scripts/test_live_gate_detection.py` (eval runner)
- `ski_racing/visualize.py:create_demo_video()` (demo overlays)
- `scripts/process_video.py --demo-video` (demo pipeline output)

We keep stabilizer logic unchanged (no grace-policy changes), and we add one lightweight metric to distinguish “noise blanks” from “spawn-eligible blanks”.

---

### Decisions Locked (from combined feedback)
- Default preset everywhere for live overlay rendering: **`T1H`**.
- Baseline remains available as **`B0`** via explicit preset flags.
- No changes to `LiveGateStabilizer` logic (no changes in `ski_racing/detection.py`).
- Add `max_conf` to `per_call` and compute `blank_spawnable_calls` to separate low-confidence noise from actionable suppression.
- Update **both** memory files:
  - Repo memory: `/Users/quan/Documents/personal/Stanford application project/MEMORY.md`
  - Auto-memory: `/Users/quan/.claude/projects/-Users-quan-Documents-personal-Stanford-application-project/memory/MEMORY.md`

---

### Presets (single source of truth)
Define exactly two presets (stable names used in CLI + JSON):

- **`T1H` (winner / default)**
  - `min_hits_to_show=1`
  - `spawn_conf=0.30`
  - `display_conf=0.30`
  - `stale_conf_decay=0.95`
  - `update_conf_min=0.15`
  - `max_shown_stale_calls=1`
  - `max_stale_calls=3`
  - `match_threshold=130.0`
  - `maha_threshold=3.0`
  - `meas_sigma_px=10.0`
  - `accel_sigma_px=8.0`
  - `alpha=0.4`

- **`B0` (baseline)**
  - same as `T1H` except:
    - `min_hits_to_show=2`
    - `spawn_conf=0.35`
    - `stale_conf_decay=0.85`

---

### API / Interface Changes
1. **New module**
   - Add `/Users/quan/Documents/personal/Stanford application project/ski_racing/live_gate_presets.py`
   - Exports:
     - `LIVE_GATE_STABILIZER_PRESETS: dict[str, dict]`
     - `DEFAULT_LIVE_GATE_PRESET = "T1H"`
     - `get_live_gate_stabilizer_params(preset: str) -> dict` (returns a copy)

2. **Demo video API**
   - Update `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py`
   - Extend `create_demo_video(...)` signature (backward compatible) with:
     - `live_gate_preset: str = DEFAULT_LIVE_GATE_PRESET`
     - `live_gate_params: dict | None = None` (advanced override)
   - Behavior: if `gate_model_path` is provided, instantiate stabilizer from preset+override; else unchanged.

3. **Process-video CLI**
   - Update `/Users/quan/Documents/personal/Stanford application project/scripts/process_video.py`
   - Add `--live-gate-preset {T1H,B0}` default `T1H`
   - Pass to `create_demo_video(..., live_gate_preset=args.live_gate_preset, ...)`
   - Scope: affects only `--demo-video` overlays; does not alter pipeline analysis output.

4. **Eval-runner CLI**
   - Update `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`
   - Add `--preset {T1H,B0}` default `T1H`
   - Change stabilizer flag defaults to `None` so preset supplies defaults; explicit flags override preset per-field.

5. **Output schema additions**
   - Per-video summary JSON (`*_live_gates_summary.json`):
     - `params.preset` (string, `T1H` or `B0`)
     - `per_call[*].max_conf` (float; 0.0 if no dets)
     - `stabilizer_quality.blank_spawnable_calls` (int)
   - Run summary JSON (`run_summary.json`):
     - include `blank_spawnable_calls` per video
   - Analysis report markdown:
     - add a column for `blank_spawnable_calls` (or add a short line under the table; choose one and keep stable)

---

### Implementation Steps (decision-complete, in order)

#### Step 1 — Shared presets module
- Create `/Users/quan/Documents/personal/Stanford application project/ski_racing/live_gate_presets.py` with:
  - the two preset dicts above
  - strict validation (raise `ValueError` on unknown preset)

#### Step 2 — Align demo overlay stabilizer defaults (visualize.py)
- Edit `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py`:
  - Import preset helper(s)
  - Replace the hard-coded `LiveGateStabilizer(...)` block at `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py:58` with:
    - `params = live_gate_params if provided else get_live_gate_stabilizer_params(live_gate_preset)`
    - `live_stabilizer = LiveGateStabilizer(show_stale=False, **params)`
  - Keep existing stable coloring priority (`track_id → class → gate_id → fallback`), already correct.

#### Step 3 — Expose preset on process_video demo path
- Edit `/Users/quan/Documents/personal/Stanford application project/scripts/process_video.py`:
  - Add argparse flag `--live-gate-preset` (choices `T1H`, `B0`, default `T1H`)
  - Pass through to `create_demo_video()` at `/Users/quan/Documents/personal/Stanford application project/scripts/process_video.py:264`

#### Step 4 — Make eval runner default to T1H + preset overrides
- Edit `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`:
  - Add argparse flag `--preset` (choices `T1H`, `B0`, default `T1H`)
  - Change all stabilizer param flags to `default=None`
  - Build resolved `stabilizer_params` as:
    1) `params = get_live_gate_stabilizer_params(args.preset)`
    2) for each CLI param where arg is not `None`, overwrite `params[key]`
  - Record `params.preset = args.preset` in each per-video summary JSON

#### Step 5 — Add `max_conf` + `blank_spawnable_calls` (and audit call sites)
- In `run_one()` inside `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`, in the inference-call logging block where `dets` exists (same place `mean_conf` is computed):
  - compute `max_conf` from raw `dets` (before stabilizer effects), write into `call_rows`
- Update `_compute_stabilizer_quality` in `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py:88`:
  - Option A (preferred for minimal churn): keep signature `_compute_stabilizer_quality(call_rows, spawn_conf: float)`
  - Compute `blank_spawnable_calls = count(raw>0 && shown==0 && max_conf>=spawn_conf)`
- Update all call sites (audit is trivial: only `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py:402`)
- Thread the new metric into:
  - per-video summary JSON (`stabilizer_quality`)
  - `run_summary.json` rows
  - `analysis_report_<tag>.md`

#### Step 6 — Update documentation + memory (both files)
- Update repo memory: `/Users/quan/Documents/personal/Stanford application project/MEMORY.md`
  - Add explicit statement: default preset is now `T1H` for live overlays.
  - Add explicit baseline reproduction commands (`--preset B0`, `--live-gate-preset B0`).
  - Record that Wave2A included B0/T1/T2/T3 outputs (T2 exists at `eval/test_videos_result_2026-03-05_wave2a/T2`), and StageB winner is `T1H`.
- Update auto-memory (persistent): `/Users/quan/.claude/projects/-Users-quan-Documents-personal-Stanford-application-project/memory/MEMORY.md`
  - Replace/override stale “accuracy-first semantics” section that currently claims B0 as default.
  - Preserve the “do not change pipeline defaults” warning, but clarify:
    - pipeline analysis behavior unchanged
    - only demo overlays + eval runner defaults changed
- (Optional but recommended) Update `/Users/quan/Documents/personal/Stanford application project/docs/plans/PLAN_Productize StageB_T1H (defaults + demo alignment + lightweight metrics hardening).md` so it matches this final plan and points to the correct auto-memory path.

---

### Tests / Verification
1. Unit + smoke tests (fast):
   - `python3 -m unittest discover -s tests -p 'test_live_gate_stabilizer.py'`
   - `python3 -m unittest discover -s tests -p 'test_smoke_entry_points.py'`
   - `python3 -m pytest -q tests/test_visualize.py`
2. Eval runner smoke (1 real video, validates new fields):
   - Run `scripts/test_live_gate_detection.py` on one known video with defaults (T1H) and confirm:
     - `*_live_gates_summary.json` contains `params.preset`, `per_call[*].max_conf`, and `stabilizer_quality.blank_spawnable_calls`
     - `run_summary.json` includes `blank_spawnable_calls`
     - report includes the metric (table column or note)
   - Re-run same video with `--preset B0` to confirm the toggle is real.
3. Manual QA (targeted, based on combined feedback):
   - Spot-check `30_1752484596(原视频)` ghost frames (708, 735, 813, 858) in the StageB overlay to confirm they’re isolated and visually acceptable.

---

### Explicit Non-Goals
- No changes to `LiveGateStabilizer` logic (no “grace display floor” changes).
- No new sweeps; StageB is already validated.
- No changes to pipeline detection/tracking output—only live overlay defaults and reporting.
