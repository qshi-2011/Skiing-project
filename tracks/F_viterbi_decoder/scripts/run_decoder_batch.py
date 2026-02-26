#!/usr/bin/env python3
"""Batch-run Track F decoder on available detection/BEV clip pairs."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ski_racing.decoder import decode_clip_to_file, load_frames


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--detections-dir",
        type=Path,
        default=Path("../../tracks/D_tracking_outlier/inputs/per_frame_detections"),
        help="Directory containing *_detections.json files.",
    )
    parser.add_argument(
        "--bev-dir",
        type=Path,
        default=Path("../../tracks/C_bev_egomotion/outputs"),
        help="Directory containing *_bev.json files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs"),
        help="Directory for <clip_id>_decoder.json outputs.",
    )
    parser.add_argument("--lag", type=int, default=12)
    parser.add_argument("--t-min", type=int, default=5)
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    det_files = sorted(args.detections_dir.glob("*_detections.json"))
    if not det_files:
        raise SystemExit(f"No detection files found in: {args.detections_dir}")

    args.output_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for det_path in det_files:
        clip_id, _ = load_frames(det_path)
        bev_path = args.bev_dir / f"{clip_id}_bev.json"
        if not bev_path.exists():
            bev_path = None
        out_path = args.output_dir / f"{clip_id}_decoder.json"
        decode_clip_to_file(
            detections_path=det_path,
            bev_path=bev_path,
            output_path=out_path,
            lag=args.lag,
            t_min=args.t_min,
            debug=args.debug,
        )
        written.append(out_path)

    print(f"Wrote {len(written)} decoder files:")
    for item in written:
        print(f" - {item}")


if __name__ == "__main__":
    main()
