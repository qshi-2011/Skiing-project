# Codex Prompt — Track H: Data-Driven Calibration (Wave 4, Worker D — runs last)

Paste everything below into a Codex environment with access to the full project root.

---

## Your role

You are **Wave 4, Worker D**. You run last, after Tracks D, E (full integration), F, and G are all passing their acceptance criteria. Your job is to replace every hand-tuned prior and TBD value in the pipeline with data-driven calibrated values, using the full pipeline running end-to-end on the frozen evaluation split.

---

## Context

Throughout the v2.1 pipeline, parameters are explicitly tagged as "Empirical — Phase 7 target" or "Analytical — do not learn." Your job is to calibrate the empirical ones. The analytical ones (notably the rolling shutter lean angle θ = arctan(vx × tr / H)) must NOT be learned — they are physics, not data.

Every TBD in Section 7 of `tracker_spec_v2.docx` (Threshold Registry) must have a value with a 95% confidence interval when you are done.

---

## Files to read first (in this order)

1. `tracks/README.md` — architecture and your role
2. `tracker_spec_v2.docx` — Section 7 (Threshold Registry) — your target list
3. `tracks/H_calibration/README.md` — acceptance criteria
4. `tracks/A_eval_harness/scripts/run_metrics.py` — the harness you'll run repeatedly
5. `tracks/A_eval_harness/eval_split.json` — the frozen evaluation split
6. All six other track READMEs — understand what each parameter controls before sweeping it

---

## What to calibrate

### Parameters to LEARN (sweep on eval split, measure IDF1/HOTA/jitter):

| Parameter | Current value | Where used | How to sweep |
|-----------|--------------|------------|--------------|
| `alpha_max` (VP EMA weight) | 0.7 | Track C `ski_racing/transform.py` | [0.3, 0.5, 0.7, 0.9] |
| `N_req` (VP inlier min) | 3 | Track C | [2, 3, 4, 5] |
| `+5° rolling shutter buffer` | 5° | Track B `ski_racing/detection.py` | [2°, 5°, 8°, 12°] |
| `tau_kp` (keypoint conf thresh) | TBD | Track B | [0.3, 0.4, 0.5, 0.6, 0.7] |
| `T_min` (seq length guard) | 5 gates | Track F/G | [3, 5, 7] |
| `FIFO buffer depth` | 90 frames | Track G | [45, 90] — 90 is likely correct, just verify |
| `eis_threshold` (Δ²EIS) | TBD | Track E | sweep using annotated EIS-jump clips |
| `stability_window N` | TBD | Track E | [5, 10, 15, 20] frames |
| `tau_seq` (S* init threshold) | TBD | Track G | [-3.0, -2.0, -1.5, -1.0] |
| `confidence_floor` (S* for DEGRADED) | TBD | Track E | [-4.0, -3.0, -2.0] |
| HMM matrix A | hand-tuned priors | Track F | learn from annotated sequences |
| HMM matrix B (emission weights) | hand-tuned priors | Track F | learn from detector confusion matrix |

### Parameters to DERIVE (do not sweep — compute analytically):

| Parameter | Formula | Notes |
|-----------|---------|-------|
| Rolling shutter θ | `arctan(vx × tr / H)` | Physics. Verify LUT entries (16ms/33ms) against empirical measurements if possible. |

### Parameters to VERIFY (sweep to confirm analytical estimate is adequate):

| Parameter | Current value | Notes |
|-----------|--------------|-------|
| Pan discriminator | ≥3 frames | Check that this threshold correctly separates legitimate pans from snaps in annotated clips |

---

## How to calibrate

### Step 1: Run baseline

Run the full pipeline end-to-end on the eval split with current hand-tuned priors. Record IDF1, HOTA, jitter, topological ordering error as your baseline. Save to `tracks/H_calibration/reports/baseline_YYYYMMDD.json`.

### Step 2: Single-parameter sweeps

For each empirical parameter, hold all others fixed at baseline and sweep the parameter across its range. For each value, run the metric harness and record the full metrics report. This is a grid sweep — run it on all clips in the eval split.

Save each sweep to `tracks/H_calibration/reports/sweep_<param_name>_YYYYMMDD.json`.

### Step 3: Learn HMM matrices

**Transition matrix A:** From annotated ground-truth gate sequences (extract from `data/annotations/`), count actual R→B, B→R, R→R, B→B, any→DNF transitions. Compute MLE estimates with Laplace smoothing (add 1 to each count). Convert to log-space.

**Emission matrix B:** Run the detector on the eval split with ground-truth labels. For each gate with known true colour, record the detector's class confidence. Fit a Beta distribution to P(conf | true_colour) for red and blue separately. The emission probability is then the Beta CDF evaluated at the observed confidence.

**Flat-light profiling:** Separately profile the detector confusion matrix on clips tagged `condition_light=flat` in `eval_split.json`. Report whether flat-light significantly degrades colour confidence. If it does, recommend down-weighting the appearance prior in Track D and Track F for flat-light clips.

### Step 4: Confidence intervals

For each learned parameter, compute a 95% confidence interval using bootstrap resampling (N=1000 bootstrap samples of the eval split). Report both the point estimate and the CI.

### Step 5: Joint optimisation (optional, time permitting)

After single-parameter sweeps, try a joint grid search over the 2–3 parameters with the highest individual sensitivity. This is optional — only if time permits.

### Step 6: Update configs

Write the calibrated values to `configs/tracker_v2_calibrated.yaml`. Format:
```yaml
# Tracker v2.1 Calibrated Thresholds
# Generated: YYYYMMDD by Track H calibration
# Eval split: tracks/A_eval_harness/eval_split.json
# Baseline IDF1: 0.XX  Calibrated IDF1: 0.XX

vp_ema:
  alpha_max: 0.XX  # CI: [0.XX, 0.XX]
  N_req: X

rolling_shutter:
  buffer_deg: X.X  # CI: [X.X, X.X]
  # theta is derived analytically — not listed here

keypoint:
  tau_kp: 0.XX  # CI: [0.XX, 0.XX]

sequence:
  T_min: X
  tau_seq: -X.X  # CI: [-X.X, -X.X]
  fifo_depth: 90

safety:
  eis_threshold: XX.X  # CI: [XX.X, XX.X]
  stability_window: X
  confidence_floor: -X.X  # CI: [-X.X, -X.X]

hmm:
  # A and B matrices saved separately
  A_matrix_path: tracks/H_calibration/outputs/hmm_A_YYYYMMDD.json
  B_matrix_path: tracks/H_calibration/outputs/hmm_B_YYYYMMDD.json
```

### Step 7: Update MODEL_REGISTRY.md

Add an entry to `shared/docs/MODEL_REGISTRY.md` documenting:
- The calibration run date and eval split version
- Baseline vs calibrated IDF1/HOTA
- Which parameters changed most significantly
- Any parameters that could not be estimated (with data collection recommendations)

---

## Files you own

- `tracks/H_calibration/scripts/` — calibration scripts
- `tracks/H_calibration/outputs/` — calibrated matrices and threshold files
- `tracks/H_calibration/reports/` — all sweep reports and CI analysis
- `configs/tracker_v2_calibrated.yaml` — final calibrated config (NEW file)
- `shared/docs/MODEL_REGISTRY.md` — update this

## Do NOT modify

- `shared/interfaces/` — READ ONLY
- `configs/regression_defaults.yaml` — READ ONLY (this is the frozen eval config)
- Any other track's source files

---

## Deliverables

- `tracks/H_calibration/reports/baseline_YYYYMMDD.json`
- `tracks/H_calibration/reports/sweep_<param>_YYYYMMDD.json` — one per parameter
- `tracks/H_calibration/reports/calibration_summary_YYYYMMDD.md` — human-readable summary
- `tracks/H_calibration/outputs/hmm_A_YYYYMMDD.json` — learned transition matrix
- `tracks/H_calibration/outputs/hmm_B_YYYYMMDD.json` — learned emission model
- `configs/tracker_v2_calibrated.yaml` — final calibrated config
- Updated `shared/docs/MODEL_REGISTRY.md`

---

## Pass criteria

1. Every parameter tagged "Yes" in the Threshold Registry (Section 7 of `tracker_spec_v2.docx`) has a calibrated value and 95% CI in `calibration_summary_YYYYMMDD.md`.
2. No parameter is listed as "TBD" without an explicit data collection recommendation explaining what additional data or annotation is needed.
3. Calibrated pipeline IDF1 >= baseline IDF1 on the held-out eval split.
4. Rolling shutter θ is NOT listed in the calibrated config as a learned value — it must remain derived analytically.
5. `configs/tracker_v2_calibrated.yaml` is syntactically valid YAML and every value has a CI annotation in a comment.
