# Local Technique Analysis (MVP) + Multi‑Session Foundation (Cool‑Moment / Line‑Detection / Technique)

## Summary
Build a **local-only** “technique analysis” runner (free‑ski, front-view biased) that writes artifacts to disk with **no UI requirement** for now. Structure outputs and interfaces so we can later plug them into a single app (session picker) and eventually deploy with **Vercel + Supabase** without rewriting core analysis logic.

This plan uses **MediaPipe Pose** as the initial pose engine, outputs:
- `overlay.mp4` (pose overlay + metric HUD)
- `metrics.csv` (per-frame and per-turn metrics)
- `summary.json` (run manifest + aggregates + coaching tips in English)

## Goals & Success Criteria
### MVP goals (local)
- Input: any-length video file path (no hard limit).
- Output: run folder containing `overlay.mp4`, `metrics.csv`, `summary.json`.
- Technique focus: **balance + stance** coaching (front-view friendly).
- Quality preference: **best quality** (process full FPS by default), but must be memory-safe (streaming).
- Robustness: handles common failure modes (pose lost, multiple people, occlusions) with confidence flags and warnings in `summary.json`.

### Non-goals (for MVP)
- No payments, no accounts, no Supabase, no Vercel deployment.
- No reference matching / similarity-to-pro library (can be added later).
- No gate-course technique dependency on line-detection yet.

---

## Session Structure (how the repo will be organized for this work)
We keep the existing “sessions” structure and add a concrete technique-analysis pipeline similar to cool-moment/line-detection:

- **Core analysis code (Python package):**
  - `platform/src/alpine/sessions/technique_analysis/…`
- **Session-local assets & outputs:**
  - `technique-analysis/artifacts/runs/<run_id>/…`
- **CLI entrypoint (local runner):**
  - `scripts/technique_analysis/process_video.py`

Later, a unified app can simply **call these session runners** and read their manifests/artifacts.

---

## Implementation Details (decision-complete)

## A) Technique Analysis Pipeline (free‑ski, front view)

### A1. Directory layout & run packaging
Create a run directory pattern aligned with cool-moment:
- `technique-analysis/artifacts/runs/<YYYYMMDD_HHMMSS>_<video_stem>/`
  - `inputs/` (copy or symlink original video path in manifest; no duplication by default)
  - `videos/overlay.mp4`
  - `metrics/metrics.csv`
  - `summary/summary.json`
  - `debug/` (optional: landmark snapshots, failure frames)

Implement `RunPaths` helper (like cool-moment) inside technique-analysis session code to keep paths consistent.

### A2. CLI entrypoint
Add `scripts/technique_analysis/process_video.py` with:
- Positional: `video_path`
- Options (defaults chosen to meet “best quality” + no-limit):
  - `--output-root technique-analysis/artifacts/runs`
  - `--view front` (default)
  - `--pose-engine mediapipe` (default; pluggable)
  - `--max-fps <float|None>` (default `None` = full FPS; can be used to speed up)
  - `--max-dimension <int>` (default `1080` for analysis; render uses original unless overridden)
  - `--render-overlay` (default `true`)
  - `--render-max-dimension <int|None>` (default `None` = original; allow reducing if huge)
  - `--person-selector largest` (default: track the largest/most central person)
  - `--min-visibility` threshold for landmark confidence (default tuned in code)
  - `--write-debug` (default `false`)

CLI prints run path + key artifact paths on completion.

### A3. Pose extraction (MediaPipe Pose)
Implement `PoseExtractor`:
- Uses MediaPipe Pose (single-person), running on CPU.
- Outputs per frame:
  - timestamp (sec), frame index
  - landmarks (normalized x,y plus visibility; z if available)
  - overall pose confidence score (derived from landmark visibility)
- Person selection rule:
  - If MediaPipe gives one person only, accept it.
  - If multiple candidates appear via fallback detection (rare), choose **largest/most centered**.

Add smoothing:
- Use a simple, deterministic smoother (EMA or OneEuro) over landmark coordinates.
- Also compute a “jitter score” (frame-to-frame landmark velocity) to flag shaky tracking.

### A4. Metrics (balance + stance first)
Compute these per-frame metrics from smoothed landmarks (2D image coords, normalized by torso size):
- **Knee flexion angle (L/R)**: angle(hip–knee–ankle)
- **Hip angle (L/R)**: angle(shoulder–hip–knee) or torso–hip–knee proxy
- **Shoulder roll/tilt**: line between shoulders vs horizontal
- **Hip tilt**: line between hips vs horizontal
- **Symmetry scores:**
  - knee_flexion_diff = |L − R|
  - hip_height_diff = |y(L_hip) − y(R_hip)|
- **Stance width ratio:** distance(ankles) / distance(hips)
- **Upper-body stability proxy:** variance of nose/shoulder center over a rolling window
- **Fore-aft proxy (front-view limited):** relative vertical stacking cues (shoulders over hips over ankles) + warnings that this is weak for front-view

Each metric row includes:
- `frame_idx,timestamp_s,pose_confidence,<metrics…>`

### A5. Turn segmentation (front-view heuristic)
Because front-view makes “edge angle” unreliable, segment turns using lateral oscillation:
- Define pelvis center x = avg(L_hip.x, R_hip.x) in normalized coords.
- Smooth pelvis x and compute derivative.
- Identify turn boundaries at local extrema of pelvis x (peaks/troughs) with minimum duration threshold (to avoid noise).
- Label turns as “left” vs “right” based on direction of pelvis movement.
- Produce per-turn aggregates:
  - duration
  - avg pose confidence
  - avg knee flexion L/R
  - symmetry scores
  - stability score

Store per-turn summaries into `summary.json`.

### A6. Coaching tips (English, rule-based)
Generate a small set (3–7) of coaching tips using deterministic rules:
- If knee_flexion_diff high → “work on symmetric flexion…”
- If shoulder tilt variance high → “quiet upper body…”
- If stance width ratio too narrow/wide → “adjust stance width…”
- If pose confidence low for long spans → “camera framing / lighting advice…”

Tips include:
- `title`, `explanation`, `evidence` (which metric triggered), `severity` (info/warn/action), and optional `time_ranges`.

### A7. Overlay video rendering (`overlay.mp4`)
Render an overlay video with:
- Skeleton lines + key joints
- Small HUD showing:
  - pose confidence
  - knee flexion L/R
  - symmetry indicator
  - optional turn index / current turn side
- Optional “low confidence” watermark when tracking fails

Rendering uses OpenCV `VideoWriter` and maintains original FPS when feasible; if codec issues occur, fall back to a widely supported codec and record codec info in `summary.json`.

### A8. Summary manifest (`summary.json`)
Write a stable schema:
- `run_id`, `created_at`, `video_path`, `video_metadata` (fps, width, height, duration)
- `config` (all CLI options resolved)
- `artifacts`:
  - `{ "kind": "video_overlay", "path": "videos/overlay.mp4" }`
  - `{ "kind": "metrics_csv", "path": "metrics/metrics.csv" }`
- `quality`:
  - overall_pose_confidence_stats
  - jitter stats
  - warnings list
- `turns`: list of per-turn summaries
- `coaching_tips`: list of tips

---

## B) Multi‑Session “Single App Later” Compatibility Layer (local-only, minimal now)
Even without UI, we will standardize a tiny “session runner” shape so combining sessions later is trivial:

### B1. Runner interface (internal, session-local)
Define per-session runner functions that return a manifest dict compatible with the `summary.json` idea:
- `cool_moment.run(video_path, output_root=...) -> manifest`
- `technique_free_ski.run(video_path, output_root=...) -> manifest`
- `line_detection.run(video_path, output_root=..., options=...) -> manifest` (already exists via scripts)

### B2. Optional orchestrator script (local)
Add `scripts/run_session.py` (or similar) that:
- Takes `--session {cool_moment, technique_free_ski, line_detection}`
- Runs the chosen session and prints the output manifest path
- Does not require UI

This matches your idea: later the app can simply “choose a session” and run it.

---

## C) Pose Model Research Track (to support future upgrades)
We’ll keep the pose layer pluggable so we can later compare/upgrade:
- **MediaPipe Pose** (baseline; already selected)
- **OpenPose** (higher complexity; likely offline GPU only)
- **MoveNet** (excellent for browser/TFJS later; fewer keypoints)
- **MMPose** (high accuracy but heavier setup; likely not first)

Deliverable: a short internal note (`technique-analysis/docs/pose_models.md`) summarizing tradeoffs and when we’d switch.

---

## Public APIs / Interfaces Added
No shared `platform/src/alpine/shared/**` changes required.

New session-local types in `platform/src/alpine/sessions/technique_analysis/common/contracts/`:
- `TechniqueRunConfig`
- `TechniqueRunSummary`
- `TechniqueFrameMetrics`
- `TechniqueTurnSummary`
- `CoachingTip`
- `Artifact` (session-local; later can align with shared `ArtifactRef`)

---

## Testing & Verification
### Unit tests (fast, deterministic)
- Metric geometry: knee angle computation, stance width ratio, symmetry diff.
- Turn segmentation: synthetic pelvis-x wave + noise → correct boundary detection.
- Coaching rules: given metric aggregates → expected tips.

### Smoke test (optional, guarded)
- If an env var like `TECHNIQUE_SMOKE_VIDEO=/path/to/video.mp4` is set, run the full pipeline and assert artifacts exist.

### Manual acceptance checklist (your review)
- Run on 1 front-view clip and confirm:
  - `overlay.mp4` plays
  - `metrics.csv` has consistent timestamps and no NaN storms
  - `summary.json` includes turns and tips
- Run on a long video and confirm:
  - no crash / memory blow-up
  - progress logs advance steadily
  - output artifacts still produced

---

## Assumptions & Defaults (explicit)
- Local-only MVP, no UI required now.
- Primary viewpoint: front/selfie; we optimize balance/stance metrics first.
- “No limit” means: no hard cap enforced; performance depends on input length; pipeline processes in a streaming manner.
- Coaching tips are English and rule-based in MVP (no LLM dependency).
- Future cloud deployment (Vercel + Supabase) will come after local quality meets expectations; we design manifests/artifacts to be portable.

