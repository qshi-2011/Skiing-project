# Fallback Ablation Report (2026-02-19)

## Scope
- Compares Tier-1/2/3 base resolution usage and temporal jitter proxies.
- Validates geometry check flags and emission log-probability constraints.
- Uses BEV from Track C when present; otherwise uses deterministic local BEV stub.

## Aggregate
- Clips processed: 1
- Detections total: 1024
- Tier 1 count: 28
- Tier 2 count: 292
- Tier 3 count: 704
- Geometry check failures: 19
- Clips with stub BEV usage: 0

## Jitter Comparison
- Tier-2 jitter std median: 114.1659
- Tier-3 jitter std median: 107.3538
- Tier-3 counterfactual on Tier-2 events (median std): 277.2101
- Pass criterion (Tier-2 lower jitter than Tier-3 baseline): PASS
- Detail: Tier-2 median jitter std (114.166) < Tier-3 counterfactual median jitter std (277.210).

## Per-clip Summary
### MO GS T2
- Frames written: 600
- Detections: 1024
- Tier counts: {'1': 28, '2': 292, '3': 704}
- Geometry failures: 19
- Jitter std: {'tier2': 114.16594850475487, 'tier3': 107.35375930625004, 'tier2_counterfactual_tier3': 277.21006978734687}
- Output JSON: `/Users/quan/Documents/personal/Stanford application project/tracks/D_tracking_outlier/inputs/per_frame_detections/MO GS T2_detections.json`
