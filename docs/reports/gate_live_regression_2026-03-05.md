# Gate Live Regression Report -- 2026-03-05

**Preset:** T1H
**Model:** `models/gate_detector_best.pt`
**Runner:** `scripts/test_live_gate_detection.py`
**Output:** `eval/gate_live_regression_2026-03-05/`

## Baseline Source

Baseline: `eval/smoke_stageb_t1h_default/run_summary.json`

**Note:** The baseline run only contains data for `1571_raw.MP4` with 40 calls (appears to be a short/sampled run). The current regression run processed the full video (560 calls). The other two videos (`1575_raw.MP4`, `IMG_1310.MOV`) have no prior T1H baseline, so their results are reported as new baselines only.

## Guardrail Thresholds

| Metric | Rule |
|---|---|
| `blank_spawnable_calls` | May not increase by more than 1 absolute call vs baseline |
| `ghost_calls` | May not increase by more than 1 absolute call vs baseline |
| `max_blank_streak` | May not increase by more than 1 absolute call vs baseline |
| `avg_infer_ms` | May not regress by more than 15% |

---

## Per-Video Results

### 1571_raw.MP4 (has baseline)

| Metric | Baseline (40 calls) | Current (560 calls) | Delta | Threshold | Verdict |
|---|---|---|---|---|---|
| `blank_spawnable_calls` | 0 | 0 | 0 | +1 | PASS |
| `ghost_calls` | 0 | 6 | +6 | +1 | **FAIL** |
| `max_blank_streak` | 0 | 2 | +2 | +1 | **FAIL** |
| `avg_infer_ms` | 40.58 ms | 37.84 ms | -6.7% (faster) | +15% | PASS |

**Per-video verdict: FAIL** (ghost_calls +6, max_blank_streak +2)

**Caveat:** The baseline processed only 40 calls while the current run processed 560 calls (14x more frames). The baseline appears to be a short sample, not a full-video run. A fair comparison requires baselines from full-video runs. The ghost_calls=6 out of 560 calls is a 1.07% ghost rate, which is low in absolute terms. The max_blank_streak of 2 consecutive blank frames is also quite mild.

### 1575_raw.MP4 (no baseline -- new reference)

| Metric | Value |
|---|---|
| `calls` | 352 |
| `blank_calls` | 6 |
| `blank_spawnable_calls` | 0 |
| `max_blank_streak` | 1 |
| `ghost_calls` | 9 |
| `max_ghost_streak` | 1 |
| `avg_infer_ms` | 38.37 ms |
| `p95_infer_ms` | 43.11 ms |
| `shown_raw_ratio_p50` | 0.857 |

**Per-video verdict: N/A** (no baseline to compare)

### IMG_1310.MOV (no baseline -- new reference)

| Metric | Value |
|---|---|
| `calls` | 515 |
| `blank_calls` | 4 |
| `blank_spawnable_calls` | 2 |
| `max_blank_streak` | 4 |
| `ghost_calls` | 0 |
| `max_ghost_streak` | 0 |
| `avg_infer_ms` | 44.37 ms |
| `p95_infer_ms` | 50.97 ms |
| `shown_raw_ratio_p50` | 0.813 |

**Per-video verdict: N/A** (no baseline to compare)

---

## Overall Verdict

**FAIL (with caveats)**

The 1571_raw regression check fails on `ghost_calls` (+6) and `max_blank_streak` (+2) against the guardrail thresholds. However, the comparison is not apples-to-apples: the baseline processed only 40 calls while the regression run processed 560 calls (the full video). The failure metrics are low in absolute and relative terms:

- ghost_calls: 6/560 = 1.07% ghost rate
- max_blank_streak: 2 consecutive frames

The other two videos have no prior baselines and cannot be regression-tested.

## Anomalies and Concerns

1. **Baseline coverage gap:** Only 1 of 3 videos has a T1H baseline, and that baseline appears to be from a short/sampled run (40 calls vs 560 full). The guardrail comparison is unreliable without full-video baselines.

2. **IMG_1310.MOV blank streak:** This video has a max_blank_streak of 4 (frames 1281-1290), which is notable. The blank_spawnable_calls=2 is the highest of the three videos. Worth monitoring in future runs.

3. **1575_raw.MP4 ghost rate:** 9 ghost_calls out of 352 (2.56%) is the highest ghost rate across the three videos, though max_ghost_streak is only 1 (no consecutive ghosts).

4. **Inference speed:** All videos are within acceptable latency. avg_infer_ms ranges from 37.8 to 44.4 ms, well under any reasonable real-time budget.

## Recommendation

The formal guardrail comparison fails, but this is likely due to an inadequate baseline (short sample vs full video). **Recommend re-establishing baselines from full-video runs** before drawing regression conclusions. The absolute metric values look healthy for a live overlay system.

---

*Generated: 2026-03-05*
*Artifact: `eval/gate_live_regression_2026-03-05/run_summary.json`*
