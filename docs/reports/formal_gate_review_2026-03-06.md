# Formal Gate Review -- 2026-03-06

## Verdict

**HOLD**

Phase 1 improved the corrected holdout set, but the project still does **not**
meet the formal gate required to start Phase 3 / 3D work.

---

## Evidence Reviewed

- `docs/reports/detection_graduation_baseline_2026-03-05.md`
- `docs/reports/detection_gap_report_2026-03-05.md`
- `docs/reports/eval_retrain_cycle1/holdout_eval_candidate.json`
- `docs/reports/eval_retrain_cycle1/summary.md`
- `eval/gate_live_regression_2026-03-06_cycle1/guardrail_comparison.md`

---

## Decision

### 1. G1 still fails

- Target: `F1 >= 0.85`
- Cycle1 best ensemble result: `F1 = 0.8176` at `conf = 0.36`
- Cycle1 best single-model result: `F1 = 0.7671` at `conf = 0.35`

This is an improvement over the prior corrected-baseline equivalent, but it is
still below the formal graduation threshold.

### 2. Behavioral live-overlay guardrails pass

On the frozen T1H live-regression set (`1571_raw`, `1575_raw`, `IMG_1310`):

- `blank_spawnable_calls`: unchanged vs baseline
- `ghost_calls`: unchanged vs baseline
- `max_blank_streak`: unchanged vs baseline

There is no evidence that the Phase 1 data fixes regressed live overlay
behavior.

### 3. Timing guardrail is not treated as a blocker for cycle1

The cycle1 live-regression timing numbers were worse than baseline, but the
comparison run notes concurrent training load on the same machine during the
measurement. Because the model and behavioral metrics were unchanged, this is
treated as environmental noise rather than a functional regression.

### 4. G4 remains pending, but it is not needed for this decision

A fresh full Stage 2 regression verdict was not required to reject promotion in
cycle1 because `G1` already failed. The next candidate that gets close enough
to promotion must run the full `scripts/run_eval.py` gate before any model
promotion is considered.

---

## Required Next Cycle

Cycle2 must be **data-only**. Do not spend another cycle retraining unchanged
data.

Focus areas:

1. Safety netting / finish-area fencing hard negatives
2. Gate-shadow hard negatives
3. Thin / distant / edge-clipped gate positives
4. Amateur cluttered-background small-gate positives

---

## Consequence

- Phase 3 / 3D work remains blocked.
- The next engineering milestone is another detection cycle, not 2D→3D
  reintroduction.
