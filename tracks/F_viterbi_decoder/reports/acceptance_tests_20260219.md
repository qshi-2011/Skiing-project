# Track F Acceptance Tests (2026-02-19)

## Scope

Phase 4 deliverables for Track F (Viterbi sequence decoder):

- `ski_racing/decoder.py` (track-local implementation in `tracks/F_viterbi_decoder/ski_racing/decoder.py`)
- decoder outputs in `tracks/F_viterbi_decoder/outputs/`
- API agreement in `tracks/F_viterbi_decoder/DECODER_API.md`

## Test commands

```bash
python3 -m pytest -q tests/test_decoder.py
python3 scripts/run_decoder_batch.py
python3 - <<'PY'
import json,glob,math
for p in glob.glob('outputs/*_decoder.json'):
    d=json.load(open(p))
    bad=0
    for fr in d['frames']:
        for k in ('s_star','s_star_margin'):
            v=fr[k]
            if v is None:
                continue
            if not math.isfinite(v):
                bad += 1
    print(p, 'bad=', bad)
PY
```

## Results

- `python3 -m pytest -q tests/test_decoder.py`:
  - `4 passed in 0.02s`
- `python3 scripts/run_decoder_batch.py`:
  - wrote 3 files:
    - `outputs/Lucas GS T_decoder.json`
    - `outputs/MO GS R_decoder.json`
    - `outputs/MO GS T2_decoder.json`
- finite-value check on generated outputs:
  - all files reported `bad=0` for `s_star` and `s_star_margin`

## Pass criteria validation

1. DNF test: **PASS**
   - Automated by `test_dnf_absorbing_after_crash`.
   - Expected pattern validated: `R, B, R, B, R, DNF, DNF, DNF...`.

2. Short sequence test: **PASS**
   - Automated by `test_score_valid_guard_short_and_minimum_length`.
   - 3-gate sequence: all `score_valid=False`, `s_star=None`.
   - 5-gate sequence: `score_valid=True` once 5 observations have been seen.

3. Perfect alternation test: **PASS**
   - Automated by `test_perfect_alternation_hits_max_score`.
   - Verified `s_star = (9 * log(0.90)) / 10` for a 10-gate perfect alternation case.

4. Log-space finite test (90 frames): **PASS**
   - Automated by `test_log_space_finite_for_90_frames`.
   - Decoder runs in debug mode with finite-assert guards; no `inf`, `-inf`, `nan`.

5. API agreement for Track E integration: **PASS (documented)**
   - `DECODER_API.md` created with agreed fields:
     - `frame_idx`, `state`, `score_valid`, `s_star`, `s_star_margin`
   - Contract aligned to Track E Wave 4 `update_with_decoder()` expectations.

