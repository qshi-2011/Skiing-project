# VFR Delta-t Verification (20260219)

## Scope

- Clips processed: `Lucas GS T`, `MO GS R`, `MO GS T2`
- Tracker mode: dynamic per-frame `delta_t_s` from sidecar PTS (Track A)
- Comparison mode: fixed `delta_t = 1/fps_nominal`

## Delta-t Distribution From Sidecars

| Clip | frame_count | unique delta_t (6dp) | min (s) | max (s) | mean (s) | std (s) | non-uniform |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lucas GS T | 1150 | 5 | 0.000000 | 0.033333 | 0.017630 | 0.004352 | True |
| MO GS R | 2951 | 5 | 0.000000 | 0.033333 | 0.017545 | 0.004207 | True |
| MO GS T2 | 891 | 6 | 0.000000 | 0.041667 | 0.027030 | 0.008660 | True |

## Proof Dynamic Delta-t Was Used In Kalman Prediction

| Clip | dynamic dt_std (used) | fixed dt_std (used) | dynamic dt_min | dynamic dt_max | fixed dt value |
|---|---:|---:|---:|---:|---:|
| Lucas GS T | 0.004321 | 0.000000 | 0.008333 | 0.033333 | 0.017645 |
| MO GS R | 0.004195 | 0.000000 | 0.008333 | 0.033333 | 0.017551 |
| MO GS T2 | 0.008612 | 0.000000 | 0.008333 | 0.041667 | 0.027048 |

## Result

- Pass criterion 1: **PASS**. All three clips show non-uniform sidecar `delta_t_s` and non-zero dynamic `dt_std` in tracker diagnostics.
- The fixed baseline shows `dt_std ≈ 0`, confirming the dynamic run is not using nominal FPS-only timing.
