# Performance Analysis Brief — Ski Technique Analysis Pipeline
**For professor review — Stanford Application Project**
*Prepared: 2026-03-12*

---

## 1. Current Pipeline Architecture

### What the pipeline does (per video)

```
Raw 4K video (3840×2160, 60fps, ~21s)
         │
         ▼ [iter_frames — reads EVERY native frame]
1295 frames decoded + resized to 1920p
         │
         ├──► [Non-analysis frames, ~863 total]
         │         YOLOv8n person detection (ByteTrack)
         │         → update tracker state only
         │
         └──► [Analysis frames, ~432 total, at 20fps]
                   YOLOv8n person detection + crop selection
                   → MediaPipe PoseLandmarker (full model, 23MB)
                   → Landmark smoothing (EMA)
                   → 3D metric computation
                        │
                        ▼
              Turn segmentation
              Quality scoring
              Coaching tip generation
              Overlay video rendering (back to 60fps)
```

### Measured timing breakdown (M4 Pro, CPU only)

| Step | Calls | Time/call | Total |
|------|-------|-----------|-------|
| Video decode + resize to 1920p | 1295 | ~3ms | ~4s |
| YOLO tracking (non-analysis) | ~863 | ~24ms | **~21s** |
| YOLO + crop selection (analysis) | ~432 | ~24ms | ~10s |
| MediaPipe pose (full model, crop) | ~432 | ~50ms | **~22s** |
| Overlay rendering | 1295 | ~2ms | ~3s |
| **Total observed** | | | **~55s** |

### Key finding
Two bottlenecks dominate:
- **YOLO on CPU** accounts for ~31s (56% of runtime)
- **MediaPipe on CPU** accounts for ~22s (40% of runtime)

Both run entirely on CPU despite the system having an Apple M4 Pro with dedicated GPU cores and a Neural Processing Unit (NPU/ANE).

---

## 2. Apple Silicon Hardware — What Is Actually Available

The M4 Pro contains four distinct compute units relevant to ML inference:

| Unit | What it is | Peak TOPS | PyTorch backend | CoreML |
|------|-----------|-----------|-----------------|--------|
| **CPU** (P+E cores) | ARM cores, fast per-thread | ~2 | `cpu` | ✓ |
| **GPU** (Metal) | 20-core GPU, float16 | ~68 | `mps` | ✓ |
| **ANE** (Neural Engine) | Dedicated ML ASIC, INT8/float16 | ~38 | ✗ (not exposed) | ✓ |
| **AMX** (Matrix coprocessor) | Built into CPU for GEMM | (included in CPU TOPS) | used by BLAS | ✗ |

### Why YOLO is fixable but MediaPipe is not (currently)

**YOLO (Ultralytics)** is a PyTorch model. PyTorch 2.x supports the `mps` backend for Apple Silicon. Switching to `device='mps'` is one line and achieves 3–5× speedup on GPU. The ANE cannot be accessed directly from PyTorch.

**MediaPipe PoseLandmarker** (Google Tasks API, Python) — the GPU delegate in the MediaPipe C++ library is currently only compiled for Ubuntu/Android. The macOS Python package ships with CPU-only inference. There is no supported path to use Metal, MPS, or ANE through this API as of early 2026.

**CoreML** — Apple's native inference framework can use all three compute units (CPU, GPU, ANE) and picks the optimal one automatically. The ANE is particularly fast for transformer/attention operations. If we convert our pose model to CoreML format (`.mlpackage`), we can access ANE performance.

### The ANE advantage
For transformer-based models (ViTPose, RTMPose-Tiny, etc.), the ANE typically outperforms the GPU for batch=1 inference because:
1. ANE is optimised for 8-bit and 16-bit matrix multiply
2. ANE has very low power draw (important for sustained inference)
3. GPU has higher overhead for small-batch inference (kernel launch latency)

Apple's `coremltools` library converts PyTorch/ONNX models to `.mlpackage` and the CoreML runtime automatically dispatches to ANE when the model is compatible (operators must be in the supported ANE op set).

---

## 3. Model Architecture Problems

### 3.1 MediaPipe PoseLandmarker (current pose model)

**Architecture**: BlazePose — a lightweight single-person pose estimator designed for mobile real-time inference on Android/iOS. It uses:
- A fast person detector (BlazePose detector)
- A pose regression head (33 keypoints, no heatmaps)
- Temporal smoothing built into the C++ backend

**Why it struggles with skiing**:
1. **Training distribution mismatch**: Trained predominantly on indoor/gym/yoga video datasets. Alpine skiing involves bulky winter clothing that hides natural joint contours, extreme body angles during carving, and high-speed motion blur.
2. **Single-person assumption**: Designed for one person filling the frame. When the skier is small (area < 0.5% of frame), the detector degrades sharply.
3. **No equipment awareness**: Ski poles are long, thin objects that visually resemble arms/legs. BlazePose has no concept of equipment and frequently places wrist/ankle landmarks on the pole tip rather than the actual joint.
4. **No temporal model for sports**: The C++ smoothing filter is designed for slow, deliberate body movements. High-speed skiing (10–15 m/s lateral velocity) violates the filter's motion priors.
5. **Depth estimation weakness**: The `z` coordinate (depth) is estimated from 2D appearance cues alone with no stereo or temporal depth reasoning. For carving turns where the body tilts ~30–45°, depth estimates are often wrong.

**Confidence collapse pattern observed**: Detection confidence drops specifically during carve-to-carve transitions when the skier's body is sideways to the camera and poles swing forward. This matches the training distribution gap exactly.

### 3.2 YOLOv8n (current person detector)

**Architecture**: CSPDarknet + PANet + decoupled head, nano variant (3.2M parameters). Trained on COCO (80 classes including `person`).

**Why it works acceptably but has failure modes**:
- COCO contains a wide range of person appearances including sportswear, which gives reasonable ski detection
- The nano model is fast but has lower recall on small objects (< 32×32px in original resolution)
- At analysis time, the skier may occupy only 40–80px at distance → borderline for YOLOv8n detection
- No domain adaptation for skiing: does not distinguish skiers from standing spectators, ski instructors, or people carrying poles

**ByteTrack limitation**: ByteTrack (built into Ultralytics) uses Kalman-filtered IoU matching. When the skier moves fast laterally (0.10+ normalised units between 20fps samples), IoU between predicted and detected bbox drops near zero → track lost → re-assigned to wrong person. This is the root cause of the 0.6s and 2.2s track switches observed.

### 3.3 Two-step pipeline overhead

Currently: **full frame YOLO** → **crop** → **MediaPipe on crop**.

The pipeline makes two inference calls per analysis frame. A single unified pose model (YOLO-Pose, RTMPose) that outputs keypoints directly from a single forward pass would be faster. However, the two-step approach has a key advantage: MediaPipe's world landmarks (3D metric-space keypoints) require the full-body context from a tight crop.

---

## 4. Proposed Solutions — By Priority

### Tier 1: Immediate (no model change, low risk)

**A. Move YOLO to MPS**
- Change: one line, `device='mps'` in Ultralytics call
- Expected speedup: 3.4× on YOLO (measured: CPU 23.8ms → MPS 7.0ms at 960p)
- Total runtime improvement: ~21s saved
- Risk: none, Ultralytics MPS is well-tested on Apple Silicon

**B. Fix YOLO input resolution to 960p for all calls**
- Currently, 1920p frames are passed to YOLO which internally resizes to 640p anyway
- Fix: resize to 960p inside PersonDetector before calling YOLO
- Benefit: consistent ByteTrack coordinates + marginally faster

**C. Halve ByteTrack update rate (30fps instead of 60fps)**
- ByteTrack update currently runs on every native 60fps frame
- At 30fps, a skier moving at 15 m/s moves ~0.5m between frames → still within ByteTrack's matching radius
- Saves ~430 YOLO calls per video

**Combined Tier 1 speedup**: ~55s → ~30s

---

### Tier 2: CoreML conversion of pose model (medium effort)

**Goal**: Access the ANE for pose inference on macOS.

**Path**:
1. Choose a PyTorch-based pose model (RTMPose-tiny, ViTPose-small, or YOLOv8-Pose)
2. Export to ONNX: `torch.onnx.export(...)`
3. Convert to CoreML: `coremltools.convert(onnx_model, compute_units=ct.ComputeUnit.ALL)`
4. `ComputeUnit.ALL` tells CoreML to dispatch to ANE when operators are compatible

**Key questions the professor should evaluate**:
- Which RTMPose/ViTPose variant fits the ANE op set? (ANE requires specific operator subsets — no arbitrary PyTorch ops)
- Does the model require heatmap post-processing? (ANE-friendly: global average pool, conv, matmul; NOT ANE-friendly: NMS, argmax on large tensors)
- What is the latency of `ViTPose-small` on ANE vs current MediaPipe-CPU?

**Estimated potential**: ANE can deliver 10–20ms for lightweight ViTPose variants vs current 50ms MediaPipe-CPU. That would reduce MediaPipe's contribution from ~22s to ~5-10s.

**Caveat**: `coremltools` conversion of transformer models sometimes requires operator fusion patches. ViTPose's attention blocks need to be verified against the ANE op set. RTMPose-Tiny (CNN-based) is more reliably ANE-compatible than ViTPose.

---

### Tier 3: Unified YOLO-Pose pipeline (architectural change)

**Concept**: Replace the two-step pipeline (YOLO detector + MediaPipe pose on crop) with a single model that does detection + pose simultaneously.

**Options**:
- **YOLOv8-Pose** / **YOLOv11-Pose**: Ultralytics, built-in, already in the project. 17 COCO keypoints (no world landmarks). MPS-ready.
- **RTMPose** (OpenMMLab): state-of-the-art for top-down pose, supports both CNN (RTMPose-tiny/s/m) and transformer (RTMPose-l) backbones. Can be exported to CoreML/ONNX.
- **ViTPose**: transformer backbone, SOTA accuracy, good for occluded/unusual poses. Heavier but more accurate on skiing body dynamics.

**Trade-off vs current approach**:
| | Current (MediaPipe) | YOLO-Pose | RTMPose | ViTPose |
|---|---|---|---|---|
| Keypoints | 33 + world 3D | 17 (2D only) | 17–133, configurable | 17+ |
| 3D world coords | ✓ | ✗ | ✗ (needs VideoPose3D lift) | ✗ |
| MPS/ANE | ✗ | MPS ✓ | CoreML ✓ | CoreML ✓ |
| Sports clothing | Weak | Moderate | Good (fine-tuned) | SOTA |
| Ski poles | Fails | Moderate | Good (equipment aware w/ fine-tune) | Best |
| Speed (M4 Pro) | 50ms CPU | ~8ms MPS | ~15ms CoreML | ~25ms CoreML |

**The 3D world coordinate problem**: If we switch away from MediaPipe, we lose 3D world landmarks (hip-centred metric space). These are currently used for edge angle, lean angle, and CoM shift metrics. The replacement would be:
1. **2D-to-3D lifting**: Run VideoPose3D or MotionBERT after 2D keypoints → adds another inference step but gives better 3D than MediaPipe's appearance-based depth
2. **Accept 2D-only metrics**: Compute edge/lean angles from 2D geometry (less accurate but viable for most use cases)
3. **Stereo camera setup**: Not applicable for consumer ski videos

---

### Tier 4: Domain-specific fine-tuning (research-level, high impact)

**Problem**: All current models were trained on general person datasets. Skiing has domain-specific challenges:
- Bulky clothing hiding joint anatomy
- Ski poles as equipment extending from hands
- Extreme body angles (45°+ lean) outside training distribution
- "Whiteout" — low contrast body/snow boundary
- High-speed motion blur (1/60s shutter, 15 m/s = 25cm blur)

**Available datasets for fine-tuning**:

| Dataset | Size | Labels | Notes |
|---------|------|--------|-------|
| **Ski-Pose PTZ (EPFL)** | ~20K frames | 3D pose, GS/SL runs | Gold standard, competitive alpine skiers |
| **SkiTechCoach** | ~15K frames | 3D pose, coaching labels | Recreational skiers, variety of conditions |
| **Ski 2DPose (EPFL)** | ~10K frames | 2D pose + skis/poles as keypoints | Includes equipment keypoints |
| **SkiTB** | 180 videos | Bounding boxes only | Tracking benchmark |

**Key recommendation**: Fine-tune on Ski-Pose PTZ + Ski 2DPose combined. The inclusion of ski/pole keypoints in Ski 2DPose is particularly valuable — models trained with equipment keypoints are far more robust when poles are in front of the body.

**Fine-tuning strategy**:
1. Start from RTMPose-small (good base accuracy, ONNX-exportable)
2. Add pole-tip and ski-tip as keypoints (extend the keypoint head)
3. Fine-tune on skiing datasets with data augmentation for motion blur, lighting
4. Export to ONNX → CoreML → deploy on ANE

---

## 5. Specific Questions for the Professor

### On Apple Silicon architecture
1. Is there a supported path to run custom PyTorch models on the ANE directly (without CoreML conversion)? The `torch.backends.mps` backend targets the GPU, not the ANE — is there a lower-level Metal Performance Shaders path that gets closer to ANE?
2. For CoreML conversion of ViTPose: which attention implementations (SDPA, Flash Attention) are ANE-compatible vs requiring CPU fallback?
3. Is `coremltools` + `ComputeUnit.ALL` the right tool, or is the newer `mlprogram` format (CoreML 5+) better for transformer models on ANE?

### On model architecture
1. For a single-camera front-view skiing setup, would a **temporal pose model** (e.g., PoseFormerV2, MotionBERT) significantly outperform frame-by-frame inference for handling the confidence drops during carve transitions?
2. The main detection failure mode is during carve-to-carve transitions (body sideways + poles forward + motion blur). Would a **flow-based pose propagation** (optical flow → warp previous keypoints) be a practical supplement to fill these gaps more accurately than our current EMA gap-fill?
3. Given that skiing involves equipment (poles, skis), would **treating poles as extended body segments** in the keypoint definition (as in Ski 2DPose) meaningfully reduce the wrist/ankle misplacement artifacts?

### On the tracking problem
1. For the ByteTrack ID switch problem (track lost at fast lateral motion): would **DeepSORT** (appearance-based ReID) solve this better than **ByteTrack** (IoU-only)? Or is the appearance vector too unstable when the person is small (< 0.5% of frame)?
2. Is **RT-DETR** with its global attention mechanism better than YOLO at distinguishing the primary skier in a crowd when the skier is small and moving fast?

### On the overall system design
1. Given the constraint of **offline video analysis** (not real-time), is it worth implementing a **two-pass architecture** — fast pass for detection/tracking, slow pass for high-quality pose? This would allow us to use a heavier, more accurate pose model since we're not latency-constrained.
2. The reference app (SkiProAI) runs the heavy model on **Modal cloud** (serverless GPU). For our local Mac-only use case, what is the practical ceiling of accuracy we can reach on Apple Silicon vs a T4/A10 GPU on cloud?

---

## 6. Summary Table — Solution Options

| Solution | Effort | Speedup | Accuracy impact | MPS/ANE |
|----------|--------|---------|-----------------|---------|
| YOLO → MPS | 1 hour | 3.4× YOLO | None | GPU |
| YOLO 960p + skip frames | 2 hours | 1.5× additional | None | — |
| MediaPipe → YOLO-Pose | 1 day | 3× pose | −(no 3D coords) | GPU |
| RTMPose + CoreML | 2–3 days | 3–5× pose | +(better sports) | ANE |
| ViTPose + CoreML | 3–5 days | 2–3× pose | ++(SOTA) | GPU/ANE |
| Fine-tune on Ski-Pose | 1–2 weeks | — | +++  (domain) | depends on model |
| 2D→3D lifting (MotionBERT) | 3–5 days | −(adds step) | +(better 3D) | GPU |

---

## 7. Attached: Relevant File Paths

```
Current pipeline:
  technique-analysis/src/technique_analysis/common/pose/extractor.py
  technique-analysis/src/technique_analysis/common/pose/person_detector.py
  technique-analysis/src/technique_analysis/free_ski/pipeline/orchestrator.py

Metrics computation (3D angles):
  technique-analysis/src/technique_analysis/common/metrics/geometry.py
  technique-analysis/src/technique_analysis/common/metrics/frame_metrics.py

Overlay rendering:
  technique-analysis/src/technique_analysis/common/rendering/overlay.py

Reference implementations:
  technique-analysis/external_repos/Alpine-ski-analyzer/  (original project)
  technique-analysis/external_repos/skiproai_chinanumberone/  (SkiProAI frontend)
```
