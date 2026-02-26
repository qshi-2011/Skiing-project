# Codex Prompt — Track D v2: VFR Kalman Tracker (Wave 3, Worker A)

Paste everything below into a Codex environment with access to the full project root.

> **Note:** This is the v2.1 prompt. The earlier `CODEX_PROMPT.md` in this folder covered the original outlier-handling and ByteTrack tuning work. That work is complete and preserved in `reports/`. This prompt covers the new Wave 3 work: upgrading the Kalman filter to use exact PTS delta_t (VFR fix) and consuming Topological BEV coordinates from Track C.

---

## Your role

You are **Wave 3, Worker A**. You are on the critical path. Track F (Viterbi) cannot start until your tracker states are stable. You consume BEV coordinates from Track C and detection outputs from Track B. You produce multi-object tracks in Topological BEV space.

---

## Context

The existing Kalman filter in `ski_racing/tracking.py` assumes fixed delta_t (computed as 1/fps). This is wrong for VFR smartphone video — delta_t varies frame to frame. The fix is to read the exact `delta_t_s` from the sidecar PTS JSON (Track A) and use it in the Kalman prediction step.

Additionally, the tracker currently operates in image pixel coordinates. The v2.1 architecture moves tracking into the Topological BEV coordinate space provided by Track C — a relative ordinal plane where gates maintain correct left/right, front/back ordering regardless of EIS cropping.

---

## Files to read first (in this order)

1. `tracks/README.md` — architecture and your role
2. `shared/interfaces/per_frame_bev.schema.json` — your primary spatial input (from Track C)
3. `shared/interfaces/per_frame_detections.schema.json` — your detection input (from Track B)
4. `shared/interfaces/sidecar_pts.schema.json` — for delta_t_s per frame
5. `tracker_spec_v2.docx` — Phase 2 (full spec), Section 4.4 (VFR/FIFO context)
6. `tracks/D_tracking_outlier/README.md` — acceptance criteria
7. `ski_racing/tracking.py` — your main file, read all of it
8. `tracks/D_tracking_outlier/reports/` — prior tuning results (don't redo this work)

---

## What to build

### Step 1: PTS-driven Kalman prediction step

In `ski_racing/tracking.py`, modify the `KalmanSmoother` (or equivalent Kalman class) so the prediction step uses the exact `delta_t_s` from the sidecar JSON instead of a hardcoded 1/fps value.

The Kalman state vector is `[x, y, vx, vy, s, ds]` in Topological BEV coordinates (x, y = BEV position; vx, vy = velocity; s = scale/size; ds = scale rate).

State transition matrix F must be parameterised by delta_t:
```
F(delta_t) = [[1, 0, delta_t, 0,       0, 0      ],
              [0, 1, 0,       delta_t,  0, 0      ],
              [0, 0, 1,       0,        0, 0      ],
              [0, 0, 0,       1,        0, 0      ],
              [0, 0, 0,       0,        1, delta_t],
              [0, 0, 0,       0,        0, 1      ]]
```

Load `delta_t_s` for each frame from the sidecar JSON. Never use `1 / fps_nominal`.

### Step 2: BEV coordinate input

Modify the tracker to accept BEV gate base positions from `tracks/C_bev_egomotion/outputs/<clip_id>_bev.json` instead of raw pixel coordinates. Specifically, use the `base_px` field from the detections schema (which is already resolved through the 3-tier fallback by Track B) and project it into BEV coordinates using `homography_H_t` from the BEV schema.

If a detection has `is_degraded=True` (Tier-3 fallback active), apply a higher position uncertainty in the Kalman measurement noise matrix R for that observation.

### Step 3: ByteTrack dual-threshold association

Implement ByteTrack-style two-pass association in BEV space:

**Pass 1 (high-confidence):** Associate detections with `conf_class >= high_thresh` (use `high_thresh=0.5`) to existing tracks using a cost matrix with:
- Primary: Mahalanobis distance using Kalman innovation covariance
- Secondary (soft penalty, not hard gate): colour histogram distance + aspect ratio difference from `colour_histogram` and `aspect_ratio` fields in the detections schema. Weight: 0.2 × appearance_cost + 0.8 × mahalanobis_cost.
- Note: colour priors are unreliable in flat light — if `condition_light=flat` is flagged in the eval split manifest, down-weight the appearance term to 0.05.

**Pass 2 (low-confidence recovery):** Associate remaining unmatched detections with `conf_class >= low_thresh` (use `low_thresh=0.1`) to unmatched tracks from Pass 1. Use IoU-based distance only (no appearance) for this pass.

**Occlusion buffer:** Keep unmatched tracks alive for up to `max_lost=30` frames before deleting. During this period, propagate the track using Kalman prediction only (no observation).

### Step 4: Track output format

For each frame, output a list of active tracks. Each track must carry:
- `track_id`: stable integer ID (does not change during occlusion buffer)
- `bev_x`, `bev_y`: Kalman-filtered position in Topological BEV coordinates
- `bev_vx`, `bev_vy`: Kalman-filtered velocity
- `innovation_magnitude`: Mahalanobis distance of last accepted observation (useful for Track E degraded mode monitoring)
- `frames_since_observation`: 0 if updated this frame, >0 if coasting through occlusion buffer

Write track outputs to `tracks/D_tracking_outlier/outputs/<clip_id>_tracks.json`.

---

## Files you own

- `ski_racing/tracking.py` — your main file
- `tracks/D_tracking_outlier/outputs/` — per-clip track JSONs
- `tracks/D_tracking_outlier/reports/` — all reports

## Do NOT modify

- `shared/interfaces/` — READ ONLY
- `ski_racing/transform.py` — owned by Track C
- `ski_racing/detection.py` — owned by Track B
- `tracks/C_bev_egomotion/` and `tracks/B_model_retraining/` — READ ONLY

---

## Deliverables

- `ski_racing/tracking.py` — upgraded with PTS-driven Kalman and BEV-space ByteTrack
- `tracks/D_tracking_outlier/outputs/<clip_id>_tracks.json` — one per clip
- `tracks/D_tracking_outlier/reports/vfr_delta_t_verification_YYYYMMDD.md` — confirm delta_t values are non-uniform and used correctly
- `tracks/D_tracking_outlier/reports/track_regression_YYYYMMDD.md` — comparison vs. prior fixed-fps tracker

---

## Pass criteria

1. On a clip with known VFR: the `delta_t_s` values used in Kalman prediction are non-uniform (i.e., NOT `1/fps_nominal` repeated). Document the actual distribution of delta_t values in the verification report.
2. On a clip with a gate that temporarily disappears behind the skier for 5–15 frames: the `track_id` for that gate must survive the occlusion without a swap.
3. Track-ID switches: 0 on the 3 regression videos from `tracks/A_eval_harness/eval_split.json`.
4. Run the metric harness (`tracks/A_eval_harness/scripts/run_metrics.py`) on your track output. IDF1 must be >= the dummy baseline from `tracks/A_eval_harness/reports/baseline_dummy.json`.
