# Evaluation Summary

- Generated: 2026-02-27 23:51:43
- Model: `/Users/quan/Documents/personal/Stanford application project/.claude/worktrees/focused-cannon/runs/ablation/neg100/weights/best.pt`
- Git commit: `c53930d`
- Baseline: `/Users/quan/Documents/personal/Stanford application project/.claude/worktrees/focused-cannon/docs/reports/eval_baselines/curated26_baseline_20260227/eval_20260227_1607/eval_result.json`
- Verdict: **FAIL**

## Stage 1 - Holdout Detection Metrics

| Confidence | Precision | Recall | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| 0.25 | 0.6765 | 0.6053 | 0.6389 | 46 | 22 | 30 |
| 0.35 | 0.7692 | 0.5263 | 0.6250 | 40 | 12 | 36 |
| 0.45 | 0.8571 | 0.3158 | 0.4615 | 24 | 4 | 52 |
| 0.55 | 0.8000 | 0.1579 | 0.2637 | 12 | 3 | 64 |

## Stage 2 - Regression Suite

| Video | Gates | Coverage | P90 speed (km/h) | Max speed (km/h) | Max G-force | Max jump (m) | Auto-cal correction | Physics issues |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `2907` | 3 | 0.989 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| `2909` | 3 | 0.997 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| `2911` | 3 | 0.968 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0 |
| **Mean** | **3.000** | **0.985** | **0.00** | **0.00** | **0.00** | **0.00** | **1.00** | **0.000** |

## Delta vs Baseline

| Metric | Baseline | Current | Delta | Delta % |
|---|---:|---:|---:|---:|
| F1 | 0.7671 | 0.6250 | -0.1421 | -18.53% |
| Gates detected | 3.6667 | 3.0000 | -0.6667 | -18.18% |
| Trajectory coverage | 0.9846 | 0.9846 | +0.0000 | +0.00% |
| P90 speed (km/h) | 0.0000 | 0.0000 | +0.0000 | n/a |
| Max speed (km/h) | 0.0000 | 0.0000 | +0.0000 | n/a |
| Max G-force | 0.0000 | 0.0000 | +0.0000 | n/a |
| Max jump (m) | 0.0000 | 0.0000 | +0.0000 | n/a |
| Auto-cal correction | 1.0000 | 1.0000 | +0.0000 | +0.00% |
| Physics issue count | 0.0000 | 0.0000 | +0.0000 | n/a |

## Verdict

**FAIL**

Reasons:
- F1 decreased (0.6250 < baseline 0.7671).
