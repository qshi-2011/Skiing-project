# Track C — Dynamic BEV & Ego-Motion (Wave 2, Worker A)

## Owner
Wave 2, Worker A

## Starts after
Track A (eval harness) is complete and sidecar JSON schema is frozen.

## You may READ from
- `data/raw_videos/` or `data/frames/` — source frames
- `tracks/A_eval_harness/` — sidecar PTS JSON files
- `shared/interfaces/sidecar_pts.schema.json` — your input schema
- `shared/interfaces/per_frame_bev.schema.json` — your output schema (must conform exactly)
- `ski_racing/` — existing source code (read only unless you own the module)

## You may WRITE to
- `tracks/C_bev_egomotion/` — all your outputs and reports
- `ski_racing/transform.py` — you own BEV/homography logic (coordinate with manager if touching other modules)

## Coordinate with (BEFORE you start)
**Track B (Wave 2 Worker B)** — agree on the `per_frame_bev.schema.json` VP_t coordinate system and `horizon_y_px` definition in the first hour of Wave 2. Track B's Tier-2 keypoint fallback depends on your `vp_t` and `horizon_y_px` fields.

## Your job
Implement Phase 1 of the v2.1 spec:

**Semantic Masking** — Exclude snow and skier body pixels from all optical flow and homography estimation. Retain background (trees, fences) and gate poles.

**VP Estimation with Soft Linear Decay** — Detect vertical lines (RANSAC inliers only — not raw Hough lines). Compute:
- `alpha_t = alpha_max * max(0, min(1, N_v / N_req))` where `alpha_max=0.7`, `N_req=3`
- `VP_t = alpha_t * VP_measured + (1 - alpha_t) * VP_{t-1}`

**Relative Motion & EIS Signals** — RANSAC homography on masked background. Extract affine translation (tx, ty). Compute:
- `v_t = sqrt(tx^2 + ty^2)` (translation magnitude)
- `delta2_eis = |v_t - v_{t-1}|` (second derivative — primary EIS snap signal)
- `rolling_shutter_theta_deg = degrees(arctan(vx * tr / H))` using `tr` from the sidecar PTS LUT

**Topological BEV Projection** — Apply localised `H_t` to project gate bases into a relative ordinal 2D plane. No absolute metres.

**Output** — One per-frame BEV JSON per clip, conforming to `shared/interfaces/per_frame_bev.schema.json`.

## Acceptance criteria
- On a static camera clip: `vp_t` jitter (frame-to-frame displacement) must be below a documented threshold.
- On a clip with a known fast pan: `delta2_eis` spikes on the correct frame.
- On a clip with fewer than 3 vertical inliers: `alpha_t` drops below 0.7 proportionally.
- All output files validate against `per_frame_bev.schema.json`.
