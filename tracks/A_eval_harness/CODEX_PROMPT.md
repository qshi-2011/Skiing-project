# Codex Prompt — Track A: Eval Harness & PTS Extraction (Wave 1)

Paste everything below into a Codex environment with access to the full project root.

---

## Your role

You are **Wave 1, Worker A**. You are the critical blocker — nothing else starts until your outputs exist. Your job is to build two foundational tools: a PTS extractor that produces a sidecar JSON for every video clip, and a metric harness that any downstream pipeline output can be scored against. You also freeze the evaluation dataset split.

---

## Context

This is an alpine ski racing gate tracker project. The v2.1 architecture (read `tracker_spec_v2.docx`) requires exact per-frame timestamps (PTS) from every video because the pipeline uses Variable Frame Rate (VFR) video — smartphone cameras do not maintain a fixed delta_t. A standard 1/fps assumption will silently corrupt the Kalman filter. Your sidecar JSON is the fix.

The metric harness must measure: IDF1, HOTA, ID switches, track fragmentation, topological gate ordering error (pairwise inversion rate in the BEV ordinal plane), missed-gate rate, false-gate rate, and temporal jitter std(||p_t - p_{t-1}||) computed per-track on static gates.

---

## Files to read first (in this order)

1. `tracks/README.md` — overall architecture and your role in it
2. `shared/interfaces/sidecar_pts.schema.json` — your primary deliverable schema, must conform exactly
3. `tracker_spec_v2.docx` — Section 4.4 (PTS/VFR context), Phase 0 (your full spec)
4. `tracks/A_eval_harness/README.md` — acceptance criteria
5. `scripts/extract_frames.py` — existing FFmpeg wrapper you can extend
6. `scripts/evaluate.py` — existing eval code you can extend
7. `configs/regression_defaults.yaml` — existing config reference

---

## What to build

### Step 1: PTS Extractor script

Create `tracks/A_eval_harness/scripts/extract_pts.py`.

For each video in `data/raw_videos/`:
- Run FFmpeg to extract exact Presentation Time Stamps: `ffprobe -v quiet -print_format json -show_packets -select_streams v:0 <video>`
- Extract resolution from container metadata
- Detect VFR: if max(delta_t) / min(delta_t) > 1.05 across frames, set `is_vfr=true`
- Flag any clip with `fps_nominal >= 120` as `slow_motion=true` — exclude it from the eval split, log it
- Apply readout time LUT: 1080p → 16ms, 4K → 33ms, anything else → 33ms (conservative floor)
- Compute `delta_t_s` per frame as the difference between consecutive PTS values (0.0 for frame 0)
- Write one sidecar JSON per clip to `tracks/A_eval_harness/sidecars/<clip_id>.json`
- Validate each output against `shared/interfaces/sidecar_pts.schema.json` before writing

CLI usage:
```bash
python tracks/A_eval_harness/scripts/extract_pts.py \
  --input-dir data/raw_videos/ \
  --output-dir tracks/A_eval_harness/sidecars/
```

### Step 2: Freeze evaluation split

From the clips that pass the slow-motion filter, create a frozen evaluation split stratified across these four conditions — aim for at least 2 clips per cell:
- flat terrain / steep terrain
- clear gates / occluded gates
- high pan speed / low pan speed
- flat light / normal light

Write the split manifest to `tracks/A_eval_harness/eval_split.json` with format:
```json
{
  "split_date": "YYYYMMDD",
  "clips": [
    {
      "clip_id": "...",
      "condition_terrain": "flat|steep",
      "condition_visibility": "clear|occluded",
      "condition_pan": "high|low",
      "condition_light": "flat|normal",
      "failure_labels": []
    }
  ]
}
```

Failure labels per clip (assign manually or by inspection): `occlusion`, `rolling_shutter`, `eis_jump`, `snow_glare`, `track_swap`.

### Step 3: Metric harness

Create `tracks/A_eval_harness/scripts/run_metrics.py`.

This script ingests:
- A ground-truth annotation file (format TBD — use existing annotation format from `data/annotations/`)
- A pipeline output file (per-frame detections/tracks in the format defined by `shared/interfaces/per_frame_detections.schema.json`)

And outputs a metrics report JSON to `tracks/A_eval_harness/reports/metrics_YYYYMMDD_HHMM.json` containing:
- `IDF1`: standard multi-object tracking metric
- `HOTA`: higher order tracking accuracy
- `id_switches`: count of track ID changes
- `track_fragmentation`: count of track breaks
- `topological_ordering_error`: pairwise inversion rate — for each pair of gates (i, j) where the ground truth order is i before j in the BEV ordinal plane, count how often the pipeline reverses them. Report as a fraction 0.0–1.0.
- `missed_gate_rate`: fraction of ground-truth gates with no matching detection
- `false_gate_rate`: fraction of detections with no matching ground truth
- `temporal_jitter`: for each static gate track, compute std(||p_t - p_{t-1}||) across frames where the gate is not moving. Report per-track and as a global mean.

### Step 4: Baseline smoke test

Run the harness against a dummy tracker (output all detections as bbox centroids, no tracking IDs assigned — each detection gets a new ID). This should produce a non-zero IDF1, non-zero missed/false gate rates, and high ID switch count. Save the output to `tracks/A_eval_harness/reports/baseline_dummy.json`.

---

## Files you own

- `tracks/A_eval_harness/scripts/` — create all scripts here
- `tracks/A_eval_harness/sidecars/` — sidecar JSON outputs
- `tracks/A_eval_harness/reports/` — all reports and eval results
- `tracks/A_eval_harness/eval_split.json` — frozen split manifest

## Do NOT modify

- `shared/interfaces/sidecar_pts.schema.json` — READ ONLY, your output must conform to it
- `data/annotations/` — read only
- `ski_racing/*.py` — not your responsibility
- Any other track's folder

---

## Deliverables

- `tracks/A_eval_harness/scripts/extract_pts.py`
- `tracks/A_eval_harness/scripts/run_metrics.py`
- `tracks/A_eval_harness/sidecars/<clip_id>.json` — one per clip in eval split
- `tracks/A_eval_harness/eval_split.json`
- `tracks/A_eval_harness/reports/baseline_dummy.json`

---

## Pass criteria

1. Every sidecar JSON validates against `shared/interfaces/sidecar_pts.schema.json` with no errors.
2. No slow-motion clip (fps_nominal >= 120) appears in `eval_split.json`.
3. Running `run_metrics.py` on the dummy tracker output produces a non-zero, non-crashing baseline report.
4. The `delta_t_s` values in sidecars are NOT uniform (i.e., VFR is being captured, not 1/fps repeated).
5. At least 8 clips in the eval split across all four condition dimensions.

**Signal to manager when Step 1 is done and one complete sidecar JSON exists — Wave 2 cannot start until the schema is confirmed live.**
