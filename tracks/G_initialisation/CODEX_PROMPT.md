# Codex Prompt — Track G: Sequence-Based Initialisation (Wave 4, Worker B)

Paste everything below into a Codex environment with access to the full project root.

---

## Your role

You are **Wave 4, Worker B**. You consume Track F (Viterbi decoder) states and Track B (detections) buffered outputs. You implement the FIFO initialisation logic that bootstraps the Kalman tracker with optimal momentum once a valid gate chain is confirmed.

---

## Context

When the pipeline starts — or after a crash resets it — the system enters Observation Mode. It cannot emit confirmed gate assignments until it has seen enough gates to validate the sequence. The 90-frame FIFO buffer stores all incoming detections and their pre-computed emission log-probabilities. The moment a valid chain of T_min=5 gates is confirmed, the system runs full Viterbi backward over the buffer, assigns retroactive states, and initialises the Kalman tracks with momentum derived from the historical positions.

**Critical distinction:** The 90-frame FIFO is a failure ceiling — the maximum time the system stays uninitialised before giving up and resetting. In a typical slalom, initialisation fires within 10–15 frames (under 0.5 seconds). Do not design the system to always wait 90 frames.

---

## Files to read first (in this order)

1. `tracks/README.md` — architecture and your role
2. `shared/interfaces/per_frame_detections.schema.json` — your buffered input (emission_log_prob critical)
3. `tracks/F_viterbi_decoder/DECODER_API.md` — Track F output format (read this before implementing)
4. `tracker_spec_v2.docx` — Section 4.4 (FIFO init maths), Phase 5 (full spec)
5. `tracks/G_initialisation/README.md` — acceptance criteria
6. `ski_racing/tracking.py` — Kalman track bootstrapping interface

---

## What to build

### Step 1: FIFO buffer

Create `ski_racing/initialiser.py` with a `SequenceInitialiser` class.

The FIFO buffer stores, per frame:
```python
{
    "frame_idx": int,
    "detections": list,          # full detection dicts from Track B schema
    "emission_log_probs": list,  # extracted from detections for fast Viterbi access
    "bev_positions": list,       # BEV gate base positions from Track C
    "delta_t_s": float           # from sidecar PTS — needed for Kalman bootstrapping
}
```

Maximum depth: 90 frames. When the buffer is full and no valid chain has been found, clear it, reset to Observation Mode, and emit `SYSTEM_UNINITIALIZED=True` to Track E's SafetyMonitor.

### Step 2: Initialisation trigger

On each new frame, check whether the current buffer satisfies ALL conditions:
1. Number of distinct confirmed gates seen >= `T_min = 5`
2. `score_valid = True` from Track F's output for this frame
3. `s_star >= tau_seq` (use `-1.5` as starting prior — Phase 7 will calibrate)
4. Acceptable topological geometry: gates appear in a consistent spatial sequence in BEV coordinates (no large position reversals)
5. Minimum temporal persistence: each gate has been detected in at least `N_persist = 3` consecutive frames (use 3 as starting prior)

If all conditions met: trigger initialisation.

### Step 3: Retroactive Viterbi decode

On trigger:
1. Halt forward processing for one frame
2. Run full Viterbi over the entire FIFO buffer using stored `emission_log_probs`
3. **CRITICAL:** Use the stored emission log-probabilities — do NOT re-run the detector. Confirm this in your test (see Pass Criteria).
4. Get the optimal state sequence `X* = {x_0, x_1, ..., x_T}`
5. Assign track IDs and state labels (R/B/DNF) retroactively to all buffered frames

This is O(T × |S|²) ≈ 90 × 9 = 810 operations. It is fast. Do not optimise prematurely.

### Step 4: Kalman track bootstrapping

Using the retroactively assigned positions and state history:
1. For each gate that has been confirmed (state R or B, not DNF), initialise a Kalman track in `ski_racing/tracking.py`'s tracker
2. Seed the track's initial state vector `[x, y, vx, vy, s, ds]` using the retroactive position history:
   - Position: last known BEV position
   - Velocity: finite difference of last 3 BEV positions weighted by their delta_t_s values
   - Scale: mean bbox area over the buffer
3. Call Track D's tracker initialisation API to register these tracks

### Step 5: Output and flag emission

Write initialisation events to `tracks/G_initialisation/outputs/<clip_id>_init.json`:
```json
{
  "clip_id": "...",
  "events": [
    {
      "frame_idx": 14,
      "event": "INITIALIZED",
      "buffer_depth_at_trigger": 14,
      "gates_confirmed": 5,
      "s_star_at_trigger": -1.12
    }
  ]
}
```

On failure (buffer fills to 90 without valid chain):
```json
{"frame_idx": 89, "event": "RESET", "reason": "no_valid_chain_in_90_frames"}
```

Emit `SYSTEM_UNINITIALIZED=True` to Track E's SafetyMonitor on reset. Emit `SYSTEM_UNINITIALIZED=False` on successful initialisation.

---

## Files you own

- `ski_racing/initialiser.py` — create this (main deliverable)
- `tracks/G_initialisation/outputs/` — per-clip init event JSONs
- `tracks/G_initialisation/tests/` — automated tests
- `tracks/G_initialisation/reports/` — acceptance test results

## Do NOT modify

- `shared/interfaces/` — READ ONLY
- `ski_racing/decoder.py` — owned by Track F (call it, don't modify it)
- `ski_racing/detection.py` — owned by Track B
- Any other track's outputs — READ ONLY

---

## Deliverables

- `ski_racing/initialiser.py` — SequenceInitialiser class
- `tracks/G_initialisation/outputs/<clip_id>_init.json` — one per clip
- `tracks/G_initialisation/tests/test_initialiser.py` — automated tests
- `tracks/G_initialisation/reports/acceptance_tests_YYYYMMDD.md`

---

## Pass criteria

1. **Early-gates-occluded test:** On a synthetic clip where gates 1–4 have no detections and gate 5 is the first clean detection: the system must initialise at frame 5 (or as soon as T_min is satisfied) and retroactively assign states to frames 1–4.
2. **No-chain-in-90-frames test:** Feed 90 frames of random detections with no consistent gate chain. Assert that `SYSTEM_UNINITIALIZED=True` is emitted and the buffer is reset after frame 90.
3. **No detector re-call test:** Instrument the retroactive Viterbi pass and confirm that `ski_racing/detection.py` is NOT called during the retroactive decode. The test must verify this explicitly (e.g., mock the detector and assert it was called 0 times during the retroactive pass).
4. **Velocity seeding test:** After initialisation with a gate moving at ~5 BEV units/frame (computed from mock position history), assert that the seeded Kalman `vx` is within 20% of 5.0.
