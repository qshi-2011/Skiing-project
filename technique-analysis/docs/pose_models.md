# Pose Model Comparison for Technique Analysis

This document compares pose estimation models considered for the technique-analysis session.

## Current Choice: MediaPipe PoseLandmarker (Tasks API)

**Model:** `pose_landmarker_lite.task` (float16)
**API:** `mediapipe.tasks.python.vision.PoseLandmarker`
**Keypoints:** 33 (full-body, normalized coordinates + z-depth estimate)

---

## Comparison Table

| Model | Accuracy | CPU (offline) | GPU | Keypoints | Mac Support | License | When to Switch |
|---|---|---|---|---|---|---|---|
| **MediaPipe PoseLandmarker** (current) | Good | Excellent (TFLite) | Optional | 33 | Native (M1/M2) | Apache 2.0 | Adequate for front-view skiing |
| **MoveNet Lightning** | Moderate | Excellent | Optional | 17 | Via TF/TFLite | Apache 2.0 | Faster but fewer keypoints |
| **MoveNet Thunder** | Good | Moderate | Optional | 17 | Via TF/TFLite | Apache 2.0 | Better accuracy, still no z-depth |
| **MMPose (RTMPose-m)** | Very Good | Moderate | Recommended | 17–133 | Via PyTorch | Apache 2.0 | Need sub-pixel accuracy or 3D lift |
| **OpenPose** | Very Good | Poor | Required (CUDA) | 25–135 | Limited (no M-series native) | Non-commercial | Legacy systems with NVIDIA GPU only |
| **YOLOv8-pose** | Good | Good | Optional | 17 | Via PyTorch | AGPL-3.0 | Already using YOLO in pipeline |

---

## Detail Notes

### MediaPipe PoseLandmarker (Tasks API)
- Ships bundled as a `.task` file (TFLite + metadata)
- `>=0.10` required for Tasks API (`mediapipe.tasks.vision.PoseLandmarker`)
- **Do not use** `mp.solutions.pose` — this is the deprecated legacy API
- Provides 3D world landmarks (z-axis estimate from pelvis)
- Runs at 30+ fps on M1/M2 CPU

### MoveNet
- Extremely fast, minimal dependencies
- Only 17 keypoints — missing wrist/ankle fidelity needed for gate-pole timing
- Suitable if latency is critical and 17 keypoints suffice

### MMPose / RTMPose
- Industry-leading accuracy on COCO benchmarks
- Large install footprint (mmcv, mmdet)
- Good choice if 3D pose lifting is needed in a future version

### OpenPose
- Original academic benchmark model
- No native Apple Silicon support; requires CUDA for practical speed
- Non-commercial license restricts product use

### YOLOv8-pose
- Natural fit since the pipeline already uses YOLOv8 for gate/skier detection
- 17 keypoints (COCO format) — fewer than MediaPipe
- Potential future unification of detection + pose in a single inference pass
- **Switch condition:** if pipeline-level latency becomes the bottleneck and YOLOv8 is already loaded

---

## Switch Criteria

Switch away from MediaPipe if any of these hold:

1. **Need >33 keypoints** (e.g., finger/foot detail) → MMPose with whole-body model
2. **Need reliable 3D world coordinates** → MMPose + 3D lift (MotionBERT, VideoPose3D)
3. **Already running YOLOv8 per-frame** and latency is critical → YOLOv8-pose
4. **Batch processing on NVIDIA GPU farm** → OpenPose or MMPose with CUDA backend
5. **Mobile/browser deployment** → MediaPipe remains the best choice

---

## Model Download

The current model can be downloaded from Google's MediaPipe model registry:

```
# pose_landmarker_lite.task (~5 MB, float16)
# Stored at: mediapipe package bundle (auto-resolved by extractor.py)
# Manual fallback location: platform/src/alpine/sessions/technique_analysis/common/pose/
```

See `common/pose/extractor.py` → `_find_model()` for the resolution order.
