# Track G — Sequence-Based Initialisation (Wave 4, Worker B)

## Owner
Wave 4, Worker B

## Starts after
Track F (Viterbi decoder) output API is stable — you consume decoder states and S*.

## You may READ from
- `tracks/F_viterbi_decoder/` — Viterbi state assignments and S* scores
- `tracks/B_model_retraining/` — per-frame detections with emission log-probabilities
- `tracks/D_tracking_outlier/` — Kalman tracker states (for bootstrapping)
- `shared/interfaces/per_frame_detections.schema.json`

## You may WRITE to
- `tracks/G_initialisation/` — all outputs and reports
- `ski_racing/` — initialisation module (coordinate naming with manager)

## Your job
Implement Phase 5 of the v2.1 spec:

**Observation Mode (FIFO buffer)** — On system startup, enter Observation Mode. Push all incoming detections AND their pre-computed `emission_log_prob` values into a FIFO buffer (max depth: 90 frames). Do NOT run the Viterbi decoder on buffered frames in real-time — wait for the trigger.

**Initialisation Trigger** — Fire when the first valid gate chain satisfies ALL of:
1. `T >= T_min = 5` gates observed
2. `S* >= tau_seq` (threshold TBD, Phase 7 target)
3. Acceptable topological geometry in BEV
4. Minimum temporal persistence (gate visible for N_persist consecutive frames, TBD)

**Retroactive Viterbi Decode** — On trigger: halt forward tracking for exactly one frame. Run full Viterbi over the entire FIFO buffer using stored `emission_log_prob` values (do NOT re-run the detector). O(T * |S|^2) ≈ 810 operations with |S|=3 — this is fast. Assign optimal state history to all buffered frames.

**Kalman Bootstrapping** — Initialise Kalman tracks using the retroactively assigned states. Tracks enter Phase 2 with optimal momentum from the decoded history.

**Failure Path** — If no valid chain is found within 90 frames: clear the buffer, reset to Observation Mode, emit `SYSTEM_UNINITIALIZED = true` flag to Track E.

## Critical implementation note
The 90-frame FIFO is a **failure ceiling**, not a startup cost. Normal initialisation fires within 10–15 frames. Do not design the system to always wait 90 frames before triggering.

## Acceptance criteria
- On a clip where gates 1–4 are fully occluded and gate 5 is the first clean detection: the system initialises correctly at gate 5 and retroactively assigns states to frames 1–4.
- On a clip where no valid chain appears in 90 frames: `SYSTEM_UNINITIALIZED` is emitted and the buffer is cleanly reset.
- The retroactive decode uses stored `emission_log_prob` values — verified by confirming the detector is NOT called during the retroactive pass.
