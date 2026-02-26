# Fallback Ablation Report (2026-02-19)

## Scope
- Compares Tier-1/2/3 base resolution usage and temporal jitter proxies.
- Validates geometry check flags and emission log-probability constraints.
- Uses BEV from Track C when present; otherwise uses deterministic local BEV stub.

## Aggregate
- Clips processed: 1
- Detections total: 8614
- Tier 1 count: 122
- Tier 2 count: 223
- Tier 3 count: 8269
- Geometry check failures: 84
- Clips with stub BEV usage: 0

## Jitter Comparison
- Tier-2 jitter std median: 295.7479
- Tier-3 jitter std median: 116.8622
- Tier-3 counterfactual on Tier-2 events (median std): 257.5110
- Pass criterion (Tier-2 lower jitter than Tier-3 baseline): CHECK
- Detail: Tier-2 median jitter std (295.748) >= Tier-3 counterfactual median jitter std (257.511).

## Per-clip Summary
### Lucas GS T
- Frames written: 600
- Detections: 8614
- Tier counts: {'1': 122, '2': 223, '3': 8269}
- Geometry failures: 84
- Jitter std: {'tier2': 295.7478725808414, 'tier3': 116.86221377580513, 'tier2_counterfactual_tier3': 257.51098319107604}
- Output JSON: `/Users/quan/Documents/personal/Stanford application project/tracks/D_tracking_outlier/inputs/per_frame_detections/Lucas GS T_detections.json`
