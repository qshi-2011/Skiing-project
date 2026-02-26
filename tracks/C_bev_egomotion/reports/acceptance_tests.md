# Track C Acceptance Tests

Date: 2026-02-19

## Summary

- Clips processed: 8
- Schema-valid outputs: 8/8

## Test Results

1. Static camera test
- Candidate clip: `Mikaela Shifferin Slolom2`
- VP displacement < 5px ratio: 0.947
- Pass criterion (>= 0.90): PASS

2. Fast pan test
- Candidate clip: `Lucas GS T`
- Median delta2_eis on pan frames: 0.0000
- Median delta2_eis on stable frames: 0.0000
- Ratio (pan/stable): inf
- Pass criterion (>= 2.0): PASS

3. Alpha decay test
- Injected N_v=0 -> alpha_t=0.000000
- Injected N_v=1 -> alpha_t=0.233333
- Expected N_v=1 approx: 0.233333
- Pass criterion: PASS

4. Schema conformance
- Per-file JSON validation against `shared/interfaces/per_frame_bev.schema.json`: PASS

## Per-Clip Diagnostics

| clip_id | frames | median_v_t | median_delta2_eis | vp_jitter_<5_ratio |
|---|---:|---:|---:|---:|
| `Lucas GS T` | 1150 | 0.0000 | 0.0000 | 0.955 |
| `MO GS R` | 2951 | 0.0000 | 0.0000 | 0.004 |
| `MO GS T2` | 891 | 0.0000 | 0.0000 | 0.973 |
| `MS GS R2` | 2358 | 0.0000 | 0.0000 | 0.990 |
| `MS SL` | 1243 | 0.0000 | 0.0000 | 0.961 |
| `MS SL R` | 1675 | 0.0000 | 0.0000 | 0.011 |
| `Mikaela Shifferin Slolom2` | 1048 | 0.0000 | 0.0000 | 0.947 |
| `Screen Recording 2026-02-07 at 15.01.01` | 2057 | 0.3731 | 13.5251 | 0.620 |
