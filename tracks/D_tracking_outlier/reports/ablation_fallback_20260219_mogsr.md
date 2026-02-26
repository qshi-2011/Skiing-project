# Fallback Ablation Report (2026-02-19)

## Scope
- Compares Tier-1/2/3 base resolution usage and temporal jitter proxies.
- Validates geometry check flags and emission log-probability constraints.
- Uses BEV from Track C when present; otherwise uses deterministic local BEV stub.

## Aggregate
- Clips processed: 1
- Detections total: 2488
- Tier 1 count: 1
- Tier 2 count: 243
- Tier 3 count: 2244
- Geometry check failures: 1
- Clips with stub BEV usage: 0

## Jitter Comparison
- Tier-2 jitter std median: 50.4645
- Tier-3 jitter std median: 112.3913
- Tier-3 counterfactual on Tier-2 events (median std): 738.7538
- Pass criterion (Tier-2 lower jitter than Tier-3 baseline): PASS
- Detail: Tier-2 median jitter std (50.465) < Tier-3 counterfactual median jitter std (738.754).

## Per-clip Summary
### MO GS R
- Frames written: 600
- Detections: 2488
- Tier counts: {'1': 1, '2': 243, '3': 2244}
- Geometry failures: 1
- Jitter std: {'tier2': 50.46452084898548, 'tier3': 112.39126812827485, 'tier2_counterfactual_tier3': 738.753813748421}
- Output JSON: `/Users/quan/Documents/personal/Stanford application project/tracks/D_tracking_outlier/inputs/per_frame_detections/MO GS R_detections.json`
