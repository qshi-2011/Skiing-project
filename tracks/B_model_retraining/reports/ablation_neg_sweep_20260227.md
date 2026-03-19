# Ablation Report: Negative Sample Sweep
**Date:** 2026-02-27
**Plan phase:** Phase 6 — Controlled Ablation After Data Acceptance
**Author:** automated (Phase 6 ablation team)

---

## 1. Objective

Quantify the impact of adding hard-negative (background) training images to the Feb13
positive-only reconstruction dataset.  Three variants were trained on identical
hyper-parameters; all were evaluated against the lock-enforced curated-26 holdout.

---

## 2. Dataset Variants

| Tag | Train images | Positives | Negatives | Val | Test |
|-----|-------------|-----------|-----------|-----|------|
| neg0 | 252 | 252 | 0 | 72 | 26 |
| neg20 | 272 | 252 | 20 | 72 | 26 |
| neg100 | 352 | 252 | 100 | 72 | 26 |

Val and test splits are identical across all variants (copied from
`final_combined_1class_20260226_curated`).

---

## 3. Training Configuration

| Parameter | Value |
|-----------|-------|
| Base model | YOLOv8n (pretrained COCO) |
| Epochs | 50 |
| Batch size | 32 (neg0/neg20) · 16 (neg100, MPS stability) |
| Image size | 640 |
| Optimizer | AdamW (auto) · lr=0.002 · momentum=0.9 |
| Device | Apple M4 Pro MPS |
| AMP | Disabled (MPS stability) |
| Seed | 42 (deterministic) |
| Patience | 100 |

---

## 4. Training Results (Val mAP50)

| Tag | Best val mAP50 | Best epoch |
|-----|---------------|------------|
| neg0 | **0.634** | 44 |
| neg20 | **0.630** | 50 |
| neg100 | **0.595** | 48 |

Observation: val mAP50 degrades monotonically as negatives increase (+20 negatives: −0.4 pp,
+100 negatives: −3.9 pp).

---

## 5. Holdout Evaluation — Stage 1 (Curated-26 Test Split)

Evaluated with `scripts/run_eval.py` using benchmark lock
(`configs/benchmark_lock.yaml`, 26 images / 26 labels).
Threshold: **0.35**.  Baseline: production model F1 = **0.7671**.

| Metric | Baseline | neg0 | neg20 | neg100 |
|--------|----------|------|-------|--------|
| **F1 @ 0.35** | **0.7671** | 0.7092 | 0.7050 | 0.6250 |
| Precision | — | 0.769 | 0.778 | 0.769 |
| Recall | — | 0.658 | 0.645 | 0.526 |
| TP | — | 50 | 49 | 40 |
| FP | — | 15 | 14 | 12 |
| FN | — | 26 | 27 | 36 |
| Benchmark lock | PASS | PASS | PASS | PASS |
| Eval verdict | — | FAIL | FAIL | FAIL |

All three ablation models fall below the production baseline F1 (expected — they
are trained on the Feb13 reconstruction only, not the full production training set).

**Key finding:** neg0 and neg20 are nearly identical (F1 gap = 0.4 pp), while neg100
drops sharply (−8.4 pp vs neg0). The recall collapse in neg100 (0.526 vs 0.658) is
the primary driver — the model learned to be more conservative under heavy negative
pressure, suppressing true positives.

---

## 6. Regression Suite — Stage 2 (3-Video Regression)

| Metric | Baseline | neg0 | neg20 | neg100 |
|--------|----------|------|-------|--------|
| Trajectory coverage | 0.985 | 0.985 | 0.985 | 0.985 |
| Track ID switches | 0.0 | 0.0 | 0.0 | 0.0 |

All three ablation models match the baseline on the regression suite.  Trajectory
coverage and switch rate are invariant to the negative count — the tracker is robust
to the modest precision/recall differences at Stage 1 level.

---

## 7. Ablation Findings Summary

| Finding | Evidence |
|---------|----------|
| **20 negatives: negligible impact** | F1 neg0=0.709 vs neg20=0.705 (Δ=−0.4 pp); val mAP50 Δ=−0.4 pp |
| **100 negatives: significant recall collapse** | Recall drops 0.658→0.526 (−13 pp); FN increases 26→36 (+38%) |
| **Precision is stable** | P stays ~0.769–0.778 across all variants; FP decreases slightly |
| **Tracker unaffected** | Stage 2 trajectory_coverage and track_id_switches identical for all |
| **Root cause of regression vs baseline** | Training set is Feb13 positives only (252 imgs), vs full production set — not a negative-count effect |

---

## 8. Recommendation

- **neg0** (no hard negatives) maximises F1 on the curated holdout for this dataset size.
- **neg20** is viable if a small false-positive reduction is desired with negligible recall cost.
- **neg100 is not recommended** — recall collapses without a compensating precision gain.
- To close the gap to the production baseline (F1 0.767), the model needs the full
  production training corpus, not just the Feb13 reconstruction.

---

## 9. Artifacts

| Artifact | Path |
|----------|------|
| neg0 weights | `runs/ablation/neg0/weights/best.pt` |
| neg20 weights | `runs/ablation/neg20/weights/best.pt` |
| neg100 weights | `runs/ablation/neg100/weights/best.pt` |
| neg0 eval | `docs/reports/ablation_evals/neg0/eval_20260227_2343/eval_result.json` |
| neg20 eval | `docs/reports/ablation_evals/neg20/eval_20260227_2346/eval_result.json` |
| neg100 eval | `docs/reports/ablation_evals/neg100/eval_20260227_2348/eval_result.json` |
| Baseline eval | `docs/reports/eval_baselines/curated26_baseline_20260227/eval_20260227_1607/eval_result.json` |
| Data recon report | `tracks/B_model_retraining/reports/data_reconstruction_20260227.md` |
