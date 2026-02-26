# Evaluation Summary

- Generated: 2026-02-15 11:17:01
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
| `2907` | 7 | 0.989 | 1146.69 | 209214.50 | 20328.02 | 1938.43 | 49.55 | 5 |
| `2909` | 4 | 0.997 | 1679.64 | 55860.65 | 81421.94 | 517.80 | 48.38 | 5 |
| `2911` | 5 | 0.968 | 1589.81 | 83856.45 | 58270.77 | 776.55 | 61.01 | 5 |
| **Mean** | **5.333** | **0.985** | **1472.05** | **116310.53** | **53340.25** | **1077.59** | **52.98** | **5.000** |

## Verdict

**PASS**

Reasons:
- No baseline provided; skipped regression delta checks.
