# Track A — Eval Harness & PTS Extraction (Wave 1)

## Owner
Wave 1, Worker A

## Priority
**CRITICAL BLOCKER — Start first. All other tracks depend on your outputs.**

## You may READ from
- `data/raw_videos/` — source video clips
- `shared/interfaces/sidecar_pts.schema.json` — your output schema (must conform exactly)
- `configs/` — existing config reference

## You may WRITE to
- `tracks/A_eval_harness/` — all your outputs go here
- `shared/docs/` — if you need to document a shared convention

## Your job
Build the two foundational assets that every other track depends on:

**1. PTS Extractor** — FFmpeg-based script that reads every clip in `data/raw_videos/`, extracts exact Presentation Time Stamps, pulls resolution metadata, applies the readout-time LUT (1080p=16ms, 4K=33ms, unknown=33ms), detects VFR, flags slow-motion (>=120fps) as UNSUPPORTED, and writes one sidecar JSON per clip conforming to `shared/interfaces/sidecar_pts.schema.json`.

**2. Metric Harness** — A runnable evaluation script that ingests any pipeline's per-frame output alongside the ground-truth labels and emits a standard metrics report: IDF1, HOTA, ID switches, track fragmentation, topological ordering error (pairwise inversion rate), missed-gate rate, false-gate rate, and temporal jitter std(||p_t - p_{t-1}||) computed per-track on static gates.

**3. Evaluation Split** — Freeze a labelled dataset split stratified by: flat/steep terrain, clear/occluded gates, high pan speed, flat light. Document clip count and minimum duration. Attach failure taxonomy labels (occlusion, rolling_shutter, eis_jump, snow_glare, track_swap) per clip.

## Acceptance criteria
- Sidecar JSONs exist for every clip in the dataset split and validate against the schema.
- Running the metric harness on a dummy tracker (bbox centroid, no tracking logic) produces a non-zero, non-crashing baseline report.
- Any clip with fps_nominal >= 120 is absent from the evaluation split (rejected at ingestion).

## DO NOT start Wave 2 until
The sidecar JSON schema is frozen and at least one complete sidecar file exists for validation. Notify the manager when this is done.
