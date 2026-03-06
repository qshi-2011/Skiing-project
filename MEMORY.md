# Project Memory

## 2026-03-06 - Detection graduation cycle1 formal review

Phase 2 formal gate review verdict: `HOLD`. Phase 3 / 3D remains blocked.

- Corrected holdout result improved to `F1=0.8176` (ensemble, `conf=0.36`) on
  73 GT instances after removing one start-gate label and two sub-10px boxes
  from the frozen test split.
- Single-model holdout remains lower at `F1=0.7671` (`conf=0.35`).
- Live-overlay T1H guardrail behavior on `1571_raw`, `1575_raw`, and
  `IMG_1310` did not regress in `blank_spawnable_calls`, `ghost_calls`, or
  `max_blank_streak`.
- Cycle1 timing regression was attributed to concurrent training load and was
  not used as a blocker because the model and behavioral metrics were
  unchanged.
- Next cycle should be data-only: add hard negatives for safety netting and
  gate shadows, plus more thin/distant/edge-clipped gate positives. Do not
  start 3D work and do not spend another cycle retraining unchanged data.

## 2026-03-05 - StageB_T1H productized defaults

Default live-gate preset is now `T1H` for live overlay rendering.

Preset `T1H` (winner, default):
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

Preset `B0` (baseline reproduction):
- same as `T1H` except `min_hits_to_show=2`, `spawn_conf=0.35`, `stale_conf_decay=0.85`

Applied default scope:
- `scripts/test_live_gate_detection.py` uses `--preset T1H` by default.
- `ski_racing/visualize.py:create_demo_video()` defaults to `live_gate_preset="T1H"`.
- `scripts/process_video.py --demo-video` uses `--live-gate-preset T1H` by default.
- Pipeline analysis behavior is unchanged; this only affects live overlays + eval runner defaults.

Baseline reproduction commands:
```bash
# Eval runner with baseline preset
python3 scripts/test_live_gate_detection.py <inputs...> \
  --gate-model models/gate_detector_best.pt \
  --output-dir <out_dir> \
  --preset B0

# Demo overlay path with baseline preset
python3 scripts/process_video.py <video_or_dir> \
  --gate-model models/gate_detector_best.pt \
  --demo-video \
  --live-gate-preset B0
```

Wave2A/StageB lineage:
- Wave2A artifacts include `B0`, `T1`, `T2`, `T3` outputs under `eval/test_videos_result_2026-03-05_wave2a/`.
- Confirmed path example: `eval/test_videos_result_2026-03-05_wave2a/T2`.
- StageB winner output: `eval/test_videos_result_2026-03-05_stageB_T1H`.
- Run summary: `eval/test_videos_result_2026-03-05_stageB_T1H/run_summary.json`
- Auto report: `eval/test_videos_result_2026-03-05_stageB_T1H/analysis_report_StageB_T1H.md`
