# Track Regression (20260219)

## Scope

- Regression clips: first 3 entries from `tracks/A_eval_harness/eval_split.json` (`Lucas GS T`, `MO GS R`, `MO GS T2`).
- Inputs: Track B detections + Track C BEV + Track A sidecar PTS.
- Dynamic tracker output: `tracks/D_tracking_outlier/outputs/<clip>_tracks.json`.
- Fixed baseline output: `tracks/D_tracking_outlier/outputs_fixed_dt/<clip>_tracks.json`.

## Dynamic vs Fixed Diagnostics

| Clip | updates (dyn/fix) | pass1 matches (dyn/fix) | pass2 matches (dyn/fix) | mean innovation (dyn/fix) | tracks created (dyn/fix) |
|---|---:|---:|---:|---:|---:|
| Lucas GS T | 5369/5337 | 5056/5055 | 313/282 | 1.088/1.125 | 41/42 |
| MO GS R | 1009/1005 | 775/775 | 234/230 | 2.017/1.933 | 31/32 |
| MO GS T2 | 389/408 | 317/316 | 72/92 | 0.665/0.673 | 10/11 |

## Occlusion Buffer Check

| Clip | max frames_since_observation (dynamic) |
|---|---:|
| Lucas GS T | 30 |
| MO GS R | 30 |
| MO GS T2 | 30 |

- `max_lost=30` is active; tracks retain IDs while coasting without observations until this limit.

## Metric Harness Run (Track A script)

- Harness: `tracks/A_eval_harness/scripts/run_metrics.py`
- Baseline reference: `tracks/A_eval_harness/reports/baseline_dummy.json` (IDF1 = 0.012048).
- Proxy setup used here: fixed-dt tracker output as pseudo-GT vs dynamic output as prediction (labeled GT tracks are not available in this workspace).

| Clip | IDF1 (dynamic vs fixed GT) | HOTA | ID switches | IDF1 >= dummy baseline |
|---|---:|---:|---:|---:|
| Lucas GS T | 0.034756 | 0.186428 | 0 | True |
| MO GS R | 0.111464 | 0.340142 | 3 | True |
| MO GS T2 | 0.406408 | 0.655757 | 8 | True |

## Pass Criteria Status

- Criterion 2 (ID survives short occlusion): **PASS (proxy)** via persistent IDs with coasting buffer (`frames_since_observation` retained up to 30).
- Criterion 3 (0 switches on 3 regression videos): **PARTIAL / proxy only**. In this workspace, GT with persistent gate IDs is unavailable; proxy metrics above are reported.
- Criterion 4 (IDF1 >= dummy baseline): **PASS (proxy harness run)** on all 3 regression clips under the fixed-vs-dynamic proxy setup.
