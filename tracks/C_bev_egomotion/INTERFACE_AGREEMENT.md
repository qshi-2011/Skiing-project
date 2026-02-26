# Interface Agreement: Track C (BEV/Ego-Motion) <-> Track B (Keypoint Fallback)

Date: 2026-02-19

This document defines the agreed interface contract for `vp_t`, `horizon_y_px`, and BEV output naming used by Track B Tier-2 VP-projected base fallback.

## Agreement Items

1. Coordinate system for `vp_t`
- Coordinate space: image pixel coordinates.
- Origin: top-left of frame.
- Axis directions: `x` increases rightward, `y` increases downward.
- Field mapping: `vp_t.x_px` and `vp_t.y_px` are the EMA-smoothed vanishing point in this coordinate system.

2. Definition of `horizon_y_px`
- `horizon_y_px` is the image-space y-coordinate (pixels) of the horizon inferred from `vp_t`.
- It is derived from `vp_t.y_px` and clamped to a physically plausible range in the upper 60% of frame height.
- Expected behavior for ski race footage: horizon typically lies in upper half of frame; consumers should treat this as a soft geometric prior.

3. Output naming convention
- Per-clip BEV output file path:
  - `tracks/C_bev_egomotion/outputs/<clip_id>_bev.json`

## Consumer Notes (Track B)

- Tier-2 VP-projected base fallback must use the above coordinate convention without re-normalization.
- If `alpha_t == 0.0`, `vp_t` is frozen and Tier-2 should be treated as unavailable, consistent with schema guidance.

## Sign-off

- Track C (Worker A): Signed
- Track B (Worker B): Signed — 2026-02-19, manager-confirmed after reviewing interface_agreement_trackC_trackB_20260219.md in tracks/B_model_retraining/reports/
