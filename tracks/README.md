# Alpine Ski Racing AI — Track Workspaces (v2.1)

## Quick Start
1. Find your assigned track folder below
2. Read the README.md inside your track folder
3. Read `tracker_spec_v2.docx` at the project root — it has all the architectural details
4. Read the interface schemas in `shared/interfaces/` — these define your input/output contracts
5. Check the `reports/` subfolder for existing analysis and baselines

## Architecture Rule
All workers share a single repo root. The rule is simple:
- **Read** from anywhere you need
- **Write** only to your own track folder (and `shared/docs/` if noted in your README)
- **Never edit** a file owned by another track without coordinating with the manager first

---

## Interface Contracts (lock these before Wave 2 starts)

These three files define the data formats connecting tracks. They are the most important coordination files in the repo.

| Schema | Produced by | Consumed by |
|--------|-------------|-------------|
| `shared/interfaces/sidecar_pts.schema.json` | Track A | All tracks |
| `shared/interfaces/per_frame_bev.schema.json` | Track C | Tracks B, D, E |
| `shared/interfaces/per_frame_detections.schema.json` | Track B | Tracks D, F, G |

---

## Wave Structure & Track Map

```
WAVE 1 (blocker — start first, nothing else can start)
└── Track A: A_eval_harness          ← PTS extractor, metric harness, eval split

WAVE 2 (parallel — start together after Wave 1)
├── Track C: C_bev_egomotion         ← Dynamic BEV, VP estimation, EIS signals
└── Track B: B_model_retraining      ← YOLOv8-Pose + 3-tier fallback hierarchy
    *** Coordinate VP_t interface between B and C before starting ***

WAVE 3 (parallel — start after Wave 2)
├── Track D: D_tracking_outlier      ← VFR Kalman tracker (needs Track C BEV)
└── Track E: E_degraded_safety       ← Flag API scaffold (needs Track C EIS signals)
    (Track E full integration with Viterbi S* deferred to Wave 4)

WAVE 4 (Track D must be stable first; then F, G, E-integration run in parallel)
├── Track F: F_viterbi_decoder       ← HMM Viterbi, S* score
├── Track G: G_initialisation        ← 90-frame FIFO, retroactive init
├── Track E: E_degraded_safety       ← Full integration: wire Track F S* into triggers
└── Track H: H_calibration           ← Data-driven calibration (runs last, after F+G+E done)
```

---

## Dependency Graph

```
Track A (Eval Harness)
        │
        ├─────────────────┐
        ▼                 ▼
Track C (BEV)        Track B (Detector)
        │                 │
        └────────┬────────┘
                 ▼
        Track D (Kalman)    Track E (scaffold)
                 │
                 ▼
        Track F (Viterbi) ──► Track E (full integration)
                 │
                 ▼
        Track G (Init)
                 │
                 ▼
        Track H (Calibration)
```

---

## Track Summary

| Track | Folder | Wave | Priority | Summary |
|-------|--------|------|----------|---------|
| **A** | `A_eval_harness/` | W1 | **BLOCKER** | PTS extractor, metric harness, frozen eval split |
| **B** | `B_model_retraining/` | W2 | High | YOLOv8-Pose + 3-tier keypoint fallback hierarchy |
| **C** | `C_bev_egomotion/` | W2 | High | Dynamic BEV, VP soft decay, EIS Δ² signal |
| **D** | `D_tracking_outlier/` | W3 | High | PTS-driven Kalman, ByteTrack dual-threshold |
| **E** | `E_degraded_safety/` | W3+W4 | High | Flag API scaffold (W3), full S* integration (W4) |
| **F** | `F_viterbi_decoder/` | W4 | High | HMM {R,B,DNF}, fixed-lag Viterbi, S* score |
| **G** | `G_initialisation/` | W4 | High | 90-frame FIFO, retroactive Viterbi init |
| **H** | `H_calibration/` | W4 last | Medium | Learn A, B matrices and all empirical thresholds |

### Legacy tracks (pre-v2.1, kept for reference)
| Track | Folder | Status |
|-------|--------|--------|
| C (old) | `C_geometry_scale/` | Superseded by `C_bev_egomotion/` |
| E (old) | `E_evaluation_ci/` | Superseded by `A_eval_harness/` |
| F (old) | `F_runtime_parallel/` | Deferred — only after v2.1 tracks stable |

---

## Progress Summary (through 2026-02-19)

- **v2.1 spec** (`tracker_spec_v2.docx`): Architectural pivot complete. Peer review closed. Three interface schemas frozen.
- **Track A:** Not started (Wave 1 — start here).
- **Tracks B, C:** Not started (Wave 2).
- **Tracks D, E:** Prior Kalman tuning work preserved in `D_tracking_outlier/reports/`. Will be extended in Wave 3 to VFR-aware Kalman.
- **Tracks F, G, H:** Not started (Wave 4).

---

## Shared Resources (do NOT reorganise)

| Resource | Location | Used by |
|----------|----------|---------|
| Source code | `ski_racing/` | All tracks |
| CLI scripts | `scripts/` | All tracks |
| Models | `models/` | All tracks |
| Training data | `data/annotations/` | Track B |
| Raw/test videos | `data/raw_videos/`, `data/test_videos_unseen/` | All tracks |
| Interface schemas | `shared/interfaces/` | All tracks — READ ONLY, do not edit |
| Project spec | `tracker_spec_v2.docx` | All tracks — READ ONLY |
| Broad project docs | `shared/docs/` | Reference for everyone |

---

## Manager Checkpoint Protocol

At the end of each wave, the manager reviews before releasing the next wave:
1. Are all output files conforming to their interface schemas?
2. Are acceptance criteria actually passing — not just declared done?
3. Are interface contracts that were agreed verbally written down?
4. Any ownership conflicts or shared-module edits to coordinate?

**Highest-risk integration point:** The Wave 2 VP_t interface between Track C and Track B. If `vp_t` coordinate system or `horizon_y_px` definition is ambiguous, Track B's Tier-2 fallback and Track D's cost matrix will both build on incompatible assumptions. Resolve in writing on day one of Wave 2.

---

## Rules
1. **Do NOT edit files owned by another track** without coordinating with the manager first
2. **Always measure before and after** using Track A's metric harness
3. **Save all reports** to your track's `reports/` folder with date stamps (YYYYMMDD format)
4. **Update `shared/docs/MODEL_REGISTRY.md`** when creating new model checkpoints
5. **Validate your output files** against the interface schemas before declaring done
