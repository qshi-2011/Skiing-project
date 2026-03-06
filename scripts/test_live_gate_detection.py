"""
Gate-only live detection test runner.

Generates overlay videos with live gate detections and per-frame Kalman
propagation between inference calls. Writes per-video JSON summaries and an
auto-generated run report.

Example:
  python scripts/test_live_gate_detection.py \
    "eval/test_videos" \
    --gate-model models/gate_detector_best.pt \
    --stride 3 --conf 0.15 --iou 0.55 --infer-width 1280 \
    --output-dir artifacts/outputs/gate_live/retest
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# Add project root to path (so `import ski_racing` works when run as a script)
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from ski_racing.live_gate_presets import (
    DEFAULT_LIVE_GATE_PRESET,
    LIVE_GATE_STABILIZER_PRESETS,
    get_live_gate_stabilizer_params,
)

VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".m4v"}


def _percentile(values, q):
    if not values:
        return None
    arr = np.array(values, dtype=np.float64)
    return float(np.percentile(arr, q))


def _safe_mean(values):
    return float(sum(values) / len(values)) if values else 0.0


def _scale_dets(dets, sx, sy):
    scaled = []
    for d in dets:
        if not isinstance(d, dict):
            continue
        out = dict(d)
        if "center_x" in out:
            out["center_x"] = float(out["center_x"]) * sx
        if "center_y" in out:
            out["center_y"] = float(out["center_y"]) * sy
        if "base_y" in out:
            out["base_y"] = float(out["base_y"]) * sy
        if "bbox" in out and isinstance(out["bbox"], (list, tuple)) and len(out["bbox"]) == 4:
            x0, y0, x1, y1 = out["bbox"]
            out["bbox"] = [float(x0) * sx, float(y0) * sy, float(x1) * sx, float(y1) * sy]
        scaled.append(out)
    return scaled


def _stats(values):
    return {
        "min": int(min(values)) if values else None,
        "p50": _percentile(values, 50),
        "max": int(max(values)) if values else None,
        "mean": _safe_mean(values),
    }


def _sanitize_tag(tag: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_-]+", "_", str(tag)).strip("_")
    return clean or "run"


def _track_color(gmeta, fallback_idx: int):
    if isinstance(gmeta, dict):
        track_id = gmeta.get("track_id")
        if track_id is not None:
            try:
                return (0, 0, 255) if int(track_id) % 2 == 0 else (255, 0, 0)
            except (TypeError, ValueError):
                pass
    return (0, 0, 255) if int(fallback_idx) % 2 == 0 else (255, 0, 0)


def _compute_stabilizer_quality(call_rows, spawn_conf: float):
    rows = [r for r in call_rows if isinstance(r, dict)]
    raw_counts = [int(r.get("count", 0) or 0) for r in rows]
    shown_counts = [int(r.get("shown_count", r.get("stable_count", 0)) or 0) for r in rows]
    max_confs = [float(r.get("max_conf", 0.0) or 0.0) for r in rows]

    blank_calls = 0
    blank_spawnable_calls = 0
    ghost_calls = 0
    max_blank_streak = 0
    max_ghost_streak = 0
    cur_blank_streak = 0
    cur_ghost_streak = 0
    cur_blank_start = None
    cur_blank_end = None
    max_blank_start = None
    max_blank_end = None
    ghost_frames = []

    for row, raw_count, shown_count, max_conf in zip(rows, raw_counts, shown_counts, max_confs):
        frame_idx = int(row.get("frame", 0) or 0)
        is_blank = raw_count > 0 and shown_count == 0
        is_ghost = raw_count == 0 and shown_count > 0

        if is_blank:
            blank_calls += 1
            if max_conf >= float(spawn_conf):
                blank_spawnable_calls += 1
            if cur_blank_streak == 0:
                cur_blank_start = frame_idx
            cur_blank_streak += 1
            cur_blank_end = frame_idx
        else:
            if cur_blank_streak > max_blank_streak:
                max_blank_streak = cur_blank_streak
                max_blank_start = cur_blank_start
                max_blank_end = cur_blank_end
            cur_blank_streak = 0
            cur_blank_start = None
            cur_blank_end = None

        if is_ghost:
            ghost_calls += 1
            ghost_frames.append(frame_idx)
            cur_ghost_streak += 1
        else:
            if cur_ghost_streak > max_ghost_streak:
                max_ghost_streak = cur_ghost_streak
            cur_ghost_streak = 0

    if cur_blank_streak > max_blank_streak:
        max_blank_streak = cur_blank_streak
        max_blank_start = cur_blank_start
        max_blank_end = cur_blank_end
    if cur_ghost_streak > max_ghost_streak:
        max_ghost_streak = cur_ghost_streak

    miss_after_det_blank = 0
    for i in range(1, len(rows)):
        prev_raw = raw_counts[i - 1]
        prev_shown = shown_counts[i - 1]
        raw_count = raw_counts[i]
        shown_count = shown_counts[i]
        if prev_raw > 0 and prev_shown > 0 and raw_count == 0 and shown_count == 0:
            miss_after_det_blank += 1

    shown_stats = _stats(shown_counts)
    raw_stats = _stats(raw_counts)
    shown_p50 = float(shown_stats["p50"] or 0.0)
    raw_p50 = float(raw_stats["p50"] or 0.0)
    shown_raw_ratio_p50 = float(shown_p50 / max(raw_p50, 1.0))

    worst_blank_streak_segment = None
    if max_blank_streak > 0 and max_blank_start is not None and max_blank_end is not None:
        worst_blank_streak_segment = {
            "start_frame": int(max_blank_start),
            "end_frame": int(max_blank_end),
            "calls": int(max_blank_streak),
        }

    return {
        "blank_calls": int(blank_calls),
        "blank_spawnable_calls": int(blank_spawnable_calls),
        "max_blank_streak": int(max_blank_streak),
        "ghost_calls": int(ghost_calls),
        "max_ghost_streak": int(max_ghost_streak),
        "shown_stats": shown_stats,
        "raw_stats": raw_stats,
        "shown_raw_ratio_p50": float(shown_raw_ratio_p50),
        "miss_after_det_blank": int(miss_after_det_blank),
        "ghost_frames": [int(f) for f in ghost_frames],
        "worst_blank_streak_segment": worst_blank_streak_segment,
    }


def _fmt(value, ndigits=2):
    if value is None:
        return ""
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.{ndigits}f}"
    return str(value)


def _write_analysis_report(output_dir: Path, run_tag: str, run_rows):
    report_name = f"analysis_report_{_sanitize_tag(run_tag)}.md"
    report_path = output_dir / report_name

    lines = [
        f"# Live gate stabilization report ({run_tag})",
        "",
        f"Output directory: `{output_dir}`",
        "",
        "## Per-video metrics",
        "",
        "| video | calls | raw_p50 | shown_p50 | blank | blank_spawnable | ghost | avg_ms | p95_ms |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in run_rows:
        lines.append(
            "| `{video}` | {calls} | {raw_p50} | {shown_p50} | {blank_calls} | "
            "{blank_spawnable_calls} | {ghost_calls} | {avg_infer_ms} | {p95_infer_ms} |".format(
                video=row.get("video", ""),
                calls=_fmt(row.get("calls")),
                raw_p50=_fmt(row.get("raw_p50")),
                shown_p50=_fmt(row.get("shown_p50")),
                blank_calls=_fmt(row.get("blank_calls")),
                blank_spawnable_calls=_fmt(row.get("blank_spawnable_calls")),
                ghost_calls=_fmt(row.get("ghost_calls")),
                avg_infer_ms=_fmt(row.get("avg_infer_ms")),
                p95_infer_ms=_fmt(row.get("p95_infer_ms")),
            )
        )

    lines.extend(
        [
            "",
            "## Notable frames",
            "",
            "### Ghost frame indices",
        ]
    )
    for row in run_rows:
        ghost_frames = row.get("ghost_frames") or []
        ghost_text = ", ".join(str(int(f)) for f in ghost_frames) if ghost_frames else "none"
        lines.append(f"- `{row.get('video', '')}`: {ghost_text}")

    lines.extend(
        [
            "",
            "### Worst blank streak segment per video",
        ]
    )
    for row in run_rows:
        seg = row.get("worst_blank_streak_segment")
        if isinstance(seg, dict):
            lines.append(
                f"- `{row.get('video', '')}`: frames `{seg.get('start_frame')} -> {seg.get('end_frame')}` "
                f"({seg.get('calls')} calls)"
            )
        else:
            lines.append(f"- `{row.get('video', '')}`: none")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report_path


def _collect_videos(inputs):
    videos_by_path = {}
    for raw in inputs:
        path = Path(raw).expanduser()
        if path.is_dir():
            candidates = [
                p for p in path.iterdir()
                if p.is_file() and p.suffix.lower() in VIDEO_EXTS
            ]
        elif path.is_file():
            candidates = [path]
        else:
            raise ValueError(f"Input path does not exist: {path}")

        for video in candidates:
            resolved = video.resolve()
            videos_by_path[str(resolved)] = resolved

    return [videos_by_path[k] for k in sorted(videos_by_path.keys(), key=lambda s: s.casefold())]


def run_one(
    video_path: Path,
    gate_model_path: Path,
    output_dir: Path,
    stride: int,
    conf: float,
    iou: float,
    infer_width: int | None,
    max_frames: int | None,
    stabilizer_params: dict,
    live_gate_preset: str,
    run_tag: str,
):
    from ski_racing.detection import GateDetector, LiveGateStabilizer

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_s = float(total_frames / fps) if fps > 1e-6 else None

    out_video_path = output_dir / f"{video_path.stem}_live_gates.mp4"
    out_json_path = output_dir / f"{video_path.stem}_live_gates_summary.json"

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(out_video_path), fourcc, fps if fps > 1e-6 else 30.0, (width, height))

    detector = GateDetector(str(gate_model_path))
    stabilizer = LiveGateStabilizer(show_stale=False, **dict(stabilizer_params))

    stride = max(1, int(stride))
    infer_times_ms = []
    counts = []
    call_rows = []

    cached = []
    last_infer_frame = -10_000
    frame_idx = 0

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        if max_frames is not None and frame_idx >= int(max_frames):
            break

        if frame_idx - last_infer_frame >= stride:
            infer_frame = frame
            sx = sy = 1.0
            resize_ms = 0.0
            if infer_width is not None and int(infer_width) > 0 and width > int(infer_width):
                target_w = int(infer_width)
                target_h = int(round(height * (target_w / width)))
                tr0 = time.perf_counter()
                infer_frame = cv2.resize(infer_frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
                tr1 = time.perf_counter()
                resize_ms = 1000.0 * (tr1 - tr0)
                sx = float(width / target_w)
                sy = float(height / target_h)

            t0 = time.perf_counter()
            dets = detector.detect_in_frame(infer_frame, conf=float(conf), iou=float(iou))
            t1 = time.perf_counter()
            infer_ms = 1000.0 * (t1 - t0)
            infer_times_ms.append(infer_ms)
            if sx != 1.0 or sy != 1.0:
                dets = _scale_dets(dets, sx=sx, sy=sy)
            # Inference frame: predict+update with fresh detections.
            cached = stabilizer.step(frame_idx, dets)
            last_infer_frame = frame_idx

            count = int(len(dets))  # raw detection count for diagnostics
            counts.append(count)
            mean_conf = _safe_mean([float(d.get("confidence", 0.0)) for d in dets if isinstance(d, dict)])
            max_conf = max([float(d.get("confidence", 0.0)) for d in dets if isinstance(d, dict)], default=0.0)
            shown_count = int(len(cached))
            call_rows.append({
                "frame": int(frame_idx),
                "count": count,
                "shown_count": shown_count,
                "stable_count": shown_count,  # compatibility with older summaries
                "mean_conf": float(mean_conf),
                "max_conf": float(max_conf),
                "infer_ms": float(infer_ms),
                "resize_ms": float(resize_ms),
            })
        else:
            # Non-inference frame: predict-only propagation.
            cached = stabilizer.step(frame_idx, None)

        # Draw stabilized gate positions on every frame
        for i, d in enumerate(cached):
            if not isinstance(d, dict):
                continue
            try:
                gx = int(round(float(d.get("center_x", 0.0))))
                gy = int(round(float(d.get("base_y", 0.0))))
            except Exception:
                continue
            if gx <= 0 and gy <= 0:
                continue
            color = _track_color(d, fallback_idx=i)
            cv2.circle(frame, (gx, gy), 10, color, -1)
            cv2.circle(frame, (gx, gy), 15, color, 2)

        # Text overlay
        cv2.putText(frame, f"Frame: {frame_idx}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(frame, f"Gates (shown): {len(cached)}", (10, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(frame, f"Infer stride: {stride}", (10, 110),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        if infer_times_ms:
            cv2.putText(frame, f"Infer avg: {(_safe_mean(infer_times_ms)):.1f} ms",
                        (10, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

        out.write(frame)
        frame_idx += 1

    cap.release()
    out.release()

    processed_frames = int(frame_idx)
    infer_calls = int(len(infer_times_ms))
    wall_s = float(sum(infer_times_ms) / 1000.0)  # model-time only; excludes I/O + encoding
    effective_fps = float(infer_calls / wall_s) if wall_s > 1e-9 else None
    realtime_x = None
    if duration_s is not None and wall_s > 1e-9:
        realtime_x = float(duration_s / wall_s)

    quality = _compute_stabilizer_quality(call_rows, spawn_conf=float(stabilizer_params["spawn_conf"]))

    summary = {
        "video": str(video_path),
        "video_info": {
            "width": int(width),
            "height": int(height),
            "fps": float(fps),
            "total_frames": int(total_frames),
            "processed_frames": int(processed_frames),
            "duration_s": duration_s,
        },
        "params": {
            "preset": str(live_gate_preset),
            "gate_model": str(gate_model_path),
            "stride": int(stride),
            "conf": float(conf),
            "iou": float(iou),
            "infer_width": int(infer_width) if infer_width is not None else None,
            "max_frames": int(max_frames) if max_frames is not None else None,
            "show_stale": False,
            "min_hits_to_show": int(stabilizer_params["min_hits_to_show"]),
            "spawn_conf": float(stabilizer_params["spawn_conf"]),
            "display_conf": float(stabilizer_params["display_conf"]),
            "update_conf_min": float(stabilizer_params["update_conf_min"]),
            "stale_conf_decay": float(stabilizer_params["stale_conf_decay"]),
            "max_shown_stale_calls": int(stabilizer_params["max_shown_stale_calls"]),
            "max_stale_calls": int(stabilizer_params["max_stale_calls"]),
            "match_threshold": float(stabilizer_params["match_threshold"]),
            "maha_threshold": float(stabilizer_params["maha_threshold"]),
            "meas_sigma_px": float(stabilizer_params["meas_sigma_px"]),
            "accel_sigma_px": float(stabilizer_params["accel_sigma_px"]),
            "alpha": float(stabilizer_params["alpha"]),
            "run_tag": str(run_tag),
        },
        "inference_timing_ms": {
            "calls": infer_calls,
            "avg": _safe_mean(infer_times_ms),
            "p50": _percentile(infer_times_ms, 50),
            "p95": _percentile(infer_times_ms, 95),
            "p99": _percentile(infer_times_ms, 99),
            "effective_fps_est": effective_fps,
            "realtime_x_est": realtime_x,
        },
        "gate_counts": {
            "calls": int(len(counts)),
            "min": int(min(counts)) if counts else None,
            "max": int(max(counts)) if counts else None,
            "mean": _safe_mean(counts),
            "p10": _percentile(counts, 10),
            "p50": _percentile(counts, 50),
            "p90": _percentile(counts, 90),
        },
        "stabilizer_quality": quality,
        "per_call": call_rows,
        "artifacts": {
            "overlay_video": str(out_video_path),
            "summary_json": str(out_json_path),
        },
    }
    out_json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description="Test live gate detection (gate-only overlays + timing).")
    parser.add_argument("inputs", nargs="+", help="Video file(s) and/or directories")
    parser.add_argument("--gate-model", required=True, help="Path to trained gate detector weights")
    parser.add_argument("--output-dir", required=True, help="Output directory for overlays + summaries")
    parser.add_argument("--stride", type=int, default=3, help="Run inference every N frames (default 3)")
    parser.add_argument("--conf", type=float, default=0.15, help="Gate detection confidence (default 0.15)")
    parser.add_argument("--iou", type=float, default=0.55, help="Gate detection NMS IoU (default 0.55)")
    parser.add_argument("--infer-width", type=int, default=1280,
                        help="Resize width for inference (default 1280; set 0 to disable)")
    parser.add_argument("--max-frames", type=int, default=None, help="Optional cap on processed frames")
    parser.add_argument(
        "--preset",
        choices=tuple(LIVE_GATE_STABILIZER_PRESETS.keys()),
        default=DEFAULT_LIVE_GATE_PRESET,
        help="Stabilizer preset (default T1H).",
    )
    parser.add_argument("--min-hits-to-show", type=int, default=None)
    parser.add_argument("--spawn-conf", type=float, default=None)
    parser.add_argument("--display-conf", type=float, default=None)
    parser.add_argument("--update-conf-min", type=float, default=None)
    parser.add_argument("--stale-conf-decay", type=float, default=None)
    parser.add_argument("--max-shown-stale-calls", type=int, default=None)
    parser.add_argument("--max-stale-calls", type=int, default=None)
    parser.add_argument("--match-threshold", type=float, default=None)
    parser.add_argument("--maha-threshold", type=float, default=None)
    parser.add_argument("--meas-sigma-px", type=float, default=None)
    parser.add_argument("--accel-sigma-px", type=float, default=None)
    parser.add_argument("--alpha", type=float, default=None,
                        help="Confidence EMA alpha for stabilizer (override preset only)")
    parser.add_argument("--run-tag", type=str, default=None,
                        help="Optional run tag for report naming and summary metadata")
    args = parser.parse_args()

    gate_model = Path(args.gate_model)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    videos = _collect_videos(args.inputs)
    if not videos:
        raise SystemExit("No videos found from the provided inputs.")

    run_tag = str(args.run_tag).strip() if args.run_tag is not None else ""
    if not run_tag:
        run_tag = out_dir.name or "run"

    stabilizer_params = get_live_gate_stabilizer_params(args.preset)
    cli_overrides = {
        "min_hits_to_show": args.min_hits_to_show,
        "spawn_conf": args.spawn_conf,
        "display_conf": args.display_conf,
        "update_conf_min": args.update_conf_min,
        "stale_conf_decay": args.stale_conf_decay,
        "max_shown_stale_calls": args.max_shown_stale_calls,
        "max_stale_calls": args.max_stale_calls,
        "match_threshold": args.match_threshold,
        "maha_threshold": args.maha_threshold,
        "meas_sigma_px": args.meas_sigma_px,
        "accel_sigma_px": args.accel_sigma_px,
        "alpha": args.alpha,
    }
    for key, value in cli_overrides.items():
        if value is not None:
            stabilizer_params[key] = value

    run_rows = []
    for v in videos:
        print(f"Processing {v.name}...")
        summary = run_one(
            video_path=v,
            gate_model_path=gate_model,
            output_dir=out_dir,
            stride=int(args.stride),
            conf=float(args.conf),
            iou=float(args.iou),
            infer_width=(int(args.infer_width) if int(args.infer_width) > 0 else None),
            max_frames=args.max_frames,
            stabilizer_params=stabilizer_params,
            live_gate_preset=str(args.preset),
            run_tag=run_tag,
        )
        quality = summary.get("stabilizer_quality", {})
        shown_stats = quality.get("shown_stats", {})
        raw_stats = quality.get("raw_stats", {})

        run_rows.append({
            "video": v.name,
            "run_tag": run_tag,
            "calls": summary["gate_counts"]["calls"],
            "min_gates": summary["gate_counts"]["min"],
            "p50_gates": summary["gate_counts"]["p50"],
            "max_gates": summary["gate_counts"]["max"],
            "raw_p50": raw_stats.get("p50"),
            "shown_p50": shown_stats.get("p50"),
            "raw_stats": raw_stats,
            "shown_stats": shown_stats,
            "blank_calls": quality.get("blank_calls"),
            "blank_spawnable_calls": quality.get("blank_spawnable_calls"),
            "max_blank_streak": quality.get("max_blank_streak"),
            "ghost_calls": quality.get("ghost_calls"),
            "max_ghost_streak": quality.get("max_ghost_streak"),
            "shown_raw_ratio_p50": quality.get("shown_raw_ratio_p50"),
            "miss_after_det_blank": quality.get("miss_after_det_blank"),
            "avg_infer_ms": summary["inference_timing_ms"]["avg"],
            "p95_infer_ms": summary["inference_timing_ms"]["p95"],
            "overlay_video": summary["artifacts"]["overlay_video"],
            "summary_json": summary["artifacts"]["summary_json"],
            "ghost_frames": quality.get("ghost_frames") or [],
            "worst_blank_streak_segment": quality.get("worst_blank_streak_segment"),
        })

    run_summary_path = out_dir / "run_summary.json"
    run_summary_path.write_text(json.dumps(run_rows, indent=2), encoding="utf-8")
    report_path = _write_analysis_report(out_dir, run_tag=run_tag, run_rows=run_rows)

    print(f"✓ Wrote {len(run_rows)} summaries to {run_summary_path}")
    print(f"✓ Wrote analysis report to {report_path}")


if __name__ == "__main__":
    main()
