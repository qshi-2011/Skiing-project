# Evaluation Summary

- Generated: 2026-03-06 07:54:10
- Model: `/Users/quan/Documents/personal/Stanford application project/models/gate_detector_best.pt`
- Git commit: `c337845`
- Baseline: `/Users/quan/Documents/personal/Stanford application project/tracks/E_evaluation_ci/reports/baseline_regression.json`
- Verdict: **FAIL**

## Stage 1 - Holdout Detection Metrics

| Confidence | Precision | Recall | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| 0.25 | 0.7403 | 0.7808 | 0.7600 | 57 | 20 | 16 |
| 0.35 | 0.8000 | 0.7671 | 0.7832 | 56 | 14 | 17 |
| 0.45 | 0.7778 | 0.5753 | 0.6614 | 42 | 12 | 31 |
| 0.55 | 0.8286 | 0.3973 | 0.5370 | 29 | 6 | 44 |

## Stage 2 - Regression Suite

| Video | Gates | Coverage | P90 speed (km/h) | Max speed (km/h) | Max G-force | Max jump (m) | Auto-cal correction | Physics issues |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `2907` | 14 | 0.964 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| `2909` | 26 | 0.823 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| `2911` | 24 | 0.819 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| **Mean** | **21.333** | **0.869** | **0.00** | **0.00** | **0.00** | **0.00** | **1.00** | **0.000** |

## Delta vs Baseline

| Metric | Baseline | Current | Delta | Delta % |
|---|---:|---:|---:|---:|
| Gates detected | 5.3333 | 21.3333 | +16.0000 | +300.00% |
| Trajectory coverage | 0.9382 | 0.8688 | -0.0694 | -7.40% |
| P90 speed (km/h) | 22.6881 | 0.0000 | -22.6881 | -100.00% |
| Max speed (km/h) | 1516.5969 | 0.0000 | -1516.5969 | -100.00% |
| Max G-force | 847.8746 | 0.0000 | -847.8746 | -100.00% |
| Max jump (m) | 14.3502 | 0.0000 | -14.3502 | -100.00% |
| Auto-cal correction | 84.7767 | 1.0000 | -83.7767 | -98.82% |
| Physics issue count | 5.0000 | 0.0000 | -5.0000 | -100.00% |

## Verdict

**FAIL**

Reasons:
- Baseline F1 missing; unable to apply F1 gate.
- F1 (0.7832) below minimum threshold (0.80).
