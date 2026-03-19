# Evaluation Summary

- Generated: 2026-02-27 16:09:53
- Model: `/Users/quan/Documents/personal/Stanford application project/.claude/worktrees/focused-cannon/models/gate_detector_best.pt`
- Git commit: `c53930d`
- Verdict: **PASS**

## Stage 1 - Holdout Detection Metrics

| Confidence | Precision | Recall | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| 0.25 | 0.7403 | 0.7500 | 0.7451 | 57 | 20 | 19 |
| 0.35 | 0.8000 | 0.7368 | 0.7671 | 56 | 14 | 20 |
| 0.45 | 0.7778 | 0.5526 | 0.6462 | 42 | 12 | 34 |
| 0.55 | 0.8286 | 0.3816 | 0.5225 | 29 | 6 | 47 |

## Stage 2 - Regression Suite

| Video | Gates | Coverage | P90 speed (km/h) | Max speed (km/h) | Max G-force | Max jump (m) | Auto-cal correction | Physics issues |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `2907` | 3 | 0.989 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| `2909` | 4 | 0.997 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| `2911` | 4 | 0.968 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| **Mean** | **3.667** | **0.985** | **0.00** | **0.00** | **0.00** | **0.00** | **1.00** | **0.000** |

## Verdict

**PASS**

Reasons:
- No baseline provided; skipped regression delta checks.
