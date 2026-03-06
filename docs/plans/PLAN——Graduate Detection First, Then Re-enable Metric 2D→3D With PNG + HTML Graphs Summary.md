# Next Program: Graduate Detection First, Then Re-enable Metric 2D→3D With PNG + HTML Graphs

## Summary
- The current source of truth is [pipeline.py](/Users/quan/Documents/personal/Stanford application project/ski_racing/pipeline.py), [sprint_metrics.md](/Users/quan/Documents/personal/Stanford application project/docs/sprint_metrics.md), [MEMORY.md](/Users/quan/Documents/personal/Stanford application project/MEMORY.md), and the StageB productization plan at [PLAN_Productize StageB_T1H (defaults + demo alignment + lightweight metrics hardening).md](/Users/quan/Documents/personal/Stanford application project/docs/plans/PLAN_Productize StageB_T1H (defaults + demo alignment + lightweight metrics hardening).md). The older high-level docs like [Alpine_Skiing_AI_Consolidated_Action_Plan.md](/Users/quan/Documents/personal/Stanford application project/docs/Alpine_Skiing_AI_Consolidated_Action_Plan.md) and [TODO.md](/Users/quan/Documents/personal/Stanford application project/docs/TODO.md) are background only; they still assume 3D is active, but the codebase does not.
- StageB_T1H productization is successful as a productization step: preset drift is removed, demo/eval defaults align, and `blank_spawnable_calls` now separates “detector saw something good enough to spawn” from pure low-confidence noise. Live overlay behavior is materially better than `B0`.
- StageB does not unblock 3D by itself. The latest formal gate I found is still below the repo target: the active single-model holdout is `F1=0.767` at `conf=0.35`, and the best ensemble holdout is `F1=0.802` at `conf=0.36`, both below the Phase 3 target in [sprint_metrics.md](/Users/quan/Documents/personal/Stanford application project/docs/sprint_metrics.md). Because you chose the formal gate, the next program is detection graduation, not 3D implementation.

## Phase Order
1. Detection graduation.
2. Formal gate review.
3. Metric 2D→3D re-enable.
4. Physics/report reactivation.

## Claude Team Structure
- `Manager agent`: owns baseline capture, dispatch, merge order, and final PASS/FAIL decisions.
- `Detection agent A`: mines failures and produces the curation plan.
- `Detection agent B`: runs retraining, threshold calibration, and promotion evaluation.
- `Detection agent C`: protects StageB_T1H live-overlay behavior with frozen smoke/regression runs.
- `3D agent A`: implements metric BEV export and timestamp integration.
- `3D agent B`: implements static PNG and interactive HTML graph outputs.
- `3D agent C`: re-enables physics/report integration.
- Only the first four agents run initially. No 3D branch is allowed to merge before the detection gate passes.

## Phase 1: Detection Graduation
### Objective
- Reach the repo’s formal Phase 3 gate without losing the current StageB_T1H live-overlay stability.

### Locked acceptance gate
- Holdout `F1 >= 0.85` on the canonical holdout split at the promoted operating threshold.
- `scripts/run_eval.py` returns PASS with no Stage 2 metric degradation greater than 20% vs baseline.
- Live-overlay guardrail PASS on frozen smoke videos: `blank_spawnable_calls`, `ghost_calls`, and `max_blank_streak` may not increase by more than `1` absolute call per video versus the current T1H baseline; `avg_infer_ms` may not regress by more than `15%`.
- If two full retrain/eval cycles still miss `F1 >= 0.85`, stop code tuning and switch to a data-only cycle focused on the top recurring FN/FP patterns.

### Agent assignments
- `Manager agent`: freeze the baseline from [outputs/final_holdout_eval.json](/Users/quan/Documents/personal/Stanford application project/outputs/final_holdout_eval.json), [outputs/final_holdout_eval_check.json](/Users/quan/Documents/personal/Stanford application project/outputs/final_holdout_eval_check.json), [run_summary.json](/Users/quan/Documents/personal/Stanford application project/eval/test_videos_result_2026-03-05_stageB_T1H/run_summary.json), and [run_summary.json](/Users/quan/Documents/personal/Stanford application project/eval/smoke_stageb_t1h_default/run_summary.json). Publish `docs/reports/detection_graduation_baseline_<date>.md`.
- `Detection agent A`: mine the holdout failures and publish `docs/reports/detection_gap_report_<date>.md` with the top 10 FN patterns, top 10 FP patterns, and exact source frames/dataset rows to fix.
- `Detection agent B`: run retraining/calibration only against the canonical holdout and regression harness. Output `reports/holdout_eval_<date>_candidate.json`, `docs/reports/eval_<stamp>/summary.md`, and a promotion recommendation.
- `Detection agent C`: rerun `scripts/test_live_gate_detection.py` with `--preset T1H` on `1571_raw`, `1575_raw`, and `IMG_1310`, then compare against the current T1H baselines. Output `eval/gate_live_regression_<stamp>/run_summary.json` and `analysis_report_<tag>.md`.
- Merge order is fixed: failure mining, then training/eval changes, then live-regression protection, then manager-only promotion and registry update.

### Expected outputs
- `docs/reports/detection_graduation_baseline_<date>.md`
- `docs/reports/detection_gap_report_<date>.md`
- `reports/holdout_eval_<date>_candidate.json`
- `docs/reports/eval_<stamp>/summary.md`
- optional promotion update in [MODEL_REGISTRY.md](/Users/quan/Documents/personal/Stanford application project/shared/docs/MODEL_REGISTRY.md) and `models/gate_detector_best.pt`
- `eval/gate_live_regression_<stamp>/run_summary.json`

## Phase 2: Formal Gate Review
- The `Manager agent` alone decides PASS/FAIL.
- PASS unlocks 3D.
- FAIL keeps 3D blocked and opens one more detection-only cycle using the published gap report.

## Phase 3: Metric 2D→3D + Graph Outputs
### Objective
- Re-enable metric bird’s-eye output only after detection graduation, and ship both a static PNG and an interactive HTML graph for every processed video.

### Locked technical decisions
- The first production 3D release uses the scale-based metric BEV path, not full static homography.
- Exact frame deltas from [sidecar_pts.schema.json](/Users/quan/Documents/personal/Stanford application project/shared/interfaces/sidecar_pts.schema.json) are used when available; constant FPS is only the fallback.
- Keep `trajectory_3d` as the existing list contract: `[{frame, x, y}]` in meters.
- Do not reuse [per_frame_bev.schema.json](/Users/quan/Documents/personal/Stanford application project/shared/interfaces/per_frame_bev.schema.json) for metric output; that schema is explicitly relative/topological. Add a new metric schema instead.
- Static graph stack: `matplotlib`. Interactive graph stack: `plotly`.

### Public API / interface changes
- `scripts/process_video.py`: add `--pts-sidecar`, `--pts-sidecar-dir`, and `--summary-html`.
- `SkiRacingPipeline.process_video(...)`: add `pts_sidecar_path: str | None = None`.
- `analysis.json`: re-enable `trajectory_3d` and `physics_validation`; add `trajectory_3d_diagnostics` with `projection_mode`, `dt_source`, `dynamic_scale_used`, and `jump_guard_info`; add `artifacts.summary_html`.
- New schema: `shared/interfaces/per_frame_metric_bev.schema.json` with `clip_id`, `video`, `dt_source`, and per-frame `delta_t_s`, `skier_position_m`, `gate_positions_m`, `ppm_y`, `projection_quality`, `jump_guard_applied`.

### Agent assignments
- `3D agent A`: implement timestamp-aware metric BEV export and publish `<video_stem>_metric_bev.json`.
- `3D agent B`: extend [visualize.py](/Users/quan/Documents/personal/Stanford application project/ski_racing/visualize.py) with HTML generation and upgrade the PNG summary to show metric BEV, speed, jump markers, and physics summary when 3D is enabled.
- `3D agent C`: re-enable `physics_validation` from the metric BEV output and wire the restored metrics back into [run_eval.py](/Users/quan/Documents/personal/Stanford application project/scripts/run_eval.py).

### Expected outputs
- `artifacts/outputs/<video>_metric_bev.json`
- `artifacts/outputs/<video>_summary.png`
- `artifacts/outputs/<video>_summary.html`
- updated `analysis.json` with real `trajectory_3d` and `physics_validation`
- updated `docs/reports/eval_<stamp>/summary.md` with restored speed/G/jump metrics

## Required Tests
- Detection phase:
  - `python3 -m py_compile` on modified Python files.
  - `python3 -m unittest discover -s tests -p 'test_live_gate_stabilizer.py'`
  - `python3 -m unittest discover -s tests -p 'test_smoke_entry_points.py'`
  - `python3 -m pytest -q tests/test_visualize.py`
  - `python3 scripts/run_eval.py --model models/gate_detector_best.pt --baseline <baseline_json> --min-f1 0.85`
  - `python3 scripts/test_live_gate_detection.py eval/gate_live_videos --gate-model models/gate_detector_best.pt --preset T1H --output-dir eval/gate_live_regression_<stamp>`
- 3D phase:
  - `python3 -m pytest -q tests/test_transform_guards.py`
  - `python3 -m unittest discover -s tests -p 'test_physics.py'`
  - extend [test_visualize.py](/Users/quan/Documents/personal/Stanford application project/tests/test_visualize.py) with HTML artifact checks and enabled-3D graph checks
  - add `tests/test_metric_bev_schema.py` validating the new metric schema with `jsonschema`
  - add `tests/test_process_video_3d_reenable.py` verifying `trajectory_3d` and `summary.html` are produced when a sidecar is supplied
  - run `scripts/process_video.py <sample_video> --summary --summary-html --pts-sidecar <sidecar>` and verify all artifacts exist
  - rerun `scripts/run_eval.py` after physics reactivation and confirm Stage 2 metrics are numeric again, not zero-by-sentinel

## Assumptions and Defaults
- Detection remains the mainline until the formal gate passes.
- The first 3D release is metric bird’s-eye reconstruction, not full volumetric 3-axis reconstruction.
- Both PNG and HTML graphs are required in the first 3D milestone.
- Older project-plan docs remain useful for vision and narrative, but not for execution decisions.
