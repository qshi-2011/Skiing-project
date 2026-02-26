# Codex Prompt — Track F: Viterbi Sequence Decoder (Wave 4, Worker A)

Paste everything below into a Codex environment with access to the full project root.

---

## Your role

You are **Wave 4, Worker A**. You consume Track D (Kalman tracker) states and Track B (detector) emission log-probabilities. You produce per-frame HMM state assignments and a normalised sequence score S* that Track E uses for confidence monitoring and Track G uses for initialisation.

**Coordinate your S* output API with Track E (Worker C) at the start of Wave 4**, before you implement the output writer — they need to wire your score into their safety monitor.

---

## Context

The gate colour sequence in alpine skiing alternates: Red → Blue → Red → Blue. A naive detector will sometimes misclassify a gate due to flat light, snow spray, or motion blur. The HMM sequence decoder corrects these errors by reasoning over the full sequence context using a transition model (alternation is highly probable) and an emission model (detector confidence scores).

We add a Terminal (DNF) state to handle crashes and ski-outs: once the skier misses a gate and the geometric rhythm breaks down, the decoder must not cascade errors into subsequent gates.

The Viterbi decoder runs in fixed-lag mode (10–15 frame window) with log-space arithmetic to prevent underflow.

---

## Files to read first (in this order)

1. `tracks/README.md` — architecture and your role
2. `shared/interfaces/per_frame_detections.schema.json` — your primary input (emission_log_prob from Track B)
3. `shared/interfaces/per_frame_bev.schema.json` — secondary input (geometric residual from Track C)
4. `tracker_spec_v2.docx` — Section 4.4 (Viterbi maths, score formula), Phase 4 (full spec)
5. `tracks/F_viterbi_decoder/README.md` — acceptance criteria

---

## Critical coordination (start of Wave 4)

**With Track E (Worker C):** Your output must include `s_star` and `score_valid` per frame in a format Track E can consume in `update_with_decoder()`. Agree on field names and file location before implementing the output writer. Suggested format:

```json
{
  "frame_idx": 42,
  "state": "R",
  "score_valid": true,
  "s_star": -1.23,
  "s_star_margin": 0.45
}
```

`s_star_margin` = difference between best and second-best path score (useful for confidence monitoring).

Write this agreement to `tracks/F_viterbi_decoder/DECODER_API.md`.

---

## What to build

### Step 1: HMM definition

Create `ski_racing/decoder.py` with a `ViterbiDecoder` class.

**Hidden states:** `S = {R, B, DNF}` (Red, Blue, DNF/Terminal)

**Hand-tuned initial transition matrix A** (will be replaced by data-driven values in Track H):
```python
# log-space transition matrix A[from_state][to_state]
A = {
  "R":   {"R": log(0.05), "B": log(0.90), "DNF": log(0.05)},
  "B":   {"R": log(0.90), "B": log(0.05), "DNF": log(0.05)},
  "DNF": {"R": log(0.01), "B": log(0.01), "DNF": log(0.98)},  # absorbing
}
```

**Emission model:** Read `emission_log_prob` directly from the Track B detections schema. Do NOT recompute it. The three fields `log_prob_red`, `log_prob_blue`, `log_prob_dnf` map exactly to the three states.

**Geometric residual augmentation:** For each frame, compute a rhythm residual from Track C's BEV output — how consistent is the current gate spacing with the previous N gates? Add this as a soft bonus to the emission probability. If no BEV data is available, skip augmentation (don't crash).

### Step 2: Fixed-lag Viterbi in log-space

Implement fixed-lag smoothing with a window of `lag=12` frames (configurable):

```python
def decode_fixed_lag(self, observations: list[dict], lag: int = 12) -> list[dict]:
    """
    observations: list of per-frame dicts containing emission_log_prob
    Returns: list of per-frame state assignments with s_star
    """
```

At each new frame t:
1. Run forward Viterbi over the window [t-lag, t]
2. Emit the assignment for frame t-lag (the oldest frame in the window)
3. Slide the window forward

All arithmetic in log-space. Never call `exp()` inside the inner loop.

**Normalised score formula:**
```
S*(window) = (1/T) * max over paths of: sum_t [ log A(x_{t-1}, x_t) + log B(x_t, z_t) ]
```
where T = window length.

**Validity guard:** `score_valid = True` only if the number of gates observed so far (across the full sequence, not just the window) >= T_min = 5. Emit `score_valid = False` and `s_star = null` for shorter sequences.

### Step 3: DNF transition trigger

When the geometric residual exceeds a physically impossible threshold (gate spacing more than 3× the running median), force a transition into DNF state by setting:
```python
A[current_state]["DNF"] = log(0.99)  # override for this frame only
```

Reset to the default transition matrix after the frame is processed.

### Step 4: Output writer

Write one JSON file per clip to `tracks/F_viterbi_decoder/outputs/<clip_id>_decoder.json`. Format:
```json
{
  "clip_id": "...",
  "frames": [
    {
      "frame_idx": 0,
      "state": "R",
      "score_valid": false,
      "s_star": null,
      "s_star_margin": null
    },
    ...
  ]
}
```

---

## Files you own

- `ski_racing/decoder.py` — create this (main deliverable)
- `tracks/F_viterbi_decoder/outputs/` — per-clip decoder JSONs
- `tracks/F_viterbi_decoder/reports/` — acceptance test results
- `tracks/F_viterbi_decoder/DECODER_API.md` — output API agreement with Track E

## Do NOT modify

- `shared/interfaces/` — READ ONLY
- `ski_racing/tracking.py` — owned by Track D
- `ski_racing/detection.py` — owned by Track B
- Any other track's outputs — READ ONLY

---

## Deliverables

- `ski_racing/decoder.py` — ViterbiDecoder class
- `tracks/F_viterbi_decoder/outputs/<clip_id>_decoder.json` — one per clip
- `tracks/F_viterbi_decoder/DECODER_API.md` — API agreement with Track E
- `tracks/F_viterbi_decoder/reports/acceptance_tests_YYYYMMDD.md`

---

## Pass criteria

1. **DNF test:** On a synthetic sequence with perfect R/B/R/B/R then a crash at position 6 (emit DNF at frame 6): state assignments must be R, B, R, B, R, DNF, DNF, DNF... (DNF absorbing).
2. **Short sequence test:** On a 3-gate sequence, `score_valid` must be `False` for all frames. On a 5-gate sequence, `score_valid` must be `True` from frame 5 onward.
3. **Perfect alternation test:** On a synthetic 10-gate perfect R/B alternation: `s_star` must be at the maximum achievable value given the transition matrix.
4. **Log-space test:** Feed a 90-frame sequence. Confirm no `inf`, `-inf`, or `nan` values in any intermediate computation (add an assertion in debug mode).
5. `DECODER_API.md` exists and is confirmed by Track E before Wave 4 integration begins.
