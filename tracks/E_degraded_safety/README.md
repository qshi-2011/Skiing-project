# Track E — Degraded Mode & Safety Scaffolding (Wave 3, Worker B)

## Owner
Wave 3, Worker B

## Starts after
Track C (BEV/ego-motion) outputs are available — you consume `delta2_eis` and `alpha_t`.

## You may READ from
- `tracks/C_bev_egomotion/` — per-frame BEV output (your primary input)
- `shared/interfaces/per_frame_bev.schema.json` — your input schema
- `ski_racing/` — existing source code (read only unless you own a module)

## You may WRITE to
- `tracks/E_degraded_safety/` — all outputs and reports
- `ski_racing/pipeline.py` — you own the flag emission logic (coordinate with manager)

## Your job (Wave 3 scope — scaffolding only)
Build the flag emission API that all downstream tracks will consume. Do NOT wire to Phase 4 confidence yet — that is Wave 4 Worker C's job.

**Flag Emission API** — Three boolean signals, emitted per frame:
- `LOW_CONFIDENCE` — system is running but sequence confidence is degraded
- `DEGRADED` — active failure condition; tracker still running but course sequencing frozen
- `SYSTEM_UNINITIALIZED` — system has not yet completed startup initialisation

**EIS Pan-vs-Snap Discriminator** — Consume `delta2_eis` from Track C BEV output. Trigger `DEGRADED` only if `delta2_eis` exceeds threshold for 1–2 consecutive frames. If elevated for 3+ consecutive frames, classify as legitimate pan onset and SUPPRESS the trigger.

**VP Collapse Detection** — Consume `alpha_t` from Track C BEV output. Trigger `DEGRADED` if `alpha_t = 0.0` (full VP freeze).

**Tier-3 Bbox Fallback Detection** — Consume `base_fallback_tier` from Track B detections. Trigger `LOW_CONFIDENCE` whenever any active detection is using Tier 3.

## Wave 4 integration (NOT your job in Wave 3)
Wave 4 Worker C will wire Track F's (Viterbi) `S*` score and confidence margin into the `DEGRADED` trigger. You provide the API surface; they do the wiring.

## Acceptance criteria
- **Synthetic test 1:** Feed a synthetic BEV stream where `delta2_eis` spikes for exactly 2 frames. `DEGRADED` must fire on those frames only.
- **Synthetic test 2:** Feed a synthetic BEV stream where `delta2_eis` is elevated for 5 consecutive frames. `DEGRADED` must NOT fire (legitimate pan, suppressed).
- **Synthetic test 3:** Feed `alpha_t = 0.0` for 3 frames. `DEGRADED` must fire for all 3.
- All three tests must be automated and runnable in CI.
