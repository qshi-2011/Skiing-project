# Codex Prompt — Track E: Degraded Mode & Safety Scaffolding (Wave 3 + Wave 4)

Paste everything below into a Codex environment with access to the full project root.

---

## Your role

You are **Wave 3, Worker B** (scaffold) and **Wave 4, Worker C** (full integration). Your work has two phases. In Wave 3 you build the flag emission API and the detection logic. In Wave 4, after Track F (Viterbi) is done, you wire Track F's S* confidence into your triggers to complete the system.

---

## Context

The v2.1 pipeline needs a safety layer that monitors three independent signals and emits standardised flags that all downstream consumers (live dashboards, post-run analysis) can subscribe to. The three flags are:
- `SYSTEM_UNINITIALIZED`: pipeline has not yet confirmed a valid gate sequence
- `DEGRADED`: an active failure condition is present; tracker running but course sequencing is frozen
- `LOW_CONFIDENCE`: system is running normally but confidence is below a usable threshold

The system must distinguish between a legitimate fast pan (camera operator tracking the skier) and an EIS snap (instantaneous crop jump). The discriminator is temporal: a snap spikes for 1–2 frames; a pan ramps over 3+ frames.

---

## Files to read first (in this order)

1. `tracks/README.md` — architecture and your role
2. `shared/interfaces/per_frame_bev.schema.json` — your primary input (delta2_eis, alpha_t from Track C)
3. `shared/interfaces/per_frame_detections.schema.json` — secondary input (is_degraded flag from Track B)
4. `tracker_spec_v2.docx` — Section 3.4 (EIS detection maths), Section 4.5, Phase 6 (full spec)
5. `tracks/E_degraded_safety/README.md` — acceptance criteria
6. `ski_racing/pipeline.py` — where you will add flag emission

---

## Wave 3 work: Build the scaffold

### Step 1: Flag emission API

Create `ski_racing/safety.py` with a `SafetyMonitor` class:

```python
class SafetyMonitor:
    def __init__(self, eis_threshold: float, stability_window: int):
        ...

    def update(self, bev_frame: dict, detection_frame: dict) -> dict:
        """
        Returns per-frame flag dict:
        {
          "frame_idx": int,
          "SYSTEM_UNINITIALIZED": bool,
          "DEGRADED": bool,
          "LOW_CONFIDENCE": bool,
          "degraded_reason": str | None  # "eis_snap" | "vp_collapse" | "tier3_active" | "confidence_collapse"
        }
        """
```

### Step 2: EIS pan-vs-snap discriminator

Consume `delta2_eis` from the BEV frame. Implement a sliding frame counter:

```python
# Pseudo-code
if delta2_eis > eis_threshold:
    consecutive_spike_count += 1
else:
    consecutive_spike_count = 0

if 1 <= consecutive_spike_count <= 2:
    trigger_DEGRADED(reason="eis_snap")
elif consecutive_spike_count >= 3:
    # Legitimate pan onset — suppress the trigger
    suppress_DEGRADED()
```

`eis_threshold` is a constructor parameter (TBD — use 50.0 pixels as a starting prior, Phase 7 will calibrate). Log the value used in every report.

### Step 3: VP collapse detection

Consume `alpha_t` from the BEV frame:
```python
if alpha_t == 0.0:
    trigger_DEGRADED(reason="vp_collapse")
```

### Step 4: Tier-3 bbox fallback monitoring

Consume `is_degraded` from the detections frame. If ANY active detection has `is_degraded=True`:
```python
trigger_LOW_CONFIDENCE(reason="tier3_active")
```

### Step 5: Stability window

When DEGRADED has been triggered, maintain a countdown. Only clear DEGRADED after `stability_window` consecutive frames with no active trigger. `stability_window` is a constructor parameter (TBD — use 15 frames as starting prior).

### Step 6: Wire into pipeline

In `ski_racing/pipeline.py`, instantiate `SafetyMonitor` and call `monitor.update()` per frame. Append the flag dict to each frame's pipeline output JSON.

### Step 7: Automated acceptance tests

Create `tracks/E_degraded_safety/tests/test_safety_monitor.py` with three tests using synthetic inputs:

**Test 1:** Feed `delta2_eis` spiking for exactly 2 frames (values: 0, 0, 100, 100, 0). Assert `DEGRADED=True` on frames 2 and 3, `DEGRADED=False` on others.

**Test 2:** Feed `delta2_eis` elevated for 5 consecutive frames (values: 0, 100, 100, 100, 100, 100, 0). Assert `DEGRADED=False` on ALL frames (legitimate pan).

**Test 3:** Feed `alpha_t=0.0` for 3 frames. Assert `DEGRADED=True` on all 3.

Run with: `pytest tracks/E_degraded_safety/tests/`

---

## Wave 4 work: Full S* integration (start only after Track F is done)

### Step 8: Sequence confidence collapse trigger

Track F (Viterbi decoder) emits `S*` and `score_valid` per frame in its output. Add a new trigger to `SafetyMonitor`:

```python
def update_with_decoder(self, viterbi_frame: dict):
    if not viterbi_frame["score_valid"]:
        return  # too short to judge
    if viterbi_frame["s_star"] < confidence_floor:
        trigger_DEGRADED(reason="confidence_collapse")
        trigger_LOW_CONFIDENCE(reason="confidence_collapse")
```

`confidence_floor` is a constructor parameter (TBD — use -2.0 in log-space as starting prior).

### Step 9: Add Test 4 to acceptance suite

**Test 4:** Feed a valid viterbi frame with `s_star = -5.0` (below floor). Assert `DEGRADED=True` and `LOW_CONFIDENCE=True`.

---

## Files you own

- `ski_racing/safety.py` — create this (main deliverable)
- `ski_racing/pipeline.py` — add flag emission wiring (coordinate with manager if others are touching this file)
- `tracks/E_degraded_safety/tests/` — automated tests
- `tracks/E_degraded_safety/reports/` — test results and reports

## Do NOT modify

- `shared/interfaces/` — READ ONLY
- `ski_racing/tracking.py` — owned by Track D
- `ski_racing/transform.py` — owned by Track C
- `ski_racing/detection.py` — owned by Track B

---

## Deliverables (Wave 3)

- `ski_racing/safety.py` — SafetyMonitor class
- `tracks/E_degraded_safety/tests/test_safety_monitor.py` — 3 automated tests passing
- `tracks/E_degraded_safety/reports/wave3_acceptance_YYYYMMDD.md`

## Deliverables (Wave 4)

- `ski_racing/safety.py` — extended with S* confidence collapse trigger
- `tracks/E_degraded_safety/tests/test_safety_monitor.py` — 4 tests passing
- `tracks/E_degraded_safety/reports/wave4_acceptance_YYYYMMDD.md`

---

## Pass criteria (Wave 3)

1. All 3 synthetic tests pass via `pytest`.
2. Pan discriminator: `delta2_eis` elevated for 3+ frames does NOT trigger DEGRADED.
3. EIS snap: `delta2_eis` elevated for 1–2 frames DOES trigger DEGRADED.
4. `SafetyMonitor` integrates cleanly into `pipeline.py` with no import errors.

## Pass criteria (Wave 4)

1. All 4 synthetic tests pass via `pytest`.
2. `update_with_decoder()` correctly reads Track F output format (coordinate with Track F Worker on the exact field names).
