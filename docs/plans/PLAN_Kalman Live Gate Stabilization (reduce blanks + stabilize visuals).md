# Next Steps Plan — Kalman Live Gate Stabilization (Blanks + Visual Stability)

## Summary
We’ll ship a “Wave 2” improvement focused on the two quantified issues from the Kalman run:

1) **Large blank segments** (`raw>0, shown=0`) — currently 136 blank calls and long streaks (e.g., 19-call blank).
2) **Grace defeated by decay** — `stale_conf_decay` + `display_conf` can hide tracks even when `max_shown_stale_calls=1` would allow them.
3) **Overlay color flicker** — fix by coloring **stably by `track_id`** (per your preference).

We’ll do this with:
- minimal rendering fixes,
- better auto-metrics in `run_summary.json`,
- CLI parameterization + a disciplined small sweep on the 2 worst videos,
- a clearly defined fallback path for the “Blank Type B” case (KF drift/respawn churn).

---

## Goals & Success Criteria (locked)

### Primary goal: reduce blanking (production readiness blocker)
Definitions (per inference call, not per-frame):
- **Blank call**: `raw_count > 0 && shown_count == 0`
- **Ghost call**: `raw_count == 0 && shown_count > 0`
- **Streak**: consecutive inference calls satisfying the condition

Success criteria on the **full 11-video run**:
- Total `blank_calls` **≤ 70** (from 136).
- Per-video `max_blank_streak` **≤ 8** (from worst 19; 8 calls ≈ 24 frames ≈ 0.4s at 60fps, stride=3).
- Worst-case median shown/raw ratio improves: `shown_p50 / raw_p50 ≥ 0.65` for every video (from 0.55 on `长城岭12.12`).

### Hard constraints to preserve
- `max_ghost_streak ≤ 1` (policy guarantee).
- Latency: keep `p95_infer_ms ≤ 70ms` (current ≤ 62ms).

### Demo UX constraint
- No red/blue “popping” due to ordering changes: point color must be stable for a given `track_id`.

---

## Deliverable A — Fix overlay color flicker (stable by `track_id`)
**Files**
- `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`
- `/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py`

**Change**
- Choose circle color using `track_id % 2` (even→red, odd→blue) whenever `track_id` exists.
- Preserve existing fallback behavior when `track_id` is missing (non-live / legacy paths).

**Acceptance**
- Scrub any overlay video: if a gate’s `track_id` is stable, its color must never flip.

---

## Deliverable B — Add stabilizer quality metrics into `run_summary.json` (+ auto-report)
**File**
- `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`

### B1) Per-video computed metrics (from `per_call`)
Add a new per-video section (and mirror key fields into each row of `run_summary.json`):

Required fields:
- `blank_calls`: count of calls where `count > 0 && shown_count == 0`
- `max_blank_streak`: max consecutive blank calls
- `ghost_calls`: count of calls where `count == 0 && shown_count > 0`
- `max_ghost_streak`: max consecutive ghost calls
- `shown_stats`: `{min, p50, max, mean}` over `shown_count`
- `raw_stats`: keep existing but ensure `{p50, mean}` are present
- `shown_raw_ratio_p50`: `shown_p50 / max(raw_p50, 1)`
- `miss_after_det_blank`: count of events where:
  - previous call: `count>0 && shown>0`
  - current call: `count==0 && shown==0`
  (directly measures “1-miss grace defeated by decay/display floor”)

### B2) Auto-generated markdown report per run dir
Write a report file in `--output-dir` that includes the config shortname so Stage A outputs diff cleanly:
- Filename: `analysis_report_<tag>.md` where `<tag>` defaults to the output directory basename (e.g., `analysis_report_T1.md` if output dir ends in `T1`).
- Contents:
  - per-video metrics table (calls/raw_p50/shown_p50/blank/ghost/avg_ms/p95_ms)
  - “Notable frames” section:
    - ghost frame indices
    - the worst blank streak segment (start/end frames) per video

**Acceptance**
- After any run, `run_summary.json` contains blank/ghost metrics for every video.
- Stage A run dirs contain `analysis_report_<tag>.md` without manual recomputation.

---

## Deliverable C — CLI flags + subset runs without directory hacks
**File**
- `/Users/quan/Documents/personal/Stanford application project/scripts/test_live_gate_detection.py`

### C1) Inputs: support multiple paths in one invocation
- Change positional input argument to `inputs` with `nargs='+'`.
- Each entry can be either:
  - a video file, or
  - a directory (scan for video extensions inside).
- Deduplicate videos; process in stable sorted order.

### C2) Stabilizer params exposed as CLI flags
Add flags (defaults reflect current run values unless noted):
- `--min-hits-to-show` (default `2`)
- `--spawn-conf` (default `0.35`)
- `--display-conf` (default `0.30`)
- `--update-conf-min` (default `0.15`)
- `--stale-conf-decay` (default `0.85`)
- `--max-shown-stale-calls` (default `1`)
- `--max-stale-calls` (default `3`)
- `--match-threshold` (default `130.0`)
- `--maha-threshold` (default `3.0`)
- `--meas-sigma-px` (default `10.0`)
- `--accel-sigma-px` (default `8.0`)
- `--alpha` (default `0.4`, confidence EMA only)
- Optional: `--run-tag` (string; default derived from output dir basename; used in report filename + embedded into summaries)

Also ensure these are written into each per-video `params` dict so runs are self-describing.

---

## Parameter Sweep (updated per your caveats)

### Why we sweep only 3 levers first
We isolate the two confirmed root causes:
- **Spawn dead zone** → lower `spawn_conf`.
- **Grace defeated by decay/display floor** → raise `stale_conf_decay` and reduce `display_conf`.

We deliberately hold constant in Wave 2A:
- `match_threshold=130`, `maha_threshold=3.0`, `min_hits_to_show=2` (avoid confounds).

### Stage A — Subset sweep on the 2 worst videos (single command per config)
Inputs:
- `eval/test_videos/mmexport1704088159935.mp4`
- `eval/test_videos/长城岭12.12(原视频).mp4`

Run these configs first:
- **B0 baseline**: `spawn=0.35, display=0.30, decay=0.85`
- **T1 preferred**: `spawn=0.25, display=0.27, decay=0.95`
- **T3 conservative**: `spawn=0.30, display=0.27, decay=0.95`

**T2 is conditional (skip unless needed):**
- **T2 more-recall**: `spawn=0.25, display=0.25, decay=0.95`
Only run T2 if **both** T1 and T3 fail to substantially reduce blanking on `mmexport1704088159935` (i.e., `max_blank_streak` still > 10 or `blank_calls` barely moves).

**Stage A selection rule**
Pick the winner by:
1) minimize `max_blank_streak`, then
2) minimize `blank_calls`,
while enforcing:
- `max_ghost_streak ≤ 1` (must),
and as tie-breaker:
- maximize `shown_raw_ratio_p50`.

### Caveat handling: Blank Type B (e.g., `长城岭12.12` mean_conf ≥ spawn_conf)
We explicitly acknowledge this may not be fixed by spawn/decay/display alone.

Decision rule after Stage A:
- If `长城岭12.12(原视频)` still has `max_blank_streak > 8` **even under the Stage A winner**, run a targeted Wave 2B lever test on that video (and optionally `IMG_1478`):

**T1H (Type-B fallback)**
- `min_hits_to_show=1`
- `spawn_conf=0.30`
- `display_conf=0.30`
- `stale_conf_decay=0.95`

Rationale:
- Removes the “2-hit warmup penalty” during respawn churn, but keeps a conservative confidence floor so we don’t simply show every low-confidence spawn.

If T1H materially reduces `长城岭12.12` blank streak without increasing ghosts, it becomes the candidate for Stage B; otherwise we keep the Stage A winner and defer Type-B fixes to a later wave (where we’d consider match gating / motion-model refinements).

### Stage B — Full 11-video validation
Run the chosen config on:
- directory input: `eval/test_videos/`

---

## Stage B Failure Recovery (explicit mapping)
If Stage B fails, take exactly one corrective iteration:

1) If **blank_calls > 70** OR any video has **max_blank_streak > 8**:
- Lower `display_conf` by **−0.02** (floor `0.23`) and rerun Stage B **only once**.
  - If the failing video is clearly Type B (mean_conf is high but blank streak persists), prefer running **T1H** instead of lowering `display_conf` globally.

2) If **max_ghost_streak > 1**:
- Treat as a bug/regression in stale-call logic (since policy should enforce this). Fix logic before re-running; do not “tune around” it.

3) If only **shown_raw_ratio_p50** fails for one video (but blanks/ghosts are within targets):
- Investigate that video specifically (likely Type B). Run T1H for that video before touching global thresholds.

---

## Documentation/Memory (explicitly added)
After Stage B confirms the winning parameters:
- Create or update `/Users/quan/Documents/personal/Stanford application project/MEMORY.md` with:
  - date (2026-03-05),
  - winning stabilizer params (`spawn_conf`, `display_conf`, `stale_conf_decay`, `min_hits_to_show`, plus `match_threshold/maha_threshold` if unchanged),
  - where they are applied (which scripts / functions),
  - the output directory of the “golden” run to reference.

(There is currently no `MEMORY.md` in the repo; this step creates the source of truth so future sessions don’t drift back to old defaults.)

---

## Testing & Verification Checklist
1) Unit tests: `python3 -m unittest discover -s tests -p 'test_live_gate_stabilizer.py'`
2) CLI sanity: run on a single video with `inputs` syntax and ensure it writes:
   - overlay mp4,
   - summary json with new metrics,
   - run_summary with new metrics,
   - `analysis_report_<tag>.md`.
3) Stage A subset sweep: verify the metrics improve as expected (especially `max_blank_streak`).
4) Stage B full run: verify all success criteria + visually spot-check known worst segments:
   - `mmexport1704088159935` frames `1059–1113`
   - `长城岭12.12(原视频)` frames `738–771`

---

## Assumptions (locked)
- We do not change the Kalman math, association algorithm, or the 1-miss policy in this wave.
- We accept “Balanced” tradeoff: blanks must drop substantially, but we won’t accept multi-call ghost streaks or major latency regressions.
