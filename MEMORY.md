# Project Memory

## 2026-03-05 - Kalman Live Gate Stabilization winner

Winning stabilizer parameters (Wave 2, Stage B validated):
- `min_hits_to_show=1`
- `spawn_conf=0.30`
- `display_conf=0.30`
- `stale_conf_decay=0.95`
- `match_threshold=130.0` (unchanged)
- `maha_threshold=3.0` (unchanged)
- `update_conf_min=0.15`
- `max_shown_stale_calls=1`
- `max_stale_calls=3`
- `meas_sigma_px=10.0`
- `accel_sigma_px=8.0`
- `alpha=0.4`

Where applied:
- `scripts/test_live_gate_detection.py`
  - `main()`: CLI flags are collected into `stabilizer_params`.
  - `run_one()`: `LiveGateStabilizer(show_stale=False, **stabilizer_params)`.

Golden run reference:
- Output directory: `eval/test_videos_result_2026-03-05_stageB_T1H`
- Run summary: `eval/test_videos_result_2026-03-05_stageB_T1H/run_summary.json`
- Auto report: `eval/test_videos_result_2026-03-05_stageB_T1H/analysis_report_StageB_T1H.md`
