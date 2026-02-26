# Wave 4 Acceptance Report (Track E)

Date: 2026-02-20
Track: `E_degraded_safety`
Scope completed: SafetyMonitor S* confidence-collapse trigger (Wave 4 only)

## Summary

Successfully integrated Track F's decoder outputs (`s_star`, `score_valid`) into SafetyMonitor as a fourth confidence-collapse trigger. All existing Wave 3 tests remain passing; 3 new Wave 4 tests added and passing.

## Implemented artifacts

### 1. `tracks/E_degraded_safety/ski_racing/safety.py`

**Constructor updates:**
- Added `confidence_floor` parameter (default: -2.0 from Track H calibration)
- Parameter is stored as instance variable for use by `update_with_decoder()`

**New method: `update_with_decoder(decoder_frame: dict) -> dict`**
- Consumes decoder frame payload (Contract: Track F DECODER_API.md)
- Expected input keys: `frame_idx`, `state`, `score_valid`, `s_star`, `s_star_margin`
- Logic:
  - Returns dict with `frame_idx`, `LOW_CONFIDENCE`, `degraded_reason`
  - Only evaluates confidence collapse when `score_valid == True`
  - When `score_valid == True` and `s_star < confidence_floor`:
    - Sets `LOW_CONFIDENCE = True`
    - Sets `degraded_reason = 's_star_collapse'`
  - When `score_valid == False`, returns `LOW_CONFIDENCE = False` (no collapse check)
- **API invariant:** Existing `update(bev_frame, detection_frame)` method is unchanged; Wave 4 adds a new entry point that does not affect Wave 3 callers.

### 2. `tracks/E_degraded_safety/tests/test_safety_monitor.py`

Added 3 new tests (Tests 5, 6, 7 in execution order):

**Test 4 (old): `test_score_collapse_triggers_system_uninitialized`** — Wave 3, still passing

**Test 5 (new): `test_s_star_collapse_triggers_low_confidence`**
- Setup: `SafetyMonitor(confidence_floor=-2.0)`
- Call: `update_with_decoder({"frame_idx": 0, "score_valid": True, "s_star": -3.5, ...})`
- Assert: `result['LOW_CONFIDENCE'] == True` and `result['degraded_reason'] == 's_star_collapse'`
- Status: PASS

**Test 6 (new): `test_s_star_above_floor_no_flag`**
- Setup: `SafetyMonitor(confidence_floor=-2.0)`
- Call: `update_with_decoder({"frame_idx": 1, "score_valid": True, "s_star": -1.0, ...})`
- Assert: `result['LOW_CONFIDENCE'] == False` and `result['degraded_reason'] == None`
- Status: PASS

**Test 7 (new): `test_score_not_valid_skips_collapse_check`**
- Setup: `SafetyMonitor(confidence_floor=-2.0)`
- Call: `update_with_decoder({"frame_idx": 2, "score_valid": False, "s_star": -99.0, ...})`
- Assert: `result['LOW_CONFIDENCE'] == False` (score not yet valid, so no collapse trigger)
- Status: PASS

## Parameters used

| Parameter | Value | Source |
|---|---|---|
| `eis_threshold` | 50.0 | Wave 3 default |
| `stability_window` | 0 | Wave 3 default (synthetic tests) |
| `confidence_floor` | -2.0 | Track H calibration (calibration_summary_20260219.md, row: confidence_floor) |

## Test execution results

Command:
```bash
cd "/sessions/blissful-sweet-thompson/mnt/Stanford application project"
python3 -m pytest tracks/E_degraded_safety/tests/test_safety_monitor.py -v
```

Output:
```
============================= test session starts ==============================
tracks/E_degraded_safety/tests/test_safety_monitor.py::test_eis_two_frame_spike_triggers_degraded_only_on_spike_frames PASSED [ 14%]
tracks/E_degraded_safety/tests/test_safety_monitor.py::test_eis_five_frame_elevation_is_classified_as_pan_and_suppressed PASSED [ 28%]
tracks/E_degraded_safety/tests/test_safety_monitor.py::test_vp_collapse_alpha_zero_triggers_degraded_on_all_frames PASSED [ 42%]
tracks/E_degraded_safety/tests/test_safety_monitor.py::test_score_collapse_triggers_system_uninitialized PASSED [ 57%]
tracks/E_degraded_safety/tests/test_safety_monitor.py::test_s_star_collapse_triggers_low_confidence PASSED [ 71%]
tracks/E_degraded_safety/tests/test_safety_monitor.py::test_s_star_above_floor_no_flag PASSED [ 85%]
tracks/E_degraded_safety/tests/test_safety_monitor.py::test_score_not_valid_skips_collapse_check PASSED [100%]

============================== 7 passed in 0.02s =======================================
```

**Summary:** 7 tests passed (4 Wave 3 + 3 Wave 4), 0 failed.

## Decoder API contract

Track F's `DECODER_API.md` defines the payload consumed by `SafetyMonitor.update_with_decoder()`:

```json
{
  "frame_idx": 42,
  "state": "R",
  "score_valid": true,
  "s_star": -1.23,
  "s_star_margin": 0.45
}
```

Key fields:
- `score_valid` (bool): `true` only when observed sequence length >= 5. When `false`, confidence-collapse checks are skipped.
- `s_star` (float): normalized best-path score for the active Viterbi window.
- `s_star_margin` (float): optional; best-path minus second-best-path score. Not required for trigger logic.

## Scope constraints and notes

- All writes restricted to `tracks/E_degraded_safety/` folder only.
- No modifications to other track folders or shared `ski_racing/` package.
- Wave 3 tests remain unmodified and passing.
- `update()` method (Wave 3) is unchanged; new entry point does not affect existing callers.
- `confidence_floor` default value (-2.0) sourced directly from Track H calibration sweep (calibration_summary_20260219.md).

## Acceptance criteria

- [x] `confidence_floor` parameter added to `SafetyMonitor.__init__()`
- [x] `update_with_decoder()` method implements s_star < confidence_floor logic
- [x] Test 5 (s_star_collapse_triggers_low_confidence) passes
- [x] Test 6 (s_star_above_floor_no_flag) passes
- [x] Test 7 (score_not_valid_skips_collapse_check) passes
- [x] All Wave 3 tests (1-4) still passing
- [x] No breaking changes to existing `update()` API
- [x] All 7 tests run in < 1 second

## Status

✓ WAVE 4 COMPLETE AND ACCEPTED
