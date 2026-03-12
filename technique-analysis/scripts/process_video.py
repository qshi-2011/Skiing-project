#!/usr/bin/env python3
"""Run technique analysis on one local video.

Usage:
    python technique-analysis/scripts/process_video.py <video_path> [options]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Inject technique-analysis/src onto sys.path
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from technique_analysis.common.contracts.models import TechniqueRunConfig
from technique_analysis.free_ski.pipeline.orchestrator import TechniqueAnalysisRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyse ski technique from a front-view video.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("video_path", type=Path, help="Path to the input video file.")
    parser.add_argument(
        "--view",
        default="front",
        choices=["front"],
        help="Camera viewpoint (currently only front-view is supported).",
    )
    parser.add_argument(
        "--pose-engine",
        default="mediapipe",
        choices=["mediapipe"],
        help="Pose estimation backend.",
    )
    parser.add_argument(
        "--max-fps",
        type=float,
        default=None,
        help="Downsample video to this FPS before analysis (None = full FPS).",
    )
    parser.add_argument(
        "--max-dimension",
        type=int,
        default=None,
        help="Max long-side dimension for pose extraction (default: auto from resolution).",
    )
    parser.add_argument(
        "--no-overlay",
        action="store_true",
        help="Skip rendering the overlay video.",
    )
    parser.add_argument(
        "--render-max-dimension",
        type=int,
        default=None,
        help="Resize the overlay output video to this max dimension (None = same as input).",
    )
    parser.add_argument(
        "--person-selector",
        default="largest",
        choices=["largest"],
        help="Strategy for selecting the target person when multiple are detected.",
    )
    parser.add_argument(
        "--min-visibility",
        type=float,
        default=0.5,
        help="Minimum MediaPipe landmark visibility score to include in metrics.",
    )
    parser.add_argument(
        "--write-debug",
        action="store_true",
        help="Write additional debug artefacts to the run folder.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    video_path = Path(args.video_path).expanduser().resolve()
    if not video_path.exists():
        print(f"Error: video not found: {video_path}", file=sys.stderr)
        return 1

    config = TechniqueRunConfig(
        pose_engine=args.pose_engine,
        max_fps=args.max_fps,
        max_dimension=args.max_dimension,
        render_overlay=not args.no_overlay,
        render_max_dimension=args.render_max_dimension,
        person_selector=args.person_selector,
        min_visibility=args.min_visibility,
        write_debug=args.write_debug,
        view=args.view,
    )

    runner = TechniqueAnalysisRunner(config=config)
    print(f"Analysing: {video_path}")
    summary = runner.run(video_path)

    print(f"\nRun complete.")
    print(f"  Run directory: {summary.run_directory}")
    print(f"  Codec used:    {summary.codec_used}")
    print(f"  Turns found:   {len(summary.turns)}")
    print(f"  Coaching tips: {len(summary.coaching_tips)}")

    for artifact in summary.artifacts:
        print(f"  {artifact['kind']}: {artifact['path']}")

    if summary.quality.warnings:
        print("\nWarnings:")
        for w in summary.quality.warnings:
            print(f"  ! {w}")

    if summary.coaching_tips:
        print("\nTop coaching tip:")
        tip = summary.coaching_tips[0]
        print(f"  [{tip.severity.upper()}] {tip.title}")
        print(f"  {tip.explanation}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
