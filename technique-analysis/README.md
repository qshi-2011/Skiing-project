# Technique Analysis

This folder is owned by the Codex working on technique coaching for free-ski and gate-course videos.

What to work on here:
- Pose analysis, turn segmentation, interpretable metrics, reference matching, and coaching output.
- Both submodes live here: free-ski technique and gate-course technique.
- Session assets in this folder: datasets, references, outputs, and research notes.
- Canonical session code in `platform/src/alpine/sessions/technique_analysis/`.

What not to do here:
- Do not add race-line logic here unless it is strictly technique-related.
- Do not build social highlight ranking here.
- Avoid changing `platform/` unless the change is shared and coordinated.

Coordination rule:
- After meaningful work, update `manager/live/technique-analysis.md` with status, files touched, blockers, and next step.

Start here first:
- Read `manager/README.md`.
- Read `manager/live/board.md`.
- Then work inside this folder and the technique-analysis code under `platform/`.
