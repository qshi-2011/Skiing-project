# Evaluation Summary

- Generated: 2026-02-17 12:43:30
- Model: `/Users/quan/Documents/personal/Stanford application project/models/gate_detector_best.pt`
- Git commit: `f3b113c`
- Verdict: **PASS**

## Stage 1 - Holdout Detection Metrics

| Confidence | Precision | Recall | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| 0.25 | 0.4762 | 0.8000 | 0.5970 | 80 | 88 | 20 |
| 0.35 | 0.5571 | 0.7800 | 0.6500 | 78 | 62 | 22 |
| 0.45 | 0.5833 | 0.6300 | 0.6058 | 63 | 45 | 37 |
| 0.55 | 0.6056 | 0.4300 | 0.5029 | 43 | 28 | 57 |

## Stage 2 - Regression Suite

| Video | Gates | Coverage | P90 speed (km/h) | Max speed (km/h) | Max G-force | Max jump (m) | Auto-cal correction | Physics issues |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `2907` | 4 | 0.989 | 201.07 | 11194.37 | 9750.60 | 103.72 | 6.41 | 5 |
| `2909` | 3 | 0.997 | 541.05 | 15332.79 | 19792.57 | 142.13 | 19.54 | 5 |
| `2911` | 3 | 0.968 | 386.82 | 22490.98 | 5667.90 | 208.28 | 11.94 | 5 |
| **Mean** | **3.333** | **0.985** | **376.31** | **16339.38** | **11737.03** | **151.37** | **12.63** | **5.000** |

## Verdict

**PASS**

Reasons:
- No baseline provided; skipped regression delta checks.
