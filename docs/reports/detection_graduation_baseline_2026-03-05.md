# Detection Graduation Baseline

**Frozen**: 2026-03-05
**Purpose**: Reference baseline for Phase 1 detection graduation. All candidate models must improve on these numbers without regressing live-overlay stability.

---

## Gate

- **Target**: Holdout F1 >= 0.85
- **Current best (ensemble)**: F1 = 0.8025 at conf=0.36 (TP=65, FP=21, FN=11)
- **Current best (single model)**: F1 = 0.7671 at conf=0.36 (TP=56, FP=14, FN=20)
- **Gap**: ~5-8 percentage points below target

---

## Stage 1: Holdout Detection Baselines

### Ensemble model (`gate_detector_best.pt` + `gate_detector_neg20_ensemble.pt`)

Source: `outputs/final_holdout_eval.json`

| Conf | Precision | Recall | F1 | TP | FP | FN |
|------|-----------|--------|------|----|----|-----|
| 0.25 | 0.6701 | 0.8553 | 0.7514 | 65 | 32 | 11 |
| 0.35 | 0.7471 | 0.8553 | 0.7975 | 65 | 22 | 11 |
| **0.36** | **0.7558** | **0.8553** | **0.8025** | **65** | **21** | **11** |
| 0.45 | 0.7500 | 0.6711 | 0.7083 | 51 | 17 | 25 |

### Single model (`gate_detector_best.pt` only)

Source: `outputs/final_holdout_eval_check.json`

| Conf | Precision | Recall | F1 | TP | FP | FN |
|------|-----------|--------|------|----|----|-----|
| 0.25 | 0.7403 | 0.7500 | 0.7451 | 57 | 20 | 19 |
| 0.35 | 0.8000 | 0.7368 | 0.7671 | 56 | 14 | 20 |
| **0.36** | **0.8000** | **0.7368** | **0.7671** | **56** | **14** | **20** |
| 0.45 | 0.7778 | 0.5526 | 0.6462 | 42 | 12 | 34 |

### Dataset

- Holdout: `data/datasets/final_combined_1class_20260226_curated/test`
- Images: 26, Instances: 76
- Match IoU: 0.5, NMS IoU: 0.55

---

## Sprint Metrics Status

| # | Criterion | Target | Current | Status |
|---|-----------|--------|---------|--------|
| G1 | Gate holdout F1 | >= 0.85 | 0.802 (ensemble) / 0.767 (single) | FAIL |
| G2 | track_id_switches mean | <= 2 | 0.00 | PASS |
| G3 | trajectory_coverage mean | >= 0.80 | 0.988 | PASS |
| G4 | No Stage 2 regression > 20% | -- | TBD | PENDING |

---

## Live-Overlay T1H Baselines (StageB_T1H run)

Source: `eval/test_videos_result_2026-03-05_stageB_T1H/run_summary.json`

| Video | Calls | blank_calls | max_blank_streak | ghost_calls | max_ghost_streak | avg_infer_ms |
|-------|-------|-------------|------------------|-------------|------------------|--------------|
| 28_1752484118 | 196 | 1 | 1 | 1 | 1 | 36.57 |
| 30_1752484596 | 399 | 10 | 2 | 4 | 1 | 37.29 |
| 38_1752843425 | 237 | 0 | 0 | 1 | 1 | 41.92 |
| 594_1732936638 | 515 | 4 | 4 | 0 | 0 | 41.36 |
| IMG_1309 | 278 | 0 | 0 | 0 | 0 | 33.94 |
| IMG_1478 | 461 | 5 | 3 | 3 | 1 | 34.11 |
| mmexport1704088159935 | 604 | 15 | 4 | 1 | 1 | 37.57 |
| mmexport1704089261026 | 266 | 3 | 2 | 0 | 0 | 45.07 |
| mmexport1706098456374 | 132 | 5 | 2 | 0 | 0 | 45.90 |
| changcheng12.12 | 503 | 11 | 3 | 1 | 1 | 42.70 |
| changcheng12.8 | 302 | 0 | 0 | 1 | 1 | 49.15 |

---

## Smoke Test T1H Baseline

Source: `eval/smoke_stageb_t1h_default/run_summary.json`

| Video | Calls | blank_calls | blank_spawnable_calls | max_blank_streak | ghost_calls | max_ghost_streak | avg_infer_ms |
|-------|-------|-------------|----------------------|------------------|-------------|------------------|--------------|
| 1571_raw | 40 | 0 | 0 | 0 | 0 | 0 | 40.58 |

---

## Live-Overlay Guardrail (from plan)

For any candidate model, the following guardrails must hold per video vs this baseline:
- `blank_spawnable_calls`: may not increase by more than 1 absolute call
- `ghost_calls`: may not increase by more than 1 absolute call
- `max_blank_streak`: may not increase by more than 1 absolute call
- `avg_infer_ms`: may not regress by more than 15%

---

## Source Files

- `outputs/final_holdout_eval.json` (ensemble holdout)
- `outputs/final_holdout_eval_check.json` (single model holdout)
- `eval/test_videos_result_2026-03-05_stageB_T1H/run_summary.json` (live overlay)
- `eval/smoke_stageb_t1h_default/run_summary.json` (smoke test)
- `docs/sprint_metrics.md` (graduation criteria)
