# Decoder API Agreement (Track F -> Track E)

Date: 2026-02-19  
Tracks: F (Viterbi decoder) and E (degraded safety monitor)

This file defines the per-frame decoder payload consumed by Track E `update_with_decoder()`.
Field names are aligned with Track E Wave 4 prompt (`score_valid`, `s_star`) and include the
additional `s_star_margin` requested for confidence monitoring.

## File location

- Decoder outputs are written to:
  - `tracks/F_viterbi_decoder/outputs/<clip_id>_decoder.json`

## Payload shape

```json
{
  "clip_id": "MO GS R",
  "frames": [
    {
      "frame_idx": 42,
      "state": "R",
      "score_valid": true,
      "s_star": -1.23,
      "s_star_margin": 0.45
    }
  ]
}
```

## Field contract

- `frame_idx` (int): zero-based frame index.
- `state` (string enum): `R | B | DNF`.
- `score_valid` (bool): `true` only when observed sequence length at emit time is `>= 5`.
- `s_star` (float | null): normalised best-path score for the active Viterbi window.
- `s_star_margin` (float | null): best-path score minus second-best-path score.

## Consumption notes for Track E

- If `score_valid == false`, Track E must skip confidence-collapse checks for that frame.
- If `score_valid == true`, Track E can compare `s_star` against `confidence_floor`.
- `s_star_margin` is optional for trigger logic but recommended for additional confidence heuristics.

## Status

- Contract defined and implementation-complete in Track F.
- Compatible with Track E Wave 4 interface requirements in `tracks/E_degraded_safety/CODEX_PROMPT.md`.
- Ready for direct use by `SafetyMonitor.update_with_decoder()`.

