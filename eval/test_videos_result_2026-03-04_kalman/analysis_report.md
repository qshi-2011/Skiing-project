# Live gate stabilization report (Kalman) — 2026-03-04

Output directory:
- `/Users/quan/Documents/personal/Stanford application project/eval/test_videos_result_2026-03-04_kalman`

Plan reviewed:
- `/Users/quan/Documents/personal/Stanford application project/docs/plans/PLAN_stabilize_gate_2.md`

Source of these artifacts:
- `scripts/test_live_gate_detection.py` (writes `run_summary.json` + per-video `*_live_gates_summary.json` + overlay `*_live_gates.mp4`)

---

## Run configuration (from summaries + script defaults)

Detector (YOLO):
- `gate_model`: `models/gate_detector_best.pt`
- `stride`: `3`
- `conf`: `0.15`
- `iou`: `0.55`
- `infer_width`: `1280`

Stabilizer (`LiveGateStabilizer`) — see `ski_racing/detection.py`:
- `show_stale=False`
- `max_shown_stale_calls=1` (1 missed inference call “grace”)
- `max_stale_calls=3` (default; drop after `stale_calls > 3`)
- `stale_conf_decay=0.85` (confidence EMA multiplier on inference misses)
- `min_hits_to_show=2`
- `spawn_conf=0.35`
- `update_conf_min=0.15`
- `display_conf=0.30`
- `meas_sigma_px=10.0`
- `accel_sigma_px=8.0`
- `maha_threshold=3.0`
- `match_threshold=130.0` (hard pixel distance cap)

Notes on semantics:
- `per_call` rows are **inference calls** (not every frame). With `stride=3`, each call corresponds to every 3rd frame.
- In the summaries, `stable_count` is the shown/stabilized gate count (kept for compatibility); `shown_count == stable_count` for this run.

---

## Aggregate results (this run)

Computed from the per-video `*_live_gates_summary.json` files:
- Videos: **11**
- Inference calls (total): **3,893**
- Raw miss calls (`count == 0`): **143**
- Ghost calls (`count == 0 && stable_count > 0`): **9**
- Max consecutive ghost streak: **1** (meets the “1-miss only” policy)
- Blank calls (`count > 0 && stable_count == 0`): **136**
- Miss immediately after detections (`prev count > 0`, `count == 0`): **11**
  - Held shown output on that miss (`stable_count > 0`): **9 / 11**

---

## Per-video snapshot

Definitions:
- `raw_p50`: median of `count` across inference calls (raw detector count)
- `shown_p50`: median of `stable_count` across inference calls (stabilizer output)
- `raw0`: number of inference calls with `count == 0`
- `ghost`: number of inference calls with `count == 0 && stable_count > 0`
- `blank`: number of inference calls with `count > 0 && stable_count == 0`

| video | calls | raw_p50 | shown_p50 | raw0 | ghost | blank | avg_infer_ms | p95_infer_ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `28_1752484118(原视频)` | 196 | 10.0 | 7.0 | 17 | 1 | 4 | 40.5 | 43.0 |
| `30_1752484596(原视频)` | 399 | 9.0 | 6.0 | 33 | 4 | 15 | 41.3 | 46.9 |
| `38_1752843425(原视频)` | 237 | 8.0 | 6.0 | 20 | 1 | 3 | 41.4 | 46.8 |
| `594_1732936638(原视频)` | 515 | 16.0 | 12.0 | 0 | 0 | 4 | 42.2 | 49.5 |
| `IMG_1309` | 278 | 16.0 | 11.0 | 0 | 0 | 1 | 44.5 | 50.5 |
| `IMG_1478` | 461 | 10.0 | 7.0 | 27 | 1 | 18 | 41.3 | 46.2 |
| `mmexport1704088159935` | 604 | 9.0 | 7.0 | 11 | 0 | 35 | 40.2 | 42.7 |
| `mmexport1704089261026` | 266 | 14.0 | 10.0 | 9 | 0 | 10 | 48.3 | 51.8 |
| `mmexport1706098456374` | 132 | 8.0 | 6.0 | 3 | 0 | 10 | 49.6 | 54.1 |
| `长城岭12.12(原视频)` | 503 | 9.0 | 5.0 | 22 | 1 | 31 | 42.8 | 47.1 |
| `长城岭12.8` | 302 | 8.0 | 6.0 | 1 | 1 | 5 | 55.9 | 62.1 |

---

## Notable frames to inspect quickly

All frame indices below are **video frame numbers** (the same ones logged in `per_call.frame` and rendered on the overlay).

Ghost frames (raw miss but still showing output by design):
- `28_1752484118(原视频)`: frame `312`
- `30_1752484596(原视频)`: frames `708`, `735`, `813`, `858`
- `38_1752843425(原视频)`: frame `261`
- `IMG_1478`: frame `1224`
- `长城岭12.12(原视频)`: frame `720`
- `长城岭12.8`: frame `504`

Miss-after-detection blanking (miss immediately after a detection call, but output still goes empty):
- `IMG_1478`: `prev_frame=1242 (count=2, shown=1, mean_conf≈0.224)` → miss at `frame=1245` with `shown=0`
- `mmexport1704089261026`: `prev_frame=459 (count=2, shown=2, mean_conf≈0.162)` → miss at `frame=462` with `shown=0`

Largest “raw>0 but shown==0” blank segments (consecutive inference calls):
- `mmexport1704088159935`: `19` calls, frames `1059 → 1113` (median `mean_conf≈0.283`)
- `长城岭12.12(原视频)`: `12` calls, frames `738 → 771` (median `mean_conf≈0.372`)
- `IMG_1478`: `8` calls, frames `1305 → 1326` (median `mean_conf≈0.381`)

One “severe overhang” case (very low raw but many shown):
- `38_1752843425(原视频)`: frame `165` (`count=1`, `stable_count=5`, `mean_conf≈0.205`)

---

## Why red/blue points “pop” in the demo

This is usually a **visualization artifact**, not the Kalman position stability.

There are two common causes depending on which renderer produced the video:

1) **Index-based coloring (colors are not tied to a track)**
   - In `scripts/test_live_gate_detection.py`, the overlay alternates colors by the list index (`i % 2`), not by `track_id`.
   - If the returned list order changes (e.g., slight base_y reorder, or a gate appears/disappears), the same physical gate can switch between even/odd index → the point flips red/blue.

2) **Class-based coloring (detector class may flip)**
   - In `ski_racing/visualize.py` live mode, the point color is derived from `gmeta["class"]` (red/blue gate class).
   - `LiveGateStabilizer` currently updates `track["class"]` to the latest matched detection every time. If the YOLO class prediction flickers on a borderline gate, the same track will flip class → the point flips color.

Fast way to confirm which one you’re seeing:
- Overlay the `track_id` next to each circle. If the `track_id` is stable but color flips, it’s almost certainly *color mapping* (index/class), not tracking instability.

Recommended visualization fix (low risk):
- Color by `track_id` for stability, and (optionally) render the detector `class` as a small `R/B` text label so you can still inspect class behavior without the color itself flickering.

---

## Recommendations / next steps

If the primary goal is **stable overlays** (minimal flicker) with the current “1-miss only” ghost constraint:
- Consider increasing `stale_conf_decay` (e.g. `0.95–1.0`) and/or lowering `display_conf` slightly. With `max_shown_stale_calls=1`, this improves “hold through one miss” without allowing multi-miss ghosts.

If the primary goal is **higher recall** (show gates even when confidence is marginal):
- Consider lowering `spawn_conf` closer to the detector `conf` threshold, or allowing immediate display on `hits==1` when detection confidence is very high.

To make future runs easier to compare:
- Extend `run_summary.json` to include stabilizer quality metrics (ghost streak, blank segments, miss-after-detection behavior) so regressions are obvious without opening videos.
