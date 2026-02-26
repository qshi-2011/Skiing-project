# Track H — Data-Driven Calibration (Wave 4, Worker D)

## Owner
Wave 4, Worker D

## Starts after
Tracks D, E (full integration), F, and G are ALL passing their acceptance criteria. This track runs last within Wave 4.

## You may READ from
- Full running pipeline (all tracks)
- `tracks/A_eval_harness/` — metric harness and frozen evaluation split
- `shared/interfaces/` — all three schemas (read only)
- `shared/docs/MODEL_REGISTRY.md` — existing model provenance records

## You may WRITE to
- `tracks/H_calibration/` — all calibration outputs and reports
- `shared/docs/MODEL_REGISTRY.md` — update with calibrated threshold versions
- `configs/` — update threshold config files with learned values

## Your job
Implement Phase 7 of the v2.1 spec. Replace every TBD and hand-tuned prior in the threshold registry with data-driven values.

**Learn (run on validated dataset via metric harness)**:
- HMM transition matrix A and emission matrix B
- `alpha_max` (VP EMA weight, currently 0.7)
- `N_req` (VP inlier minimum, currently 3)
- `+5° rolling shutter buffer` (currently 5°)
- `EIS jump threshold` (delta2_eis threshold, currently TBD)
- `N` stability window for exiting DEGRADED mode (currently TBD)
- `tau_seq` initialisation score threshold (currently TBD)
- `tau_kp` keypoint confidence threshold (currently TBD)

**Do NOT learn (analytical — leave as derived)**:
- Rolling shutter theta = arctan(vx * tr / H). This is physics. Do not fit it.

**Profile**:
- Detector confusion matrix under motion blur and flat-light snow conditions. Use results to recommend updated colour prior weights for Track D (Kalman cost matrix) and Track F (HMM emission model).

**Deliverable** — A calibration report in `tracks/H_calibration/reports/` containing:
- Final value for every parameter, with 95% confidence interval
- Any parameter that cannot be estimated from available data must be flagged explicitly with a recommended data collection strategy (do not invent a value)
- Updated `configs/` files with all TBDs replaced

## Acceptance criteria
- Every TBD in `tracker_spec_v2.docx` Section 7 (Threshold Registry) has a corresponding entry in the calibration report with a confidence interval.
- No parameter is listed as "TBD" without an explicit data collection recommendation.
- The metric harness score (IDF1, HOTA) improves vs. hand-tuned priors on the held-out evaluation split.
