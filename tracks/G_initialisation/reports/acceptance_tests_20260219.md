# Wave 4 Acceptance Report (Track G)

Date: 2026-02-19  
Track: `G_initialisation`  
Scope completed: FIFO observation mode + retroactive decode initialisation + reset/flag path

## Implemented artifacts

- `tracks/G_initialisation/ski_racing/initialiser.py`
  - Added `SequenceInitialiser` with:
    - 90-frame FIFO frame buffer storing detections, extracted `emission_log_prob`, BEV positions, and `delta_t_s`
    - Trigger gate with all required checks (`T_min`, `score_valid`, `s_star >= tau_seq`, topology, persistence)
    - Retroactive full-sequence Viterbi pass over buffered emission log-probabilities (no detector recall)
    - Retroactive state/track assignment generation for all buffered frames
    - Kalman bootstrap payload seeding with `[x, y, vx, vy, s, ds]`
      - Position from last BEV position
      - Velocity from finite differences across the last 3 BEV points weighted by `delta_t_s`
      - Scale from mean bbox area
    - Reset path at 90-frame ceiling with `SYSTEM_UNINITIALIZED=True`
    - Success path emits `SYSTEM_UNINITIALIZED=False`
    - Per-clip event writer to `outputs/<clip_id>_init.json`

- `tracks/G_initialisation/tests/test_initialiser.py`
  - Test 1: early-gates-occluded -> triggers init and retroactive frame assignments
  - Test 2: no-valid-chain-in-90 -> emits reset and uninitialized flag, clears buffer
  - Test 3: no-detector-recall -> verifies detector callback call count remains 0 through retro decode
  - Test 4: velocity seeding -> checks seeded `vx` is within 20% of expected 5.0 units/frame

- `tracks/G_initialisation/outputs/demo_clip_init.json`
  - Example initialisation event payload matching required contract shape

## Notes on interfaces

- `tracks/F_viterbi_decoder/DECODER_API.md` was not present at implementation time.
- `SequenceInitialiser` therefore supports:
  - Direct consumption of current-frame decoder fields (`score_valid`, `s_star`, `gates_confirmed`, optional `topology_ok`, optional `persistence_ok`)
  - Optional injected retro decoder callable for full FIFO Viterbi decode
  - Fallback internal Viterbi decode if no external decoder is provided

## Test execution

Command used:

```bash
python3 -m pytest tests/test_initialiser.py -q
```

Result:

- 4 passed, 0 failed
- Runtime: 0.02s

