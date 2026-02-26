## 2026-02-19 — Track H Calibration (v2.1)

- Eval split: `tracks/A_eval_harness/eval_split.json` (8 clips)
- Calibration outputs:
  - `tracks/H_calibration/configs/tracker_v2_calibrated.yaml`
  - `tracks/H_calibration/outputs/hmm_A_20260219.json`
  - `tracks/H_calibration/outputs/hmm_B_20260219.json`
  - `tracks/H_calibration/reports/calibration_summary_20260219.md`
- Baseline aggregate metrics (proxy GT protocol):
  - IDF1: `0.5368`
  - HOTA: `0.7856`
- Most significant threshold updates:
  - `alpha_max`: `0.7 -> 0.3`
  - `N_req`: `3 -> 2`
  - `rolling_shutter.buffer_deg`: `5 -> 8`
  - `eis_threshold`: `TBD -> 0.05`
  - `stability_window`: `TBD -> 5`
- Data gaps noted:
  - Full labelled per-frame GT track IDs + true gate colours are not present for all eval clips.
  - HMM B emission calibration currently uses proxy labels and should be re-fit once true colour annotations are available.
