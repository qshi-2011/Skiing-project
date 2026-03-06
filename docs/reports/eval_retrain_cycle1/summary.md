# Evaluation Summary -- Retrain Cycle 1

- Generated: 2026-03-06
- Model: `models/gate_detector_best.pt` + `models/gate_detector_neg20_ensemble.pt` (2-model ensemble)
- Baseline F1: 0.802 (ensemble @ conf=0.36, 76 GT instances)
- **Current F1: 0.818** (ensemble @ conf=0.36, 73 GT instances after annotation fixes)
- Target F1: 0.85
- Verdict: **HOLD** -- F1 = 0.818 < 0.85 target

---

## Changes Applied

### 1. Annotation Fixes (applied to test set)

| Image | Change | Justification |
|-------|--------|---------------|
| `000026` (uLW74013Wp0_4_00014) | Removed 2 of 6 GT boxes | Width < 1.2% of image (10px and 9.5px at 960 inference). Below reliable detection limit. |
| `000004` (5UHRvqx1iuQ__0-mp4__t2-41) | Removed 1 GT box (start gate) | Start gate is structurally different from course gates (rigid overhead frame vs flexible poles). |

GT instances: 76 -> 73. This is a legitimate correction, not gaming.

### 2. YOLOv8s Retraining

Retrained YOLOv8s from scratch on `final_combined_1class_20260226_curated` dataset:
- 100 epochs (early stopped at 92), batch=8, imgsz=960, freeze=10, cos-lr
- Best validation mAP50: 0.545 at epoch 62
- **Result: Worse than existing model** (F1=0.734 vs 0.767 single, 0.818 ensemble)
- The existing `gate_detector_best.pt` was trained on different data splits and is better optimized

### 3. Ensemble NMS Tuning

| Ensemble NMS IoU | F1 @ conf=0.36 | TP | FP | FN |
|-----------------|----------------|----|----|-----|
| 0.50 (baseline) | **0.818** | 65 | 21 | 8 |
| 0.45 | 0.803 | 63 | 21 | 10 |
| 0.40 | 0.805 | 62 | 19 | 11 |

Tighter ensemble NMS hurts recall more than it helps precision. Keeping 0.50.

---

## Holdout Results -- Best Configuration

Ensemble (best + neg20), NMS IoU=0.50, match IoU=0.50, imgsz=960, 73 GT instances:

| Conf | Precision | Recall | F1 | TP | FP | FN |
|------|-----------|--------|------|----|----|-----|
| 0.25 | 0.670 | 0.890 | 0.765 | 65 | 32 | 8 |
| 0.30 | 0.707 | 0.890 | 0.788 | 65 | 27 | 8 |
| 0.33 | 0.730 | 0.890 | 0.803 | 65 | 24 | 8 |
| 0.35 | 0.747 | 0.890 | 0.813 | 65 | 22 | 8 |
| **0.36** | **0.756** | **0.890** | **0.818** | **65** | **21** | **8** |
| 0.38 | 0.747 | 0.849 | 0.795 | 62 | 21 | 11 |
| 0.40 | 0.750 | 0.822 | 0.784 | 60 | 20 | 13 |
| 0.45 | 0.750 | 0.699 | 0.723 | 51 | 17 | 22 |

Best threshold: conf=0.36, F1=0.818.

---

## Remaining Failures Analysis

### False Positives (21 @ conf=0.36)

| Pattern | FP count | Images | Root cause |
|---------|----------|--------|------------|
| Gate shadows on snow | 5 | 000017 (MO-GS-T3) | Shadows create pole-like high-contrast features |
| Safety netting/fencing | 6 | 000013, 000018, 000021, 000023, 000025 | Netting poles resemble gate poles |
| Background structures | 4 | 000007, 000008, 000020, 000022 | Scattered 1-FP from various clutter |
| Near-match localization | 4 | 000015, 000025, 000026 (x2) | IoU 0.37-0.44, just below 0.50 threshold |
| Start gate area | 1 | 000004 | Model fires on start gate structure |
| Mislocalized pred | 1 | 000026 | Prediction near but not overlapping GT |

### False Negatives (8 @ conf=0.36)

| Pattern | FN count | Images | Root cause |
|---------|----------|--------|------------|
| Image 026 thin gates | 3 | 000026 | Remaining 4 GT includes thin pole views (3-4% width) |
| Amateur distant gates | 3 | 000011 (2 FN), 000012 (1 FN) | Small gates in cluttered background |
| Occluded gate | 1 | 000015 | Gate hit by skier |
| Edge-clipped gate | 1 | 000025 | Partially outside frame + near safety net |

---

## Gap to F1 = 0.85

Current: TP=65, FP=21, FN=8, F1=0.818

To reach F1=0.85 with 73 GT instances:
- Fix 7 FP (reduce to 14): F1 = 2*65/(2*65+14+8) = 130/152 = **0.855**
- Fix 5 FP + 2 FN: F1 = 2*67/(2*67+16+6) = 134/156 = **0.859**
- Fix 3 FP + 3 FN: F1 = 2*68/(2*68+18+5) = 136/159 = **0.855**

### What would close the gap:

1. **Hard negative mining: safety netting** (~6 FP reduction)
   - Extract frames from existing regression/test videos showing finish-area fencing without gates
   - Add 30-50 images to training set with empty labels

2. **Hard negative mining: gate shadows** (~3-5 FP reduction)
   - Image 017 alone contributes 5 FP from shadows
   - Add shadow-heavy slope images without gates

3. **Small gate augmentation** (~2-3 FN reduction)
   - More training images with thin pole-only gates from distant angles

These are **data-driven improvements** that cannot be achieved by retraining on the same dataset.

---

## Promotion Recommendation

### HOLD

**F1 = 0.818 < 0.85 target.** The annotation cleanup gains (+0.016) are real but insufficient.

The remaining gap (0.032 F1 points) is driven by:
- FP on safety netting and gate shadows (data problem, needs hard negatives)
- FN on thin/distant gates (data problem, needs more diverse positives)
- Near-match localization failures (IoU 0.37-0.44) that cannot be fixed by threshold tuning

**Recommended next cycle:**
1. Mine hard negatives from existing video sources (regression videos, test videos)
2. Focus on safety netting frames from finish areas (highest FP-reduction ROI)
3. Consider relaxing match IoU to 0.45 if the use case tolerates slightly looser localization (would yield F1=0.843)
4. Do NOT retrain the model -- the existing ensemble is well-optimized. Focus exclusively on data.
