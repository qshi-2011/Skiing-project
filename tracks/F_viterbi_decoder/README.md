# Track F — Viterbi Sequence Decoder (Wave 4, Worker A)

## Owner
Wave 4, Worker A

## Starts after
Track D (Kalman tracker) outputs are stable — you consume tracker states.

## You may READ from
- `tracks/D_tracking_outlier/` — Kalman tracker per-frame track states
- `tracks/C_bev_egomotion/` — per-frame BEV geometric residuals
- `tracks/B_model_retraining/` — per-frame detection emission log-probabilities
- `shared/interfaces/per_frame_bev.schema.json`
- `shared/interfaces/per_frame_detections.schema.json`

## You may WRITE to
- `tracks/F_viterbi_decoder/` — all outputs and reports
- `ski_racing/` — new HMM/Viterbi module (coordinate naming with manager)

## Coordinate with (start of Wave 4)
**Track E (degraded_safety, Wave 4 Worker C integration)** — your `S*` score and confidence margin are the primary inputs for the sequence confidence collapse trigger. Agree on the output API for `S*` before you start implementation so Worker C can write the wiring simultaneously.

## Your job
Implement Phase 4 of the v2.1 spec:

**HMM with DNF Terminal State** — Hidden states: `{R, B, DNF}`. DNF is absorbing (once entered, probability of leaving is ~0). Observations: detector class confidence, shallow colour prior (flag as degraded under flat light), and Topological BEV geometric residual (rhythm/spacing from Track C).

**Transition Matrix A (hand-tuned priors for v1)**:
- High probability: R→B, B→R (alternation)
- Skip transitions with miss penalties: R→R, B→B
- Threshold into DNF: any→DNF when geometric residual is physically impossible
- Once in DNF: DNF→DNF = 1.0

**Fixed-Lag Viterbi (window = 10–15 frames)** — Execute in log-space to prevent underflow. Normalise score by sequence length T.

**Normalised score**: `S* = (1/T) * max_X sum_t [ log A(x_{t-1}, x_t) + log B(x_t, z_t) ]`

**Validity guard**: `S*` is INVALID and must not be emitted if `T < T_min = 5`. Emit a null/NaN and a `score_valid=false` flag instead.

**Emission log-probability storage**: The `emission_log_prob` field is already computed and stored in the per-frame detections schema (Track B). Read it directly — do NOT re-run the detector.

## Acceptance criteria
- On a synthetic sequence with a known crash at gate 8: DNF state must be assigned from gate 8 onward with no R/B states after.
- On a sequence of 3 gates: `score_valid` must be `false`.
- On a sequence of 5+ gates with perfect R/B alternation: `S*` must be the highest achievable value.
- Viterbi runs in log-space — no underflow even on sequences of 90 frames.
