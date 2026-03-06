# Detection Gap Report -- 2026-03-05

## 1. Executive Summary

| Metric | Ensemble | Single Model |
|--------|----------|--------------|
| Threshold | 0.36 | 0.36 |
| TP | 65 | 56 |
| FP | 21 | 14 |
| FN | 11 | 20 |
| Precision | 0.756 | 0.800 |
| Recall | 0.855 | 0.737 |
| F1 | 0.802 | 0.767 |
| Images | 26 | 26 |
| GT instances | 76 | 76 |

The ensemble model trades precision for recall: it recovers 9 more TP than the single model (+9 FN rescued) but introduces 7 more FP. Reaching F1 = 0.85 requires closing both the FN and FP gaps simultaneously.

---

## 2. Per-Image Failure Inventory (Ensemble @ conf=0.36)

### 2.1 Images with False Negatives (FN > 0)

| # | Image (short name) | GT | TP | FP | FN | F1 | Source |
|---|---------------------|----|----|----|----|-----|--------|
| 1 | `000026...uLW74013Wp0_4_00014` | 6 | 1 | 2 | **5** | 0.222 | YouTube uLW74013Wp0 clip 4 |
| 2 | `000011...unseen_2907_SL_frame0627` | 4 | 2 | 0 | **2** | 0.667 | Unseen SL run 2907 |
| 3 | `000012...unseen_2909_SL_frame0504` | 5 | 4 | 0 | **1** | 0.889 | Unseen SL run 2909 |
| 4 | `000015...GS__MO-GS-R4__frame_0057` | 4 | 3 | 1 | **1** | 0.750 | GS broadcast MO-GS-R4 |
| 5 | `000025...uLW74013Wp0_16_00003` | 4 | 3 | 1 | **1** | 0.750 | YouTube uLW74013Wp0 clip 16 |
| 6 | `000004...5UHRvqx1iuQ__0-mp4__t2-41` | 1 | 0 | 1 | **1** | 0.000 | YouTube 5UHRvqx1iuQ start gate |

**Total FN = 11 across 6 images.**

### 2.2 Images with False Positives (FP > 0)

| # | Image (short name) | GT | TP | FP | FN | F1 | Source |
|---|---------------------|----|----|----|----|-----|--------|
| 1 | `000017...GS__MO-GS-T3__frame_0063` | 2 | 2 | **5** | 0 | 0.444 | GS broadcast MO-GS-T3 |
| 2 | `000026...uLW74013Wp0_4_00014` | 6 | 1 | **2** | 5 | 0.222 | YouTube uLW74013Wp0 clip 4 |
| 3 | `000013...unseen_2909_SL_frame0720` | 5 | 5 | **2** | 0 | 0.833 | Unseen SL run 2909 |
| 4 | `000018...NrWcP1s3QC0_14_00000` | 3 | 3 | **2** | 0 | 0.750 | YouTube NrWcP1s3QC0 |
| 5 | `000023...he3w2n9WvrI_2_00005` | 2 | 2 | **2** | 0 | 0.667 | YouTube he3w2n9WvrI clip 2 |
| 6 | `000004...5UHRvqx1iuQ__0-mp4__t2-41` | 1 | 0 | **1** | 1 | 0.000 | YouTube 5UHRvqx1iuQ start gate |
| 7 | `000007...uLW74013Wp0__20-mp4__t4-85` | 3 | 3 | **1** | 0 | 0.857 | YouTube uLW74013Wp0 clip 20 |
| 8 | `000008...uLW74013Wp0__16-mp4__t1-32` | 2 | 2 | **1** | 0 | 0.800 | YouTube uLW74013Wp0 clip 16 |
| 9 | `000015...GS__MO-GS-R4__frame_0057` | 4 | 3 | **1** | 1 | 0.750 | GS broadcast MO-GS-R4 |
| 10 | `000020...SL__MS-SL__frame_0038` | 3 | 3 | **1** | 0 | 0.857 | SL broadcast MS-SL |
| 11 | `000021...he3w2n9WvrI_10_00000` | 2 | 2 | **1** | 0 | 0.800 | YouTube he3w2n9WvrI clip 10 |
| 12 | `000022...he3w2n9WvrI_11_00006` | 4 | 4 | **1** | 0 | 0.889 | YouTube he3w2n9WvrI clip 11 |
| 13 | `000025...uLW74013Wp0_16_00003` | 4 | 3 | **1** | 1 | 0.750 | YouTube uLW74013Wp0 clip 16 |

**Total FP = 21 across 13 images.**

---

## 3. Single Model Additional Failures (@ conf=0.36)

The single model produces 20 FN (vs 11 for ensemble). Additional FN images not in ensemble FN list:

| Image | GT | single TP | single FN | ensemble TP | ensemble FN |
|-------|----|-----------|-----------|-----------|----|
| `000005...he3w2n9WvrI__16-mp4` | 2 | 0 | **2** | 2 | 0 |
| `000006...he3w2n9WvrI__10-mp4` | 2 | 0 | **2** | 2 | 0 |
| `000009...qxfgw1Kd98A__2-mp4` | 1 | 0 | **1** | 1 | 0 |
| `000020...SL__MS-SL__frame_0038` | 3 | 2 | **1** | 3 | 0 |
| `000021...he3w2n9WvrI_10_00000` | 2 | 1 | **1** | 2 | 0 |
| `000022...he3w2n9WvrI_11_00006` | 4 | 3 | **1** | 4 | 0 |

These 9 additional FN are **rescued by the ensemble**. The ensemble's second model (`gate_detector_neg20_ensemble.pt`) is critical for distant/small gate recall.

---

## 4. Top FN Failure Patterns (Ensemble)

### Pattern A: Dense small/distant gates with heavy occlusion (5 FN)

**Worst image: `000026...uLW74013Wp0_4_00014`** -- F1 = 0.222

- Scene: Close-up broadcast of FISU GS race. Skier between gates. 6 GT gates annotated.
- Label analysis: 6 annotated boxes; 4 are very narrow (width 0.010-0.044 of image width), meaning thin pole-only or partially visible gates.
- Two gates at far right edge (cx~0.77, widths 0.010-0.012) are extremely small -- essentially just pole tips.
- Two gates at far background (cx~0.56, 0.74) with large height spans but very narrow widths.
- The model detects only 3 boxes and only 1 matches a GT at IoU >= 0.5; the other 2 predictions land on non-gate objects (FP = 2).
- **Root cause**: Very thin pole-only gates at small scale. The model lacks training examples of gate poles without visible panels, especially in close-up broadcast angles.

### Pattern B: Distant gates in cluttered amateur video (2 FN)

**Image: `000011...unseen_2907_SL_frame0627`** -- F1 = 0.667

- Scene: Amateur video of child skiing on a beginner SL course with village buildings in background.
- 4 GT gates annotated; model finds 2.
- Label analysis: All 4 gates are small (widths 0.017-0.038, heights 0.15-0.25). Two missed gates are the most distant ones (cx~0.50, 0.66) which blend into the cluttered background of buildings and ski lodge structures.
- **Root cause**: Small distant gates against a visually complex urban/resort background. Training set likely under-represents amateur phone-camera perspectives with cluttered backgrounds.

### Pattern C: Small gates in distant mid-course slalom view (1 FN)

**Image: `000012...unseen_2909_SL_frame0504`** -- F1 = 0.889

- Scene: Amateur video, single skier on SL course viewed from behind/above. Village buildings in background.
- 5 GT gates; model finds 4. One missed gate at position (cx=0.268, cy=0.622, w=0.024, h=0.050).
- **Root cause**: Extremely small gate (2.4% image width, 5% image height) partially blending into snow. This is near the detection limit for small objects.

### Pattern D: Occluded gate in broadcast GS (1 FN)

**Image: `000015...GS__MO-GS-R4__frame_0057`** -- F1 = 0.75

- Scene: Broadcast GS race with screen recording overlay (BANDICAM watermark, ORF logo, timing graphics). Skier mid-turn crashing into gate.
- 4 GT gates; model finds 3 + 1 FP. The missed gate overlaps heavily with the skier's body and the deflecting gate panel.
- **Root cause**: Gate occluded by skier contact. The skier is physically hitting/bending the gate, making it visually different from an upright gate.

### Pattern E: Gate near edge with safety netting confusion (1 FN)

**Image: `000025...uLW74013Wp0_16_00003`** -- F1 = 0.75

- Scene: FISU GS race broadcast, finish area with safety netting. 4 GT gates.
- Missed gate at far left edge (cx=0.095, w=0.060) partially cut off by frame edge, next to red safety netting.
- **Root cause**: Edge-clipped gate adjacent to visually similar safety netting (both have red coloring and pole structures).

### Pattern F: Start gate / non-standard gate structure (1 FN)

**Image: `000004...5UHRvqx1iuQ__0-mp4__t2-41`** -- F1 = 0.0

- Scene: Start gate area of race. GT annotates the start gate structure (cx=0.943, cy=0.855, w=0.088, h=0.290).
- Model predicts 1 box but it does not overlap the GT at IoU >= 0.5 (FP). The start gate is a rigid overhead structure, unlike the flexible pole gates the model is trained on.
- **Root cause**: Start gates are structurally different from course gates. The model has not been trained on start/finish gate structures.

---

## 5. Top FP Failure Patterns (Ensemble)

### Pattern 1: Broadcast GS with terrain shadows triggering false gates (5 FP)

**Worst FP image: `000017...GS__MO-GS-T3__frame_0063`** -- 5 extra detections

- Scene: GS race on steep terrain, aerial/distant camera angle. Two annotated GS gates with orange panels. Strong shadows from gates and terrain features cast long dark lines across snow.
- Model produces 7 detections (2 TP + 5 FP). The 5 FP likely fire on: gate shadows, terrain ruts, and far-field gate-like structures.
- **Root cause**: Long gate shadows on bright snow create high-contrast pole-like features. Aerial camera angle is under-represented in training data.

### Pattern 2: Safety netting and fencing confused as gates (2 FP)

**Image: `000013...unseen_2909_SL_frame0720`** -- 2 extra detections

- Scene: SL course finish area with dense safety netting/fencing. 5 GT gates all found correctly, but 2 additional FP detections fire on netting poles or fencing structures.
- **Root cause**: Safety fencing poles and gate poles share similar visual appearance (thin vertical structures with colored panels/flags).

### Pattern 3: Broadcast overlays and background structures (2 FP)

**Image: `000018...NrWcP1s3QC0_14_00000`** -- 2 extra detections

- Scene: FISU broadcast with timing overlay, safety netting, and mixed gate types visible. 3 GT gates correctly detected.
- 2 FP likely on background poles, fencing posts, or netting structures.
- **Root cause**: Broadcast scenes with complex venue infrastructure (timing poles, camera poles, sponsor boards with vertical elements).

### Pattern 4: Close-up with background clutter (2 FP)

**Image: `000023...he3w2n9WvrI_2_00005`** -- 2 extra detections

- Scene: YouTube clip of GS race. Skier approaching gates with red safety netting in background. 2 GT gates correctly found.
- 2 FP detections on safety netting poles/structures.
- **Root cause**: Safety net support poles and colored netting panels strongly resemble gate structures.

### Pattern 5: Mixed FP+FN from mislocalized predictions (2 FP + 5 FN)

**Image: `000026...uLW74013Wp0_4_00014`** -- covered in FN Pattern A above.

- Model predictions don't overlap GT boxes at IoU >= 0.5. This is a localization failure as much as a detection failure -- predictions land near but not on the small annotated gates.

### Pattern 6: Single scattered FP on various images (8 FP across 8 images)

Eight images each have exactly 1 FP, from diverse causes:
- `000007`: Extra detection near gate cluster (uLW74013Wp0 scene)
- `000008`: Extra detection in snowy background (uLW74013Wp0 scene)
- `000015`: Detection on occluded/deflected gate structure
- `000020`: Extra detection on background object (MS-SL broadcast)
- `000021`: Detection on fencing/netting (he3w2n9WvrI scene)
- `000022`: Detection on background structure (he3w2n9WvrI close-up)
- `000025`: Detection near safety netting (uLW74013Wp0 finish area)
- `000004`: Mislocalized start gate detection

---

## 6. Ensemble vs. Single Model -- What the Second Model Adds

| Category | Ensemble wins | Ensemble loses |
|----------|---------------|----------------|
| FN rescued | +9 TP (images 005, 006, 009, 020, 021, 022 + more from others) | -- |
| Extra FP introduced | -- | +7 FP (images 005/006 at 0.25 threshold show model fires on distant objects) |

The ensemble's second model (`neg20_ensemble`) provides crucial recall for:
- Distant broadcast views (he3w2n9WvrI scenes)
- Low-contrast gates on overcast/foggy slopes
- Gates partially obscured by skier

But it also hallucinates on:
- Safety netting/fencing structures
- Broadcast overlay graphics

---

## 7. Quantitative Gap Analysis: Path to F1 = 0.85

### Current state (ensemble @ 0.36):
- TP=65, FP=21, FN=11
- F1 = 2*65 / (2*65 + 21 + 11) = 130/162 = **0.802**

### Target F1 = 0.85:
F1 = 2*TP / (2*TP + FP + FN) = 0.85

Assuming total GT instances stay at 76:

| Scenario | TP | FP | FN | Precision | Recall | F1 |
|----------|----|----|----|----|----|----|
| Current | 65 | 21 | 11 | 0.756 | 0.855 | 0.802 |
| Fix 5 FP only | 65 | 16 | 11 | 0.802 | 0.855 | 0.828 |
| Fix 5 FP + 3 FN | 68 | 16 | 8 | 0.810 | 0.895 | 0.850 |
| Fix 10 FP only | 65 | 11 | 11 | 0.855 | 0.855 | 0.855 |
| Fix 5 FN only | 70 | 21 | 6 | 0.769 | 0.921 | 0.838 |
| Fix 10 FP + 5 FN | 70 | 11 | 6 | 0.864 | 0.921 | 0.891 |

**Minimum path to F1 >= 0.85:** Fix ~10 FP (reduce from 21 to 11) OR fix ~5 FP + ~3 FN.

The most achievable targets:
1. **Eliminate safety netting FP** (Patterns 2, 4, 6): ~6-8 FP across 6+ images. Add hard negative mining with safety netting/fencing images.
2. **Eliminate shadow FP** (Pattern 1): ~5 FP from one image. Add training examples of gates with strong shadows, and shadow-only negative patches.
3. **Recover thin/distant gates** (Patterns A, B): ~7 FN across 2 images. Add small/thin gate training examples from similar perspectives.

---

## 8. Training Set Representation Analysis

Total training images: 360. Per-source counts for holdout failure sources:

| Source video/scene | Train images | Test images | Key failures |
|-------------------|-------------|-------------|--------------|
| uLW74013Wp0 (YouTube FISU GS) | 24 | 4 | Worst FN (img 026: 5 FN), scattered FP |
| he3w2n9WvrI (YouTube FISU) | 19 | 4 | Single model FN=4-6, ensemble FP on netting |
| unseen_2907 (amateur SL) | 38 | 2 | Distant small gates missed (2 FN) |
| unseen_2909 (amateur SL) | 39 | 2 | Small gate FN, netting FP |
| MO-GS-T3 (broadcast GS) | 7 | 1 | Worst FP (5 FP from shadows) |
| MO-GS-R4 (broadcast GS) | 7 | 1 | Occluded gate FN + FP |
| 5UHRvqx1iuQ (YouTube start) | 6 | 2 | Start gate confusion (FP+FN) |
| qxfgw1Kd98A (YouTube) | 4 | 1 | Single model total miss |
| NrWcP1s3QC0 (YouTube FISU) | 6 | 1 | 2 FP on venue infrastructure |

Key observations from visual inspection of failure images:
- **Image 026** (uLW74013Wp0_4): Close-up FISU GS broadcast showing skier between blue panel gates. 4 of 6 GT gates are thin pole-only views (width < 4.5% of image). Two far-right gates are barely visible pole tips (width ~1% of image). The model simply cannot resolve these at inference resolution.
- **Images 005/006** (he3w2n9WvrI): Wide-angle FISU finish area with gates at extreme distance (~300px from camera). Gates appear as tiny colored dots against complex venue backgrounds with red/white safety barriers. Single model completely misses both; ensemble recovers them.
- **Image 017** (MO-GS-T3): Aerial/steep angle of GS race. Only 2 real gates (orange panels) visible, but strong parallel shadows from poles and terrain ruts create 5 false positive triggers. The shadows have pole-like aspect ratios and high contrast against snow.
- **Image 004** (5UHRvqx1iuQ): Start house/gate area -- structurally different from course gates (overhead rigid frame vs. flexible poles). The GT annotation marks the start structure, which the model has no training examples for.
- **Image 011** (unseen_2907): Amateur phone video of child on beginner SL course. Background is a busy ski village with buildings, chairs, and people. Two distant gates (width ~2-3%) blend into this visual clutter.
- **Image 009** (qxfgw1Kd98A): Foggy/whiteout conditions at FISU venue. Single slalom pole barely visible through fog. Single model produces FP on a different structure; ensemble barely recovers via the second model.

---

## 9. Recommendations

### 9.1 High-Impact Data Additions (Priority Order)

1. **Hard negatives: safety netting and fencing** (targets ~8 FP)
   - Collect 30-50 images of ski race safety netting, finish-area fencing, and course boundary structures WITHOUT gates visible.
   - These are the primary FP driver across multiple images (000013, 000017, 000018, 000021, 000023, 000025).

2. **Hard negatives: gate shadows on snow** (targets ~5 FP)
   - Collect 20-30 images of slopes with strong shadows from gate poles, but crop to show only the shadow without the gate.
   - Also add positive examples with gates + shadows annotated, to teach the model to anchor on the gate itself rather than shadow.

3. **Small/thin gate positives** (targets ~7 FN)
   - Collect 30-50 images of very small gates (< 3% image width) from distant camera angles.
   - Include thin pole-only views where the panel is edge-on or not visible.
   - Source from FISU/broadcast footage at similar camera distances as `uLW74013Wp0` clips.

4. **Amateur video with cluttered backgrounds** (targets ~3 FN)
   - Collect 20-30 images from amateur phone videos of ski races with buildings, spectators, and resort structures in background.
   - Similar to the `unseen_2907/2909` scenes which are the main FN source after the broadcast failures.

5. **Start/finish gate structures** (targets ~1 FN + ~1 FP)
   - Either: add start gate annotations as a positive class variant, OR explicitly exclude start gates and remove the annotation from the holdout set.
   - Current status is ambiguous -- one image has it annotated as a gate, but the model cannot learn this shape from the existing training set.

6. **Broadcast overlay robustness** (targets ~2 FP)
   - Add training images with timing graphics, watermarks (BANDICAM), and scoreboard overlays to reduce spurious detections near overlay boundaries.

### 9.2 Model/Training Changes

1. **Increase small-object augmentation**: Apply mosaic/mixup augmentations biased toward placing small gates in frame corners and at distant positions.
2. **NMS tuning**: Consider slightly tighter NMS IoU for the ensemble merge step (current 0.5) to suppress duplicate near-miss predictions (would help image 026 where predictions are near but don't match GT).
3. **Confidence calibration**: The ensemble's conf=0.36 threshold is already well-chosen. Raising it to 0.40 would kill too much recall; lowering it adds too many FP. Focus on data improvements rather than threshold tuning.

### 9.3 Annotation Quality Check

- **Image 026** (`uLW74013Wp0_4_00014`): Review the 6 GT annotations. Two gates have extremely small bounding boxes (width < 1.2% of image). Consider whether these should remain as "expected to detect" or be flagged as "ignore" regions given their sub-pixel scale after model input resizing.
- **Image 004** (`5UHRvqx1iuQ__0-mp4__t2-41`): The single GT box annotates a start gate structure. Clarify whether start gates should be in-scope for the detector.

---

## 10. Summary Table: Fix Priority

| Priority | Action | Est. FP fixed | Est. FN fixed | Est. F1 impact |
|----------|--------|---------------|---------------|----------------|
| P0 | Hard negatives: safety netting/fencing | -6 to -8 | 0 | +0.02-0.03 |
| P0 | Hard negatives: gate shadows | -3 to -5 | 0 | +0.01-0.02 |
| P1 | Small/thin gate positives | 0 | -5 to -7 | +0.02-0.03 |
| P1 | Amateur cluttered-background positives | 0 | -2 to -3 | +0.01 |
| P2 | Start gate annotation clarification | -1 | -1 | +0.01 |
| P2 | Annotation review for sub-pixel gates | 0 | -2 (reclassify) | +0.01 |
| P2 | Broadcast overlay augmentation | -1 to -2 | 0 | +0.005 |

**Combined expected impact: F1 from 0.802 to ~0.85-0.87 if P0+P1 actions are completed.**
