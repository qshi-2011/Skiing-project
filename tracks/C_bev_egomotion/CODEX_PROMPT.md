# Codex Prompt — Track C: Dynamic BEV & Ego-Motion (Wave 2, Worker A)

Paste everything below into a Codex environment with access to the full project root.

---

## Your role

You are **Wave 2, Worker A**. You run in parallel with Track B (Worker B). You own the dynamic Bird's-Eye View (BEV) projection and ego-motion estimation. Your outputs are consumed by Track D (Kalman tracker), Track B (Tier-2 keypoint fallback), and Track E (EIS safety signals). **Coordinate the VP_t interface with Track B before writing any code** — see "Critical coordination" below.

---

## Context

Smartphones use Electronic Image Stabilisation (EIS) which continuously crops the sensor, destroying any static camera calibration matrix K. We cannot use metric BEV. Instead we use a Topological (Relative) BEV — a dynamic ordinal projection that gives left/right, front/back ordering without absolute metres. The vanishing point VP_t derived from vertical pole structures gives us the horizon and the projective geometry we need.

The key insight: snow has no texture, so global optical flow fails. We instead track static background elements (trees, fences, gate poles) through RANSAC homography on semantically masked regions.

---

## Files to read first (in this order)

1. `tracks/README.md` — architecture and your role
2. `shared/interfaces/per_frame_bev.schema.json` — your PRIMARY output schema, must conform exactly
3. `shared/interfaces/sidecar_pts.schema.json` — your primary input schema (from Track A)
4. `tracker_spec_v2.docx` — Section 3.1 (VP decay), Section 3.2 (rolling shutter LUT), Section 4.1–4.2 (maths), Phase 1 (full spec)
5. `tracks/C_bev_egomotion/README.md` — acceptance criteria
6. `ski_racing/transform.py` — existing transform code you will extend

---

## Critical coordination (do this FIRST, before writing code)

**With Track B (Wave 2 Worker B):** The `vp_t` and `horizon_y_px` fields in your output schema are what Track B uses for its Tier-2 keypoint fallback (projecting an occluded gate base). You must agree on:

1. Coordinate system: image pixel coordinates, origin top-left, x rightward, y downward.
2. `horizon_y_px`: the y-coordinate in image pixels where the ground plane meets the horizon, derived from VP_t. For a standard ski slope shot, this is typically in the upper half of the frame.
3. The output file naming convention: `tracks/C_bev_egomotion/outputs/<clip_id>_bev.json`

Write these agreements down in `tracks/C_bev_egomotion/INTERFACE_AGREEMENT.md` and share with Track B before coding.

---

## What to build

### Step 1: Semantic masking

Create a masking module that, given a frame, segments out:
- Snow regions (large low-texture white/grey areas) — exclude from homography estimation
- Skier body (use existing person detector in `ski_racing/detection.py` or a simple colour/motion heuristic) — exclude

Retain: background structures (trees, fence posts, gate poles).

The mask does NOT need to be perfect — it just needs to prevent snow pixels from dominating the RANSAC inlier set.

### Step 2: Vanishing point estimation with soft linear decay

For each frame:
1. Run Hough line detection on the masked frame
2. Filter to near-vertical lines only (within 30° of vertical)
3. Run RANSAC to find the most consistent vanishing point from line intersections
4. Count `N_v` = number of RANSAC inlier lines

Apply the soft EMA:
```
alpha_t = alpha_max * max(0, min(1, N_v / N_req))
VP_t = alpha_t * VP_measured + (1 - alpha_t) * VP_{t-1}
```
where `alpha_max = 0.7`, `N_req = 3`.

For frame 0: `VP_0 = VP_measured` (no prior).

Derive `horizon_y_px` from `VP_t` — this is the y-coordinate of the vanishing point clamped to a physically plausible range (e.g., top 60% of frame).

### Step 3: RANSAC homography and EIS signals

On the masked background:
1. Extract feature points (SIFT or ORB) from background-only regions
2. Match features between consecutive frames
3. Compute RANSAC homography H_t (3×3)
4. Extract affine translation components `tx`, `ty` from H_t
5. Compute:
   - `v_t = sqrt(tx^2 + ty^2)`
   - `delta2_eis = |v_t - v_{t-1}|` (0.0 for frame 0)
   - `rolling_shutter_theta_deg = degrees(arctan(v_x_pixels_per_sec * tr_s / H_px))`
     - `v_x_pixels_per_sec` = `tx / delta_t_s` (from sidecar PTS)
     - `tr_s` = readout time from sidecar PTS `readout_time_ms / 1000`
     - `H_px` = frame height in pixels

### Step 4: Topological BEV projection

Apply localised H_t to project gate base positions into a relative 2D ordinal plane. The output is NOT in metres — it is a relative coordinate system where larger y means farther from camera and x gives left/right ordering. Store H_t (row-major, 9 floats) in the output JSON.

### Step 5: Output writer

Write one JSON file per clip to `tracks/C_bev_egomotion/outputs/<clip_id>_bev.json` conforming exactly to `shared/interfaces/per_frame_bev.schema.json`. Validate against the schema before writing.

---

## Files you own

- `ski_racing/transform.py` — extend with VP estimation and BEV projection logic
- `tracks/C_bev_egomotion/scripts/` — create any helper scripts here
- `tracks/C_bev_egomotion/outputs/` — all per-clip BEV JSON outputs
- `tracks/C_bev_egomotion/reports/` — validation reports and acceptance test results
- `tracks/C_bev_egomotion/INTERFACE_AGREEMENT.md` — coordination doc with Track B

## Do NOT modify

- `shared/interfaces/` — READ ONLY
- `ski_racing/detection.py` — read only (use the existing detector, don't change it)
- `ski_racing/tracking.py` — owned by Track D
- Any other track's folder

---

## Deliverables

- `ski_racing/transform.py` — extended with VP + BEV logic
- `tracks/C_bev_egomotion/outputs/<clip_id>_bev.json` — one per clip in eval split
- `tracks/C_bev_egomotion/INTERFACE_AGREEMENT.md` — VP_t coordinate agreement with Track B
- `tracks/C_bev_egomotion/reports/acceptance_tests.md` — results of all three acceptance tests

---

## Pass criteria

1. **Static camera test:** On any clip with no camera movement, `vp_t` frame-to-frame displacement (Euclidean distance between consecutive VP_t values) must be < 5px for at least 90% of frames.
2. **Fast pan test:** On a clip with a known fast lateral pan, `delta2_eis` must be >= 2× its median value on the pan frames vs. the stable frames.
3. **Alpha decay test:** Manually inject a frame with 0 vertical inliers (`N_v=0`). `alpha_t` must be 0.0 exactly. Inject a frame with 1 inlier. `alpha_t` must be approximately 0.23 (= 0.7 * 1/3).
4. All output JSONs validate against `shared/interfaces/per_frame_bev.schema.json`.
5. `INTERFACE_AGREEMENT.md` exists and is signed off by Track B Worker before Track D starts.
