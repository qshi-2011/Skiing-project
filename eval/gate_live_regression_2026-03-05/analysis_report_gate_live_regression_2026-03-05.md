# Live gate stabilization report (gate_live_regression_2026-03-05)

Output directory: `eval/gate_live_regression_2026-03-05`

## Per-video metrics

| video | calls | raw_p50 | shown_p50 | blank | blank_spawnable | ghost | avg_ms | p95_ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `1571_raw.MP4` | 560 | 13.00 | 11.00 | 9 | 0 | 6 | 37.84 | 40.87 |
| `1575_raw.MP4` | 352 | 7.00 | 6.00 | 6 | 0 | 9 | 38.37 | 43.11 |
| `IMG_1310.MOV` | 515 | 16.00 | 13.00 | 4 | 2 | 0 | 44.37 | 50.97 |

## Notable frames

### Ghost frame indices
- `1571_raw.MP4`: 1251, 1284, 1335, 1416, 1596, 1623
- `1575_raw.MP4`: 156, 216, 381, 408, 498, 558, 630, 903, 1017
- `IMG_1310.MOV`: none

### Worst blank streak segment per video
- `1571_raw.MP4`: frames `1338 -> 1341` (2 calls)
- `1575_raw.MP4`: frames `228 -> 228` (1 calls)
- `IMG_1310.MOV`: frames `1281 -> 1290` (4 calls)
