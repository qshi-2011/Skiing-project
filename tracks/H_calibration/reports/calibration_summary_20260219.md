# Track H Calibration Summary

Date: 20260219

## Baseline

Proxy GT note: full labelled eval-track GT is unavailable in this workspace.
Calibration uses Track D's documented proxy protocol: fixed-dt tracker output as GT anchor, dynamic output as prediction.

- Baseline IDF1: 0.5368
- Baseline HOTA: 0.7856
- Baseline jitter: 1.7735
- Baseline topological ordering error: 0.0517

## Calibrated Parameters

| Parameter | Selected | 95% CI | Calibration mode |
|---|---:|---:|---|
| alpha_max | 0.30 | [0.30, 0.30] | sweep (proxy-tracking metrics) |
| N_req | 2 | [2.00, 2.00] | sweep (proxy-tracking metrics) |
| rolling shutter +buffer (deg) | 8.0 | [2.0, 8.0] | sweep (proxy-tracking metrics) |
| tau_kp | 0.50 | [0.50, 0.50] | sweep (proxy-tracking metrics) |
| T_min | 3 | [3.00, 3.00] | sweep (sequence-init objective) |
| FIFO depth | 45 | [45.00, 45.00] | sweep (sequence-init objective) |
| tau_seq | -3.00 | [-3.00, -3.00] | sweep (sequence-init objective) |
| EIS threshold | 0.050 | [0.050, 0.050] | sweep (eis_jump clip labels) |
| Stability window N | 5 | [5.00, 5.00] | sweep (eis_jump clip labels) |
| confidence_floor | -2.00 | [-4.00, -2.00] | sweep (S* vs degraded proxy labels) |

## Analytical / Verify-only

- Rolling-shutter theta remains analytical: `theta = arctan(vx * tr / H)` (not learned).
- Pan discriminator verification (>=3 frames pan suppression): consistency ratio 1.000.

## HMM Learning

- Transition matrix A: `tracks/H_calibration/outputs/hmm_A_20260219.json`
- Emission model B: `tracks/H_calibration/outputs/hmm_B_20260219.json`
- Flat-light confidence degradation detected: True
- Recommendation: Down-weight appearance priors in Track D and Track F for flat-light clips (e.g., 0.5x).

## Data Gaps / Recommendations

- No fully labelled per-frame GT tracks were available for the 8-clip eval split.
  Recommendation: annotate persistent track IDs and true gate colours for all eval clips to replace proxy GT calibration.
- Emission model B currently uses proxy true-state labels derived from dominant detections.
  Recommendation: collect explicit red/blue frame-level truth to estimate true confusion matrix and calibrated Beta CDFs.
- `configs/tracker_v2_calibrated.yaml` and `shared/docs/MODEL_REGISTRY.md` were not modified due this run's write-scope constraint.
  In-track calibrated config is saved at `tracks/H_calibration/configs/tracker_v2_calibrated.yaml`.
