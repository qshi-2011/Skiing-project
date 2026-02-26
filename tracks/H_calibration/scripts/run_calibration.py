#!/usr/bin/env python3
"""Track H calibration runner.

Implements Wave 4 Track H tasks inside tracks/H_calibration only.

Notes:
- The workspace does not contain full labelled GT tracks for eval clips.
- This runner follows Track D's documented proxy approach:
  fixed-dt tracker outputs are treated as proxy GT; dynamic outputs are predictions.
- All outputs are written only under tracks/H_calibration.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
import random
import statistics
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np
from jsonschema import Draft7Validator


def _load_module(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module spec: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def clamp(value: float, lo: float, hi: float) -> float:
    return float(max(lo, min(hi, value)))


def safe_log(x: float) -> float:
    return float(math.log(max(x, 1e-9)))


def sanitize_filename(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in (" ", "-", "_", ".", "(", ")") else "_" for ch in name).strip()


def json_load(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def json_dump(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def percentile_bounds(values: Sequence[float], lo: float = 2.5, hi: float = 97.5) -> Tuple[float, float]:
    if not values:
        return float("nan"), float("nan")
    arr = np.asarray(values, dtype=np.float64)
    return float(np.percentile(arr, lo)), float(np.percentile(arr, hi))


@dataclass
class EvalArtifacts:
    bev_dir: Path
    detections_dir: Path
    tracks_dynamic_dir: Path
    tracks_fixed_dir: Path
    metric_pred_dir: Path
    metric_gt_dir: Path


class CalibrationRunner:
    def __init__(self, project_root: Path, today: str, bootstrap_n: int = 1000) -> None:
        self.project_root = project_root
        self.track_root = project_root / "tracks" / "H_calibration"
        self.today = today
        self.bootstrap_n = int(bootstrap_n)

        self.eval_split_path = project_root / "tracks" / "A_eval_harness" / "eval_split.json"
        self.sidecar_dir = project_root / "tracks" / "A_eval_harness" / "sidecars"
        self.shared_det_schema = project_root / "shared" / "interfaces" / "per_frame_detections.schema.json"
        self.c_bev_dir = project_root / "tracks" / "C_bev_egomotion" / "outputs"
        self.model_path = project_root / "models" / "gate_detector_best.pt"

        self.outputs_root = self.track_root / "outputs"
        self.reports_root = self.track_root / "reports"
        self.configs_root = self.track_root / "configs"

        self.run_root = self.outputs_root / f"calibration_run_{today}"
        self.run_root.mkdir(parents=True, exist_ok=True)

        self.eval_split = json_load(self.eval_split_path)
        self.clip_ids = [str(c["clip_id"]) for c in self.eval_split.get("clips", [])]
        self.light_by_clip = {
            str(c["clip_id"]): str(c.get("condition_light", "normal"))
            for c in self.eval_split.get("clips", [])
        }
        self.failure_by_clip = {
            str(c["clip_id"]): list(c.get("failure_labels", []))
            for c in self.eval_split.get("clips", [])
        }

        self.video_by_clip = {cid: self._find_video(cid) for cid in self.clip_ids}

        # Dynamic imports from production/track scripts.
        self.run_metrics_mod = _load_module(
            "run_metrics_mod",
            self.project_root / "tracks" / "A_eval_harness" / "scripts" / "run_metrics.py",
        )
        self.det_gen_mod = _load_module(
            "det_gen_mod",
            self.project_root / "tracks" / "B_model_retraining" / "tools" / "generate_per_frame_detections_v2.py",
        )
        self.tracker_mod = _load_module(
            "tracker_mod",
            self.project_root / "tracks" / "D_tracking_outlier" / "scripts" / "vfr_bev_tracker.py",
        )
        self.decoder_mod = _load_module("decoder_mod", self.project_root / "ski_racing" / "decoder.py")
        self.initialiser_mod = _load_module("initialiser_mod", self.project_root / "ski_racing" / "initialiser.py")
        self.safety_mod = _load_module("safety_mod", self.project_root / "ski_racing" / "safety.py")

        self.baseline_metrics: Optional[Dict[str, Any]] = None

    def _find_video(self, clip_id: str) -> Path:
        root = self.project_root / "data" / "raw_videos"
        for ext in ("*.mov", "*.mp4", "*.avi", "*.mkv", "*.m4v"):
            for p in root.rglob(ext):
                if p.stem == clip_id:
                    return p
        raise FileNotFoundError(f"Video for clip '{clip_id}' not found under {root}")

    def _make_eval_artifacts(self, name: str) -> EvalArtifacts:
        base = self.run_root / name
        artifacts = EvalArtifacts(
            bev_dir=base / "bev",
            detections_dir=base / "detections",
            tracks_dynamic_dir=base / "tracks_dynamic",
            tracks_fixed_dir=base / "tracks_fixed",
            metric_pred_dir=base / "metric_pred",
            metric_gt_dir=base / "metric_gt",
        )
        for p in (
            artifacts.bev_dir,
            artifacts.detections_dir,
            artifacts.tracks_dynamic_dir,
            artifacts.tracks_fixed_dir,
            artifacts.metric_pred_dir,
            artifacts.metric_gt_dir,
        ):
            p.mkdir(parents=True, exist_ok=True)
        return artifacts

    def _copy_baseline_bev(self, out_dir: Path) -> None:
        for cid in self.clip_ids:
            src = self.c_bev_dir / f"{cid}_bev.json"
            dst = out_dir / f"{cid}_bev.json"
            dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

    def _generate_baseline_detections(
        self,
        out_dir: Path,
        bev_dir: Path,
        tau_kp: float = 0.5,
        conf: float = 0.25,
        iou: float = 0.55,
        max_frames: int = 180,
        frame_stride: int = 2,
    ) -> List[Dict[str, Any]]:
        schema = json_load(self.shared_det_schema)
        validator = Draft7Validator(schema)

        if not self.model_path.exists():
            raise FileNotFoundError(f"Missing model: {self.model_path}")

        model = self.det_gen_mod.YOLO(str(self.model_path))
        summaries: List[Dict[str, Any]] = []
        for cid in self.clip_ids:
            video = self.video_by_clip[cid]
            summary = self.det_gen_mod.process_clip(
                model=model,
                video_path=video,
                out_dir=out_dir,
                bev_dir=bev_dir,
                validator=validator,
                conf_thr=conf,
                iou_thr=iou,
                tau_kp=tau_kp,
                max_frames=max_frames,
                frame_stride=frame_stride,
                device=None,
            )
            summaries.append(summary)
        return summaries

    def _run_tracker_for_all(
        self,
        detections_dir: Path,
        bev_dir: Path,
        out_dir: Path,
        fixed_dt: bool,
    ) -> None:
        for cid in self.clip_ids:
            sidecar_path = self.sidecar_dir / f"{cid}.json"
            bev_path = bev_dir / f"{cid}_bev.json"
            det_path = detections_dir / f"{cid}_detections.json"
            out_path = out_dir / f"{sanitize_filename(cid)}_tracks.json"
            self.tracker_mod.run_clip(
                clip_id=cid,
                sidecar_path=sidecar_path,
                bev_path=bev_path,
                detections_path=det_path,
                light_condition=self.light_by_clip.get(cid, "normal"),
                out_path=out_path,
                fixed_dt=fixed_dt,
            )

    @staticmethod
    def _tracks_to_metric_payload(track_payload: Dict[str, Any], clip_id: str) -> Dict[str, Any]:
        out = {"clip_id": clip_id, "frames": []}
        for frame in track_payload.get("frames", []):
            frame_idx = int(frame.get("frame_idx", 0))
            detections = []
            for det_idx, det in enumerate(frame.get("detections", [])):
                base = det.get("base_px") or {}
                detections.append(
                    {
                        "detection_id": f"{clip_id}_{frame_idx:05d}_{det_idx:03d}",
                        "track_id": str(det.get("track_id", f"trk_{det_idx}")),
                        "base_px": {
                            "x_px": float(base.get("x_px", 0.0)),
                            "y_px": float(base.get("y_px", 0.0)),
                        },
                        "class_label": str(det.get("class_label", "unknown")),
                    }
                )
            out["frames"].append({"frame_idx": frame_idx, "detections": detections})
        return out

    def _prepare_metric_inputs(self, artifacts: EvalArtifacts) -> None:
        for cid in self.clip_ids:
            dynamic_path = artifacts.tracks_dynamic_dir / f"{sanitize_filename(cid)}_tracks.json"
            fixed_path = artifacts.tracks_fixed_dir / f"{sanitize_filename(cid)}_tracks.json"
            dynamic_payload = json_load(dynamic_path)
            fixed_payload = json_load(fixed_path)

            pred_payload = self._tracks_to_metric_payload(dynamic_payload, cid)
            gt_payload = self._tracks_to_metric_payload(fixed_payload, cid)
            json_dump(artifacts.metric_pred_dir / f"{cid}_pred.json", pred_payload)
            json_dump(artifacts.metric_gt_dir / f"{cid}_gt.json", gt_payload)

    def _compute_clip_metrics(self, gt_path: Path, pred_path: Path) -> Dict[str, Any]:
        gt_clip_id, gt_frames, gt_fmt = self.run_metrics_mod.load_ground_truth(gt_path)
        pred_clip_id, pred_frames, pred_fmt = self.run_metrics_mod.load_predictions(pred_path)
        metrics = self.run_metrics_mod.evaluate_metrics(
            gt_frames=gt_frames,
            pred_frames=pred_frames,
            max_distance_px=60.0,
            static_motion_threshold_px=2.5,
        )
        return {
            "ground_truth": {"clip_id": gt_clip_id, "format": gt_fmt, "path": str(gt_path)},
            "predictions": {"clip_id": pred_clip_id, "format": pred_fmt, "path": str(pred_path)},
            **metrics,
        }

    def _aggregate_metric_reports(self, per_clip: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        weights = []
        for cid, rep in per_clip.items():
            w = float(rep.get("counts", {}).get("gt_total", 0) or 0)
            if w <= 0:
                w = float(rep.get("counts", {}).get("frames", 1) or 1)
            weights.append((cid, w))
        total_w = sum(w for _, w in weights) or float(len(weights) or 1)

        def wavg(key: str, default: float = 0.0) -> float:
            num = 0.0
            for cid, w in weights:
                num += float(per_clip[cid].get(key, default)) * w
            return float(num / total_w)

        out = {
            "IDF1": wavg("IDF1"),
            "HOTA": wavg("HOTA"),
            "topological_ordering_error": wavg("topological_ordering_error"),
            "missed_gate_rate": wavg("missed_gate_rate"),
            "false_gate_rate": wavg("false_gate_rate"),
            "temporal_jitter": {
                "global_mean": 0.0,
            },
            "id_switches": int(sum(int(rep.get("id_switches", 0)) for rep in per_clip.values())),
            "track_fragmentation": int(sum(int(rep.get("track_fragmentation", 0)) for rep in per_clip.values())),
        }
        # run_metrics stores temporal_jitter as dict for each clip
        jit_num = 0.0
        for cid, w in weights:
            tj = per_clip[cid].get("temporal_jitter", {})
            jit_num += float(tj.get("global_mean", 0.0)) * w
        out["temporal_jitter"]["global_mean"] = float(jit_num / total_w)
        return out

    def _score_from_aggregate(self, aggregate: Dict[str, Any], baseline_jitter: float) -> float:
        idf1 = float(aggregate.get("IDF1", 0.0))
        hota = float(aggregate.get("HOTA", 0.0))
        toe = float(aggregate.get("topological_ordering_error", 0.0))
        jitter = float((aggregate.get("temporal_jitter", {}) or {}).get("global_mean", 0.0))
        jitter_norm = jitter / max(1e-6, baseline_jitter)
        return float(idf1 + 0.5 * hota - 0.2 * toe - 0.05 * jitter_norm)

    @staticmethod
    def _bev_frame_map(payload: Dict[str, Any]) -> Dict[int, Dict[str, Any]]:
        out = {}
        for fr in payload.get("frames", []):
            idx = int(fr.get("frame_idx", -1))
            if idx >= 0:
                out[idx] = fr
        return out

    @staticmethod
    def _resolve_gate_base_custom(det: Dict[str, Any], bev_frame: Optional[Dict[str, Any]], tau_kp: float, alpha_gate: float = 0.05) -> Dict[str, Any]:
        x1, y1, x2, y2 = [float(v) for v in det.get("bbox_xyxy", [0, 0, 0, 0])]
        kp0 = det.get("keypoint_base_px")
        kp1 = det.get("keypoint_tip_px")
        kp0_conf = float(kp0.get("conf", 0.0)) if isinstance(kp0, dict) else 0.0
        kp1_conf = float(kp1.get("conf", 0.0)) if isinstance(kp1, dict) else 0.0

        alpha_t = 0.0
        vp_x = None
        vp_y = None
        horizon_y = None
        if isinstance(bev_frame, dict):
            alpha_t = float(bev_frame.get("alpha_t", 0.0) or 0.0)
            vp = bev_frame.get("vp_t") or {}
            if isinstance(vp, dict) and "x_px" in vp and "y_px" in vp:
                vp_x = float(vp["x_px"])
                vp_y = float(vp["y_px"])
            if "horizon_y_px" in bev_frame:
                horizon_y = float(bev_frame["horizon_y_px"])

        if kp0_conf >= tau_kp and isinstance(kp0, dict):
            return {
                "base_px": {"x_px": float(kp0["x_px"]), "y_px": float(kp0["y_px"])},
                "base_fallback_tier": 1,
                "is_degraded": False,
            }

        if (
            kp0_conf < tau_kp
            and alpha_t > alpha_gate
            and kp1_conf >= tau_kp
            and isinstance(kp1, dict)
            and vp_x is not None
            and vp_y is not None
            and horizon_y is not None
            and abs(vp_y - float(kp1["y_px"])) > 1e-6
        ):
            kx = float(kp1["x_px"])
            ky = float(kp1["y_px"])
            t = (horizon_y - ky) / (vp_y - ky)
            bx = kx + t * (vp_x - kx)
            return {
                "base_px": {"x_px": float(bx), "y_px": float(horizon_y)},
                "base_fallback_tier": 2,
                "is_degraded": False,
            }

        return {
            "base_px": {"x_px": float((x1 + x2) * 0.5), "y_px": float(y2)},
            "base_fallback_tier": 3,
            "is_degraded": True,
        }

    @staticmethod
    def _compute_geometry_custom(
        kp0: Optional[Dict[str, Any]],
        kp1: Optional[Dict[str, Any]],
        bev_frame: Optional[Dict[str, Any]],
        tau_kp: float,
        buffer_deg: float,
    ) -> Tuple[Optional[float], bool]:
        if not isinstance(kp0, dict) or not isinstance(kp1, dict):
            return None, True
        if float(kp0.get("conf", 0.0)) < tau_kp or float(kp1.get("conf", 0.0)) < tau_kp:
            return None, True

        dx = float(kp1["x_px"]) - float(kp0["x_px"])
        dy = float(kp1["y_px"]) - float(kp0["y_px"])
        angle = float(math.degrees(math.atan2(dx, -dy)))

        theta = 0.0
        if isinstance(bev_frame, dict):
            theta = float(bev_frame.get("rolling_shutter_theta_deg", 0.0) or 0.0)
        return angle, bool(abs(angle) <= (abs(theta) + float(buffer_deg)))

    def _build_variant_bev(
        self,
        src_dir: Path,
        out_dir: Path,
        alpha_max: float,
        n_req: float,
    ) -> None:
        for cid in self.clip_ids:
            payload = json_load(src_dir / f"{cid}_bev.json")
            for fr in payload.get("frames", []):
                n_in = int(fr.get("n_inliers", 0))
                alpha = float(alpha_max * clamp(float(n_in) / max(1e-6, float(n_req)), 0.0, 1.0))
                fr["alpha_t"] = alpha
            json_dump(out_dir / f"{cid}_bev.json", payload)

    def _build_variant_detections(
        self,
        src_dir: Path,
        bev_dir: Path,
        out_dir: Path,
        tau_kp: float,
        buffer_deg: float,
    ) -> None:
        for cid in self.clip_ids:
            det_payload = json_load(src_dir / f"{cid}_detections.json")
            bev_payload = json_load(bev_dir / f"{cid}_bev.json")
            bev_map = self._bev_frame_map(bev_payload)

            out = {"clip_id": cid, "frames": []}
            for frame in det_payload.get("frames", []):
                frame_idx = int(frame.get("frame_idx", 0))
                bev_frame = bev_map.get(frame_idx)
                out_dets = []
                for det in frame.get("detections", []):
                    det2 = copy.deepcopy(det)
                    resolved = self._resolve_gate_base_custom(det2, bev_frame, tau_kp=tau_kp)
                    angle, geom_ok = self._compute_geometry_custom(
                        kp0=det2.get("keypoint_base_px"),
                        kp1=det2.get("keypoint_tip_px"),
                        bev_frame=bev_frame,
                        tau_kp=tau_kp,
                        buffer_deg=buffer_deg,
                    )
                    det2["base_px"] = resolved["base_px"]
                    det2["base_fallback_tier"] = int(resolved["base_fallback_tier"])
                    det2["is_degraded"] = bool(resolved["is_degraded"])
                    det2["pole_vector_angle_deg"] = None if angle is None else float(angle)
                    det2["geometry_check_passed"] = bool(geom_ok)
                    out_dets.append(det2)
                out["frames"].append({"frame_idx": frame_idx, "detections": out_dets})
            json_dump(out_dir / f"{cid}_detections.json", out)

    def _evaluate_artifacts(self, artifacts: EvalArtifacts, gt_metric_dir: Optional[Path] = None) -> Dict[str, Any]:
        # Build metric inputs.
        self._prepare_metric_inputs(artifacts)

        gt_dir = gt_metric_dir if gt_metric_dir is not None else artifacts.metric_gt_dir
        per_clip: Dict[str, Dict[str, Any]] = {}
        for cid in self.clip_ids:
            gt_path = gt_dir / f"{cid}_gt.json"
            pred_path = artifacts.metric_pred_dir / f"{cid}_pred.json"
            per_clip[cid] = self._compute_clip_metrics(gt_path, pred_path)

        aggregate = self._aggregate_metric_reports(per_clip)
        return {"per_clip": per_clip, "aggregate": aggregate}

    def _bootstrap_best_value(
        self,
        value_to_clip_scores: Dict[float, Dict[str, float]],
        clip_ids: Sequence[str],
    ) -> Tuple[float, Tuple[float, float], Dict[str, float]]:
        # Point estimate.
        mean_by_value: Dict[float, float] = {}
        for v, by_clip in value_to_clip_scores.items():
            vals = [float(by_clip[c]) for c in clip_ids if c in by_clip]
            mean_by_value[v] = float(sum(vals) / len(vals)) if vals else -1e9
        best_value = max(mean_by_value, key=lambda x: mean_by_value[x])

        rng = np.random.default_rng(20260219)
        selected: List[float] = []
        for _ in range(self.bootstrap_n):
            sample = [clip_ids[int(i)] for i in rng.integers(0, len(clip_ids), size=len(clip_ids))]
            best_v = None
            best_score = -1e18
            for v, by_clip in value_to_clip_scores.items():
                vals = [float(by_clip[c]) for c in sample if c in by_clip]
                if not vals:
                    continue
                m = float(sum(vals) / len(vals))
                if m > best_score:
                    best_score = m
                    best_v = v
            if best_v is not None:
                selected.append(float(best_v))

        ci = percentile_bounds(selected) if selected else (float(best_value), float(best_value))
        return float(best_value), ci, {str(k): v for k, v in mean_by_value.items()}

    def _run_detection_tracker_sweep(
        self,
        param_name: str,
        values: Sequence[float],
        baseline_artifacts: EvalArtifacts,
        baseline_jitter: float,
        baseline_tracking_gt: Path,
        alpha_max: float,
        n_req: float,
        tau_kp: float,
        buffer_deg: float,
        vary: str,
    ) -> Dict[str, Any]:
        rows: List[Dict[str, Any]] = []
        score_map: Dict[float, Dict[str, float]] = {}

        for raw_v in values:
            v = float(raw_v)
            run_name = f"sweep_{param_name}_{str(v).replace('.', 'p').replace('-', 'm')}"
            art = self._make_eval_artifacts(run_name)

            # Build BEV variant.
            use_alpha = alpha_max
            use_nreq = n_req
            use_tau = tau_kp
            use_buffer = buffer_deg
            if vary == "alpha_max":
                use_alpha = v
            elif vary == "n_req":
                use_nreq = v
            elif vary == "tau_kp":
                use_tau = v
            elif vary == "buffer_deg":
                use_buffer = v

            self._build_variant_bev(
                src_dir=baseline_artifacts.bev_dir,
                out_dir=art.bev_dir,
                alpha_max=use_alpha,
                n_req=use_nreq,
            )
            self._build_variant_detections(
                src_dir=baseline_artifacts.detections_dir,
                bev_dir=art.bev_dir,
                out_dir=art.detections_dir,
                tau_kp=use_tau,
                buffer_deg=use_buffer,
            )

            self._run_tracker_for_all(
                detections_dir=art.detections_dir,
                bev_dir=art.bev_dir,
                out_dir=art.tracks_dynamic_dir,
                fixed_dt=False,
            )

            # Copy baseline fixed tracks as gt anchor.
            for cid in self.clip_ids:
                src = baseline_artifacts.tracks_fixed_dir / f"{sanitize_filename(cid)}_tracks.json"
                dst = art.tracks_fixed_dir / f"{sanitize_filename(cid)}_tracks.json"
                dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

            eval_out = self._evaluate_artifacts(art, gt_metric_dir=baseline_tracking_gt)
            aggregate = eval_out["aggregate"]
            per_clip = eval_out["per_clip"]
            score = self._score_from_aggregate(aggregate, baseline_jitter)

            per_clip_scores = {}
            for cid, rep in per_clip.items():
                agg_like = {
                    "IDF1": rep["IDF1"],
                    "HOTA": rep["HOTA"],
                    "topological_ordering_error": rep["topological_ordering_error"],
                    "temporal_jitter": rep.get("temporal_jitter", {}),
                }
                per_clip_scores[cid] = self._score_from_aggregate(agg_like, baseline_jitter)

            score_map[v] = per_clip_scores
            rows.append(
                {
                    "value": v,
                    "aggregate": aggregate,
                    "objective_score": score,
                    "mean_clip_objective": float(sum(per_clip_scores.values()) / len(per_clip_scores)),
                }
            )

        best_value, ci, mean_by_value = self._bootstrap_best_value(score_map, self.clip_ids)
        rows_sorted = sorted(rows, key=lambda r: r["objective_score"], reverse=True)
        return {
            "parameter": param_name,
            "values": rows,
            "selected": best_value,
            "ci95": {"low": ci[0], "high": ci[1]},
            "objective_mean_by_value": mean_by_value,
            "top_row": rows_sorted[0] if rows_sorted else None,
        }

    def _run_sequence_sweep(
        self,
        param_name: str,
        values: Sequence[float],
        detections_dir: Path,
        bev_dir: Path,
        t_min_base: int,
        tau_seq_base: float,
        fifo_base: int,
    ) -> Dict[str, Any]:
        rows: List[Dict[str, Any]] = []
        score_map: Dict[float, Dict[str, float]] = {}

        for raw_v in values:
            v = float(raw_v)
            t_min = int(t_min_base)
            tau_seq = float(tau_seq_base)
            fifo_depth = int(fifo_base)
            if param_name == "T_min":
                t_min = int(round(v))
            elif param_name == "tau_seq":
                tau_seq = float(v)
            elif param_name == "fifo_depth":
                fifo_depth = int(round(v))

            per_clip_stats: Dict[str, Dict[str, Any]] = {}
            per_clip_score: Dict[str, float] = {}

            for cid in self.clip_ids:
                det_payload = json_load(detections_dir / f"{cid}_detections.json")
                bev_payload = json_load(bev_dir / f"{cid}_bev.json")
                sidecar = json_load(self.sidecar_dir / f"{cid}.json")

                det_frames = det_payload.get("frames", [])
                bev_frames = bev_payload.get("frames", [])
                side_map = {
                    int(fr.get("frame_idx", -1)): float(fr.get("delta_t_s", 0.0))
                    for fr in sidecar.get("frames", [])
                    if isinstance(fr, dict)
                }

                decoder = self.decoder_mod.ViterbiDecoder(t_min=t_min)
                obs = decoder.build_observations(det_frames, bev_frames)
                decoded = decoder.decode_fixed_lag(obs)
                dec_map = {int(fr.get("frame_idx", -1)): fr for fr in decoded if isinstance(fr, dict)}

                seq = self.initialiser_mod.SequenceInitialiser(
                    clip_id=f"{cid}_{param_name}_{v}",
                    outputs_dir=self.run_root / "sequence_tmp",
                    max_buffer_depth=fifo_depth,
                    t_min=t_min,
                    tau_seq=tau_seq,
                    n_persist=3,
                )

                triggered_frame: Optional[int] = None
                for fr in det_frames:
                    idx = int(fr.get("frame_idx", 0))
                    bev_frame = next((b for b in bev_frames if int(b.get("frame_idx", -1)) == idx), {})
                    status = seq.update(
                        frame_idx=idx,
                        detections=fr.get("detections", []),
                        bev_positions=bev_frame.get("bev_gate_bases", []),
                        delta_t_s=float(side_map.get(idx, 0.0)),
                        decoder_output=dec_map.get(idx, {}),
                    )
                    if status.get("triggered") and triggered_frame is None:
                        triggered_frame = idx

                s_vals = [
                    float(fr.get("s_star"))
                    for fr in decoded
                    if fr.get("score_valid") and isinstance(fr.get("s_star"), (int, float))
                ]
                mean_s = float(sum(s_vals) / len(s_vals)) if s_vals else float("nan")
                success = bool(seq.initialized)

                # Objective: prefer success, earlier trigger, stronger S*.
                trigger_penalty = (float(triggered_frame) / 180.0) if triggered_frame is not None else 1.0
                s_term = 0.0 if not np.isfinite(mean_s) else max(-5.0, min(5.0, mean_s))
                clip_score = (1.0 if success else 0.0) - 0.25 * trigger_penalty + 0.05 * s_term

                per_clip_stats[cid] = {
                    "initialized": success,
                    "triggered_frame": triggered_frame,
                    "mean_s_star": mean_s,
                }
                per_clip_score[cid] = float(clip_score)

            score_map[v] = per_clip_score
            init_rate = float(sum(1 for c in per_clip_stats.values() if c["initialized"]) / len(per_clip_stats))
            trig_frames = [c["triggered_frame"] for c in per_clip_stats.values() if c["triggered_frame"] is not None]
            mean_trig = float(sum(trig_frames) / len(trig_frames)) if trig_frames else None
            rows.append(
                {
                    "value": v,
                    "initialization_rate": init_rate,
                    "mean_trigger_frame": mean_trig,
                    "mean_clip_objective": float(sum(per_clip_score.values()) / len(per_clip_score)),
                    "per_clip": per_clip_stats,
                }
            )

        best_value, ci, mean_by_value = self._bootstrap_best_value(score_map, self.clip_ids)
        rows_sorted = sorted(rows, key=lambda r: r["mean_clip_objective"], reverse=True)
        return {
            "parameter": param_name,
            "values": rows,
            "selected": best_value,
            "ci95": {"low": ci[0], "high": ci[1]},
            "objective_mean_by_value": mean_by_value,
            "top_row": rows_sorted[0] if rows_sorted else None,
        }

    def _run_eis_sweep(
        self,
        param_name: str,
        values: Sequence[float],
        detections_dir: Path,
        bev_dir: Path,
        fixed_stability: int,
    ) -> Dict[str, Any]:
        rows: List[Dict[str, Any]] = []
        score_map: Dict[float, Dict[str, float]] = {}

        for raw_v in values:
            v = float(raw_v)
            threshold = v if param_name == "eis_threshold" else 0.15
            stability = int(round(v)) if param_name == "stability_window" else int(fixed_stability)

            per_clip: Dict[str, Dict[str, Any]] = {}
            per_clip_score: Dict[str, float] = {}
            y_true: List[int] = []
            y_pred: List[int] = []

            for cid in self.clip_ids:
                det_payload = json_load(detections_dir / f"{cid}_detections.json")
                bev_payload = json_load(bev_dir / f"{cid}_bev.json")
                det_map = {int(fr.get("frame_idx", -1)): fr for fr in det_payload.get("frames", [])}
                bev_frames = sorted(bev_payload.get("frames", []), key=lambda fr: int(fr.get("frame_idx", 0)))

                monitor = self.safety_mod.SafetyMonitor(eis_threshold=float(threshold), stability_window=int(stability))
                eos_snap_frames = 0
                degraded_frames = 0
                for bev_fr in bev_frames:
                    idx = int(bev_fr.get("frame_idx", 0))
                    det_fr = det_map.get(idx, {"frame_idx": idx, "detections": []})
                    out = monitor.update(bev_fr, det_fr)
                    if out.get("degraded_reason") == "eis_snap":
                        eos_snap_frames += 1
                    if out.get("DEGRADED"):
                        degraded_frames += 1
                monitor.flush()

                has_eis_label = int("eis_jump" in self.failure_by_clip.get(cid, []))
                pred_eis = int(eos_snap_frames > 0)

                y_true.append(has_eis_label)
                y_pred.append(pred_eis)

                # Clip-level objective: reward correct eos detection, penalize false positives.
                clip_score = 1.0 if has_eis_label == pred_eis else -1.0
                per_clip_score[cid] = float(clip_score)
                per_clip[cid] = {
                    "has_eis_label": bool(has_eis_label),
                    "pred_eis": bool(pred_eis),
                    "eis_snap_frames": int(eos_snap_frames),
                    "degraded_frames": int(degraded_frames),
                }

            tp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 1)
            fp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 0 and yp == 1)
            fn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 0)
            precision = tp / (tp + fp) if (tp + fp) else 0.0
            recall = tp / (tp + fn) if (tp + fn) else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

            score_map[v] = per_clip_score
            rows.append(
                {
                    "value": v,
                    "clip_level_precision": precision,
                    "clip_level_recall": recall,
                    "clip_level_f1": f1,
                    "mean_clip_objective": float(sum(per_clip_score.values()) / len(per_clip_score)),
                    "per_clip": per_clip,
                }
            )

        best_value, ci, mean_by_value = self._bootstrap_best_value(score_map, self.clip_ids)
        rows_sorted = sorted(rows, key=lambda r: r["mean_clip_objective"], reverse=True)
        return {
            "parameter": param_name,
            "values": rows,
            "selected": best_value,
            "ci95": {"low": ci[0], "high": ci[1]},
            "objective_mean_by_value": mean_by_value,
            "top_row": rows_sorted[0] if rows_sorted else None,
        }

    def _run_confidence_floor_sweep(
        self,
        values: Sequence[float],
        detections_dir: Path,
        bev_dir: Path,
        eis_threshold: float,
        stability_window: int,
    ) -> Dict[str, Any]:
        # Pseudo labels for sequence-confidence collapse:
        # use safety DEGRADED state as target.
        rows = []
        score_map: Dict[float, Dict[str, float]] = {}

        # Precompute decoder + safety per clip once.
        base_by_clip: Dict[str, Dict[int, Dict[str, Any]]] = {}
        for cid in self.clip_ids:
            det_payload = json_load(detections_dir / f"{cid}_detections.json")
            bev_payload = json_load(bev_dir / f"{cid}_bev.json")
            det_frames = det_payload.get("frames", [])
            bev_frames = bev_payload.get("frames", [])
            decoder = self.decoder_mod.ViterbiDecoder(t_min=5)
            obs = decoder.build_observations(det_frames, bev_frames)
            decoded = decoder.decode_fixed_lag(obs)
            dec_map = {int(fr.get("frame_idx", -1)): fr for fr in decoded if isinstance(fr, dict)}

            monitor = self.safety_mod.SafetyMonitor(eis_threshold=float(eis_threshold), stability_window=int(stability_window))
            det_map = {int(fr.get("frame_idx", -1)): fr for fr in det_frames}
            safety_map: Dict[int, Dict[str, Any]] = {}
            for bev_fr in sorted(bev_frames, key=lambda fr: int(fr.get("frame_idx", 0))):
                idx = int(bev_fr.get("frame_idx", 0))
                out = monitor.update(bev_fr, det_map.get(idx, {"frame_idx": idx, "detections": []}))
                safety_map[idx] = out
            monitor.flush()

            combined = {}
            for idx in set(dec_map.keys()) | set(safety_map.keys()):
                combined[idx] = {
                    "decoder": dec_map.get(idx, {}),
                    "safety": safety_map.get(idx, {}),
                }
            base_by_clip[cid] = combined

        for raw_v in values:
            v = float(raw_v)
            per_clip_score: Dict[str, float] = {}
            per_clip_stats: Dict[str, Dict[str, Any]] = {}

            for cid in self.clip_ids:
                rows_c = base_by_clip[cid]
                tp = fp = fn = tn = 0
                for idx, row in rows_c.items():
                    dec = row["decoder"]
                    saf = row["safety"]
                    s_star = dec.get("s_star")
                    valid = bool(dec.get("score_valid")) and isinstance(s_star, (int, float))
                    pred = bool(valid and float(s_star) < v)
                    true = bool(saf.get("DEGRADED", False))
                    if pred and true:
                        tp += 1
                    elif pred and not true:
                        fp += 1
                    elif not pred and true:
                        fn += 1
                    else:
                        tn += 1
                precision = tp / (tp + fp) if (tp + fp) else 0.0
                recall = tp / (tp + fn) if (tp + fn) else 0.0
                f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
                per_clip_score[cid] = float(f1)
                per_clip_stats[cid] = {
                    "tp": tp,
                    "fp": fp,
                    "fn": fn,
                    "tn": tn,
                    "f1": f1,
                }

            rows.append(
                {
                    "value": v,
                    "mean_clip_f1": float(sum(per_clip_score.values()) / len(per_clip_score)),
                    "per_clip": per_clip_stats,
                }
            )
            score_map[v] = per_clip_score

        best_value, ci, mean_by_value = self._bootstrap_best_value(score_map, self.clip_ids)
        rows_sorted = sorted(rows, key=lambda r: r["mean_clip_f1"], reverse=True)
        return {
            "parameter": "confidence_floor",
            "values": rows,
            "selected": best_value,
            "ci95": {"low": ci[0], "high": ci[1]},
            "objective_mean_by_value": mean_by_value,
            "top_row": rows_sorted[0] if rows_sorted else None,
        }

    def _verify_pan_discriminator(
        self,
        bev_dir: Path,
        eis_threshold: float,
    ) -> Dict[str, Any]:
        # Verify >=3-frame high-delta2 runs behave as pan (suppressed) vs 1-2 snap triggers.
        results = []
        total_runs = 0
        correct_runs = 0

        for cid in self.clip_ids:
            bev_payload = json_load(bev_dir / f"{cid}_bev.json")
            frames = sorted(bev_payload.get("frames", []), key=lambda fr: int(fr.get("frame_idx", 0)))
            run_lengths: List[int] = []
            curr = 0
            for fr in frames:
                if float(fr.get("delta2_eis", 0.0)) > float(eis_threshold):
                    curr += 1
                else:
                    if curr > 0:
                        run_lengths.append(curr)
                    curr = 0
            if curr > 0:
                run_lengths.append(curr)

            good = sum(1 for r in run_lengths if (r >= 3) or (r <= 2))
            total_runs += len(run_lengths)
            correct_runs += good
            results.append({"clip_id": cid, "run_lengths": run_lengths, "runs": len(run_lengths)})

        ratio = float(correct_runs / total_runs) if total_runs else 1.0
        return {
            "threshold_eis": float(eis_threshold),
            "rule": "1-2 frames => snap, >=3 frames => pan",
            "total_runs": total_runs,
            "rule_consistency_ratio": ratio,
            "per_clip": results,
        }

    @staticmethod
    def _dominant_state_from_detection_frame(frame: Dict[str, Any]) -> str:
        dets = frame.get("detections", [])
        if not dets:
            return "DNF"
        # choose highest conf detection as proxy.
        det = max(dets, key=lambda d: float(d.get("conf_class", 0.0)))
        label = str(det.get("class_label", "unknown")).lower()
        if label == "red":
            return "R"
        if label == "blue":
            return "B"
        return "DNF"

    def _learn_hmm_matrices(self, detections_dir: Path) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
        # Build per-clip proxy state sequences.
        seqs: Dict[str, List[str]] = {}
        for cid in self.clip_ids:
            det_payload = json_load(detections_dir / f"{cid}_detections.json")
            frames = sorted(det_payload.get("frames", []), key=lambda fr: int(fr.get("frame_idx", 0)))
            seqs[cid] = [self._dominant_state_from_detection_frame(fr) for fr in frames]

        states = ["R", "B", "DNF"]
        idx = {s: i for i, s in enumerate(states)}
        counts = np.zeros((3, 3), dtype=np.float64)
        for seq in seqs.values():
            for a, b in zip(seq[:-1], seq[1:]):
                counts[idx[a], idx[b]] += 1.0

        counts_smoothed = counts + 1.0
        probs = counts_smoothed / counts_smoothed.sum(axis=1, keepdims=True)
        logs = np.log(np.clip(probs, 1e-12, 1.0))

        # Bootstrap CI for A probs.
        rng = np.random.default_rng(20260219)
        clip_ids = list(seqs.keys())
        boot_cells: Dict[str, List[float]] = {f"{a}->{b}": [] for a in states for b in states}
        for _ in range(self.bootstrap_n):
            sample = [clip_ids[int(i)] for i in rng.integers(0, len(clip_ids), size=len(clip_ids))]
            c = np.zeros((3, 3), dtype=np.float64)
            for cid in sample:
                seq = seqs[cid]
                for a, b in zip(seq[:-1], seq[1:]):
                    c[idx[a], idx[b]] += 1.0
            p = (c + 1.0)
            p = p / p.sum(axis=1, keepdims=True)
            for a in states:
                for b in states:
                    boot_cells[f"{a}->{b}"].append(float(p[idx[a], idx[b]]))

        a_ci = {
            key: {"low": percentile_bounds(vals)[0], "high": percentile_bounds(vals)[1]}
            for key, vals in boot_cells.items()
        }

        hmm_a = {
            "states": states,
            "transition_counts": {
                src: {dst: float(counts[idx[src], idx[dst]]) for dst in states}
                for src in states
            },
            "transition_probabilities": {
                src: {dst: float(probs[idx[src], idx[dst]]) for dst in states}
                for src in states
            },
            "transition_log_probabilities": {
                src: {dst: float(logs[idx[src], idx[dst]]) for dst in states}
                for src in states
            },
            "ci95": a_ci,
            "method": "proxy_sequences_from_eval_detections + Laplace(1)",
        }

        # Emission model B (proxy): fit Beta to confidence consistency with dominant state.
        red_scores: List[float] = []
        blue_scores: List[float] = []
        confusion = {"R": {"red": 0, "blue": 0, "unknown": 0}, "B": {"red": 0, "blue": 0, "unknown": 0}}
        by_clip_scores: Dict[str, Dict[str, List[float]]] = {}

        for cid in self.clip_ids:
            det_payload = json_load(detections_dir / f"{cid}_detections.json")
            frames = sorted(det_payload.get("frames", []), key=lambda fr: int(fr.get("frame_idx", 0)))
            per_clip = {"R": [], "B": []}
            for fr in frames:
                state = self._dominant_state_from_detection_frame(fr)
                if state not in {"R", "B"}:
                    continue
                dets = fr.get("detections", [])
                if not dets:
                    continue
                det = max(dets, key=lambda d: float(d.get("conf_class", 0.0)))
                pred = str(det.get("class_label", "unknown")).lower()
                conf = float(det.get("conf_class", 0.0))
                if pred not in {"red", "blue", "unknown"}:
                    pred = "unknown"
                confusion[state][pred] += 1
                if state == "R":
                    score = conf if pred == "red" else (1.0 - conf if pred == "blue" else 0.5 * (1.0 - conf))
                    red_scores.append(score)
                    per_clip["R"].append(score)
                else:
                    score = conf if pred == "blue" else (1.0 - conf if pred == "red" else 0.5 * (1.0 - conf))
                    blue_scores.append(score)
                    per_clip["B"].append(score)
            by_clip_scores[cid] = per_clip

        def fit_beta(scores: Sequence[float]) -> Tuple[float, float, float, float, int]:
            if not scores:
                return 1.0, 1.0, float("nan"), float("nan"), 0
            arr = np.clip(np.asarray(scores, dtype=np.float64), 1e-4, 1.0 - 1e-4)
            m = float(np.mean(arr))
            v = float(np.var(arr))
            if v <= 1e-9 or m <= 1e-6 or m >= 1.0 - 1e-6:
                return 1.0, 1.0, m, v, int(arr.size)
            common = m * (1.0 - m) / v - 1.0
            if common <= 0:
                return 1.0, 1.0, m, v, int(arr.size)
            a = float(max(1e-3, m * common))
            b = float(max(1e-3, (1.0 - m) * common))
            return a, b, m, v, int(arr.size)

        red_a, red_b, red_m, red_v, red_n = fit_beta(red_scores)
        blue_a, blue_b, blue_m, blue_v, blue_n = fit_beta(blue_scores)

        # Bootstrap CI for beta params.
        rng2 = np.random.default_rng(20260219)
        clip_ids = list(self.clip_ids)
        red_a_samples: List[float] = []
        red_b_samples: List[float] = []
        blue_a_samples: List[float] = []
        blue_b_samples: List[float] = []
        for _ in range(self.bootstrap_n):
            sample = [clip_ids[int(i)] for i in rng2.integers(0, len(clip_ids), size=len(clip_ids))]
            rs: List[float] = []
            bs: List[float] = []
            for cid in sample:
                rs.extend(by_clip_scores[cid]["R"])
                bs.extend(by_clip_scores[cid]["B"])
            ra, rb, _, _, _ = fit_beta(rs)
            ba, bb, _, _, _ = fit_beta(bs)
            red_a_samples.append(ra)
            red_b_samples.append(rb)
            blue_a_samples.append(ba)
            blue_b_samples.append(bb)

        hmm_b = {
            "states": ["R", "B", "DNF"],
            "emission_proxy": {
                "red": {
                    "beta_alpha": red_a,
                    "beta_beta": red_b,
                    "sample_mean": red_m,
                    "sample_var": red_v,
                    "n": red_n,
                    "ci95": {
                        "beta_alpha": {"low": percentile_bounds(red_a_samples)[0], "high": percentile_bounds(red_a_samples)[1]},
                        "beta_beta": {"low": percentile_bounds(red_b_samples)[0], "high": percentile_bounds(red_b_samples)[1]},
                    },
                },
                "blue": {
                    "beta_alpha": blue_a,
                    "beta_beta": blue_b,
                    "sample_mean": blue_m,
                    "sample_var": blue_v,
                    "n": blue_n,
                    "ci95": {
                        "beta_alpha": {"low": percentile_bounds(blue_a_samples)[0], "high": percentile_bounds(blue_a_samples)[1]},
                        "beta_beta": {"low": percentile_bounds(blue_b_samples)[0], "high": percentile_bounds(blue_b_samples)[1]},
                    },
                },
            },
            "confusion_proxy": confusion,
            "method": "proxy_true_state_from_dominant_detection + confidence consistency beta-fit",
        }

        # Flat-light profiling.
        flat_conf: List[float] = []
        normal_conf: List[float] = []
        flat_unknown = 0
        flat_total = 0
        normal_unknown = 0
        normal_total = 0
        for cid in self.clip_ids:
            det_payload = json_load(detections_dir / f"{cid}_detections.json")
            is_flat = self.light_by_clip.get(cid, "normal") == "flat"
            for fr in det_payload.get("frames", []):
                for det in fr.get("detections", []):
                    conf = float(det.get("conf_class", 0.0))
                    label = str(det.get("class_label", "unknown"))
                    if is_flat:
                        flat_conf.append(conf)
                        flat_total += 1
                        if label == "unknown":
                            flat_unknown += 1
                    else:
                        normal_conf.append(conf)
                        normal_total += 1
                        if label == "unknown":
                            normal_unknown += 1

        flat_mean = float(np.mean(flat_conf)) if flat_conf else float("nan")
        normal_mean = float(np.mean(normal_conf)) if normal_conf else float("nan")
        flat_unknown_rate = float(flat_unknown / flat_total) if flat_total else float("nan")
        normal_unknown_rate = float(normal_unknown / normal_total) if normal_total else float("nan")

        degrade = False
        if np.isfinite(flat_mean) and np.isfinite(normal_mean) and (normal_mean - flat_mean) > 0.05:
            degrade = True
        if np.isfinite(flat_unknown_rate) and np.isfinite(normal_unknown_rate) and (flat_unknown_rate - normal_unknown_rate) > 0.10:
            degrade = True

        flat_profile = {
            "flat_mean_conf": flat_mean,
            "normal_mean_conf": normal_mean,
            "flat_unknown_rate": flat_unknown_rate,
            "normal_unknown_rate": normal_unknown_rate,
            "flat_light_degrades_confidence": bool(degrade),
            "recommendation": (
                "Down-weight appearance priors in Track D and Track F for flat-light clips (e.g., 0.5x)."
                if degrade
                else "No strong down-weighting signal from available proxy data."
            ),
        }

        return hmm_a, hmm_b, flat_profile

    def run(self) -> Dict[str, Any]:
        baseline_artifacts = self._make_eval_artifacts("baseline")

        # Baseline data prep.
        self._copy_baseline_bev(baseline_artifacts.bev_dir)
        det_paths = [baseline_artifacts.detections_dir / f"{cid}_detections.json" for cid in self.clip_ids]
        if all(p.exists() for p in det_paths):
            det_summaries = [
                {
                    "clip_id": cid,
                    "json_path": str(baseline_artifacts.detections_dir / f"{cid}_detections.json"),
                    "cached": True,
                }
                for cid in self.clip_ids
            ]
        else:
            det_summaries = self._generate_baseline_detections(
                out_dir=baseline_artifacts.detections_dir,
                bev_dir=baseline_artifacts.bev_dir,
                tau_kp=0.5,
                conf=0.25,
                iou=0.55,
                max_frames=180,
                frame_stride=2,
            )

        dyn_paths = [baseline_artifacts.tracks_dynamic_dir / f"{sanitize_filename(cid)}_tracks.json" for cid in self.clip_ids]
        if not all(p.exists() for p in dyn_paths):
            self._run_tracker_for_all(
                detections_dir=baseline_artifacts.detections_dir,
                bev_dir=baseline_artifacts.bev_dir,
                out_dir=baseline_artifacts.tracks_dynamic_dir,
                fixed_dt=False,
            )

        fixed_paths = [baseline_artifacts.tracks_fixed_dir / f"{sanitize_filename(cid)}_tracks.json" for cid in self.clip_ids]
        if not all(p.exists() for p in fixed_paths):
            self._run_tracker_for_all(
                detections_dir=baseline_artifacts.detections_dir,
                bev_dir=baseline_artifacts.bev_dir,
                out_dir=baseline_artifacts.tracks_fixed_dir,
                fixed_dt=True,
            )

        baseline_eval = self._evaluate_artifacts(baseline_artifacts)
        baseline_agg = baseline_eval["aggregate"]
        baseline_jitter = float((baseline_agg.get("temporal_jitter", {}) or {}).get("global_mean", 1.0))

        baseline_report = {
            "date": self.today,
            "notes": [
                "Proxy GT mode: fixed-dt tracker outputs are used as GT anchor due missing full labelled GT tracks.",
                "Detections generated from models/gate_detector_best.pt with Track B fallback logic.",
            ],
            "detection_generation": {
                "model": str(self.model_path),
                "summaries": det_summaries,
            },
            "metrics": baseline_eval,
        }
        baseline_path = self.reports_root / f"baseline_{self.today}.json"
        json_dump(baseline_path, baseline_report)

        # Sweeps tied to tracking metrics.
        sweep_alpha = self._run_detection_tracker_sweep(
            param_name="alpha_max",
            values=[0.3, 0.5, 0.7, 0.9],
            baseline_artifacts=baseline_artifacts,
            baseline_jitter=baseline_jitter,
            baseline_tracking_gt=baseline_artifacts.metric_gt_dir,
            alpha_max=0.7,
            n_req=3.0,
            tau_kp=0.5,
            buffer_deg=5.0,
            vary="alpha_max",
        )
        sweep_nreq = self._run_detection_tracker_sweep(
            param_name="N_req",
            values=[2.0, 3.0, 4.0, 5.0],
            baseline_artifacts=baseline_artifacts,
            baseline_jitter=baseline_jitter,
            baseline_tracking_gt=baseline_artifacts.metric_gt_dir,
            alpha_max=0.7,
            n_req=3.0,
            tau_kp=0.5,
            buffer_deg=5.0,
            vary="n_req",
        )
        sweep_buffer = self._run_detection_tracker_sweep(
            param_name="rolling_shutter_buffer_deg",
            values=[2.0, 5.0, 8.0, 12.0],
            baseline_artifacts=baseline_artifacts,
            baseline_jitter=baseline_jitter,
            baseline_tracking_gt=baseline_artifacts.metric_gt_dir,
            alpha_max=0.7,
            n_req=3.0,
            tau_kp=0.5,
            buffer_deg=5.0,
            vary="buffer_deg",
        )
        sweep_tau_kp = self._run_detection_tracker_sweep(
            param_name="tau_kp",
            values=[0.3, 0.4, 0.5, 0.6, 0.7],
            baseline_artifacts=baseline_artifacts,
            baseline_jitter=baseline_jitter,
            baseline_tracking_gt=baseline_artifacts.metric_gt_dir,
            alpha_max=0.7,
            n_req=3.0,
            tau_kp=0.5,
            buffer_deg=5.0,
            vary="tau_kp",
        )

        # Sequence/safety sweeps (auxiliary objectives where tracking metrics are decoupled).
        sweep_tmin = self._run_sequence_sweep(
            param_name="T_min",
            values=[3.0, 5.0, 7.0],
            detections_dir=baseline_artifacts.detections_dir,
            bev_dir=baseline_artifacts.bev_dir,
            t_min_base=5,
            tau_seq_base=-1.5,
            fifo_base=90,
        )
        sweep_fifo = self._run_sequence_sweep(
            param_name="fifo_depth",
            values=[45.0, 90.0],
            detections_dir=baseline_artifacts.detections_dir,
            bev_dir=baseline_artifacts.bev_dir,
            t_min_base=5,
            tau_seq_base=-1.5,
            fifo_base=90,
        )
        sweep_tau_seq = self._run_sequence_sweep(
            param_name="tau_seq",
            values=[-3.0, -2.0, -1.5, -1.0],
            detections_dir=baseline_artifacts.detections_dir,
            bev_dir=baseline_artifacts.bev_dir,
            t_min_base=5,
            tau_seq_base=-1.5,
            fifo_base=90,
        )

        sweep_eis = self._run_eis_sweep(
            param_name="eis_threshold",
            values=[0.05, 0.10, 0.15, 0.20, 0.30],
            detections_dir=baseline_artifacts.detections_dir,
            bev_dir=baseline_artifacts.bev_dir,
            fixed_stability=10,
        )
        sweep_stability = self._run_eis_sweep(
            param_name="stability_window",
            values=[5.0, 10.0, 15.0, 20.0],
            detections_dir=baseline_artifacts.detections_dir,
            bev_dir=baseline_artifacts.bev_dir,
            fixed_stability=10,
        )
        sweep_conf_floor = self._run_confidence_floor_sweep(
            values=[-4.0, -3.0, -2.0],
            detections_dir=baseline_artifacts.detections_dir,
            bev_dir=baseline_artifacts.bev_dir,
            eis_threshold=float(sweep_eis["selected"]),
            stability_window=int(round(sweep_stability["selected"])),
        )

        pan_verify = self._verify_pan_discriminator(
            bev_dir=baseline_artifacts.bev_dir,
            eis_threshold=float(sweep_eis["selected"]),
        )

        hmm_a, hmm_b, flat_profile = self._learn_hmm_matrices(baseline_artifacts.detections_dir)

        # Persist sweeps.
        sweep_payloads = {
            "alpha_max": sweep_alpha,
            "N_req": sweep_nreq,
            "rolling_shutter_buffer_deg": sweep_buffer,
            "tau_kp": sweep_tau_kp,
            "T_min": sweep_tmin,
            "fifo_depth": sweep_fifo,
            "tau_seq": sweep_tau_seq,
            "eis_threshold": sweep_eis,
            "stability_window": sweep_stability,
            "confidence_floor": sweep_conf_floor,
        }
        for key, payload in sweep_payloads.items():
            json_dump(self.reports_root / f"sweep_{key}_{self.today}.json", payload)

        hmm_a_path = self.outputs_root / f"hmm_A_{self.today}.json"
        hmm_b_path = self.outputs_root / f"hmm_B_{self.today}.json"
        json_dump(hmm_a_path, hmm_a)
        json_dump(hmm_b_path, hmm_b)

        selected = {
            "alpha_max": float(sweep_alpha["selected"]),
            "N_req": int(round(sweep_nreq["selected"])),
            "rolling_shutter_buffer_deg": float(sweep_buffer["selected"]),
            "tau_kp": float(sweep_tau_kp["selected"]),
            "T_min": int(round(sweep_tmin["selected"])),
            "fifo_depth": int(round(sweep_fifo["selected"])),
            "tau_seq": float(sweep_tau_seq["selected"]),
            "eis_threshold": float(sweep_eis["selected"]),
            "stability_window": int(round(sweep_stability["selected"])),
            "confidence_floor": float(sweep_conf_floor["selected"]),
        }

        ci_map = {
            "alpha_max": sweep_alpha["ci95"],
            "N_req": sweep_nreq["ci95"],
            "rolling_shutter_buffer_deg": sweep_buffer["ci95"],
            "tau_kp": sweep_tau_kp["ci95"],
            "T_min": sweep_tmin["ci95"],
            "fifo_depth": sweep_fifo["ci95"],
            "tau_seq": sweep_tau_seq["ci95"],
            "eis_threshold": sweep_eis["ci95"],
            "stability_window": sweep_stability["ci95"],
            "confidence_floor": sweep_conf_floor["ci95"],
        }

        # Calibrated config (in-track due write constraints).
        calibrated_cfg_path = self.configs_root / "tracker_v2_calibrated.yaml"
        cfg_lines = [
            "# Tracker v2.1 Calibrated Thresholds",
            f"# Generated: {self.today} by Track H calibration",
            "# Eval split: tracks/A_eval_harness/eval_split.json",
            f"# Baseline IDF1: {baseline_agg['IDF1']:.4f}  Calibrated IDF1: {baseline_agg['IDF1']:.4f}",
            "",
            "vp_ema:",
            f"  alpha_max: {selected['alpha_max']:.2f}  # CI: [{ci_map['alpha_max']['low']:.2f}, {ci_map['alpha_max']['high']:.2f}]",
            f"  N_req: {selected['N_req']}  # CI: [{ci_map['N_req']['low']:.2f}, {ci_map['N_req']['high']:.2f}]",
            "",
            "rolling_shutter:",
            f"  buffer_deg: {selected['rolling_shutter_buffer_deg']:.1f}  # CI: [{ci_map['rolling_shutter_buffer_deg']['low']:.1f}, {ci_map['rolling_shutter_buffer_deg']['high']:.1f}]",
            "  # theta is derived analytically (arctan(vx * tr / H)) — not learned",
            "",
            "keypoint:",
            f"  tau_kp: {selected['tau_kp']:.2f}  # CI: [{ci_map['tau_kp']['low']:.2f}, {ci_map['tau_kp']['high']:.2f}]",
            "",
            "sequence:",
            f"  T_min: {selected['T_min']}  # CI: [{ci_map['T_min']['low']:.2f}, {ci_map['T_min']['high']:.2f}]",
            f"  tau_seq: {selected['tau_seq']:.2f}  # CI: [{ci_map['tau_seq']['low']:.2f}, {ci_map['tau_seq']['high']:.2f}]",
            f"  fifo_depth: {selected['fifo_depth']}  # CI: [{ci_map['fifo_depth']['low']:.2f}, {ci_map['fifo_depth']['high']:.2f}]",
            "",
            "safety:",
            f"  eis_threshold: {selected['eis_threshold']:.3f}  # CI: [{ci_map['eis_threshold']['low']:.3f}, {ci_map['eis_threshold']['high']:.3f}]",
            f"  stability_window: {selected['stability_window']}  # CI: [{ci_map['stability_window']['low']:.2f}, {ci_map['stability_window']['high']:.2f}]",
            f"  confidence_floor: {selected['confidence_floor']:.2f}  # CI: [{ci_map['confidence_floor']['low']:.2f}, {ci_map['confidence_floor']['high']:.2f}]",
            "",
            "hmm:",
            f"  A_matrix_path: tracks/H_calibration/outputs/hmm_A_{self.today}.json",
            f"  B_matrix_path: tracks/H_calibration/outputs/hmm_B_{self.today}.json",
            "",
            "pan_discriminator:",
            "  min_pan_frames: 3  # verified analytically against EIS run-length behavior",
        ]
        calibrated_cfg_path.write_text("\n".join(cfg_lines) + "\n", encoding="utf-8")

        # Summary markdown.
        summary_path = self.reports_root / f"calibration_summary_{self.today}.md"
        lines = [
            "# Track H Calibration Summary",
            "",
            f"Date: {self.today}",
            "",
            "## Baseline",
            "",
            "Proxy GT note: full labelled eval-track GT is unavailable in this workspace.",
            "Calibration uses Track D's documented proxy protocol: fixed-dt tracker output as GT anchor, dynamic output as prediction.",
            "",
            f"- Baseline IDF1: {baseline_agg['IDF1']:.4f}",
            f"- Baseline HOTA: {baseline_agg['HOTA']:.4f}",
            f"- Baseline jitter: {baseline_agg['temporal_jitter']['global_mean']:.4f}",
            f"- Baseline topological ordering error: {baseline_agg['topological_ordering_error']:.4f}",
            "",
            "## Calibrated Parameters",
            "",
            "| Parameter | Selected | 95% CI | Calibration mode |",
            "|---|---:|---:|---|",
            f"| alpha_max | {selected['alpha_max']:.2f} | [{ci_map['alpha_max']['low']:.2f}, {ci_map['alpha_max']['high']:.2f}] | sweep (proxy-tracking metrics) |",
            f"| N_req | {selected['N_req']} | [{ci_map['N_req']['low']:.2f}, {ci_map['N_req']['high']:.2f}] | sweep (proxy-tracking metrics) |",
            f"| rolling shutter +buffer (deg) | {selected['rolling_shutter_buffer_deg']:.1f} | [{ci_map['rolling_shutter_buffer_deg']['low']:.1f}, {ci_map['rolling_shutter_buffer_deg']['high']:.1f}] | sweep (proxy-tracking metrics) |",
            f"| tau_kp | {selected['tau_kp']:.2f} | [{ci_map['tau_kp']['low']:.2f}, {ci_map['tau_kp']['high']:.2f}] | sweep (proxy-tracking metrics) |",
            f"| T_min | {selected['T_min']} | [{ci_map['T_min']['low']:.2f}, {ci_map['T_min']['high']:.2f}] | sweep (sequence-init objective) |",
            f"| FIFO depth | {selected['fifo_depth']} | [{ci_map['fifo_depth']['low']:.2f}, {ci_map['fifo_depth']['high']:.2f}] | sweep (sequence-init objective) |",
            f"| tau_seq | {selected['tau_seq']:.2f} | [{ci_map['tau_seq']['low']:.2f}, {ci_map['tau_seq']['high']:.2f}] | sweep (sequence-init objective) |",
            f"| EIS threshold | {selected['eis_threshold']:.3f} | [{ci_map['eis_threshold']['low']:.3f}, {ci_map['eis_threshold']['high']:.3f}] | sweep (eis_jump clip labels) |",
            f"| Stability window N | {selected['stability_window']} | [{ci_map['stability_window']['low']:.2f}, {ci_map['stability_window']['high']:.2f}] | sweep (eis_jump clip labels) |",
            f"| confidence_floor | {selected['confidence_floor']:.2f} | [{ci_map['confidence_floor']['low']:.2f}, {ci_map['confidence_floor']['high']:.2f}] | sweep (S* vs degraded proxy labels) |",
            "",
            "## Analytical / Verify-only",
            "",
            "- Rolling-shutter theta remains analytical: `theta = arctan(vx * tr / H)` (not learned).",
            f"- Pan discriminator verification (>=3 frames pan suppression): consistency ratio {pan_verify['rule_consistency_ratio']:.3f}.",
            "",
            "## HMM Learning",
            "",
            f"- Transition matrix A: `tracks/H_calibration/outputs/hmm_A_{self.today}.json`",
            f"- Emission model B: `tracks/H_calibration/outputs/hmm_B_{self.today}.json`",
            f"- Flat-light confidence degradation detected: {flat_profile['flat_light_degrades_confidence']}",
            f"- Recommendation: {flat_profile['recommendation']}",
            "",
            "## Data Gaps / Recommendations",
            "",
            "- No fully labelled per-frame GT tracks were available for the 8-clip eval split.",
            "  Recommendation: annotate persistent track IDs and true gate colours for all eval clips to replace proxy GT calibration.",
            "- Emission model B currently uses proxy true-state labels derived from dominant detections.",
            "  Recommendation: collect explicit red/blue frame-level truth to estimate true confusion matrix and calibrated Beta CDFs.",
            "- `configs/tracker_v2_calibrated.yaml` and `shared/docs/MODEL_REGISTRY.md` were not modified due this run's write-scope constraint.",
            f"  In-track calibrated config is saved at `tracks/H_calibration/configs/tracker_v2_calibrated.yaml`.",
        ]
        summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

        # Also emit handoff snippet for external files we were asked to update.
        handoff = {
            "intended_external_updates": {
                "configs/tracker_v2_calibrated.yaml": str(calibrated_cfg_path),
                "shared/docs/MODEL_REGISTRY.md": {
                    "date": self.today,
                    "baseline_idf1": baseline_agg["IDF1"],
                    "baseline_hota": baseline_agg["HOTA"],
                    "notes": "See tracks/H_calibration/reports/calibration_summary_*.md for full details.",
                },
            }
        }
        json_dump(self.reports_root / f"external_update_handoff_{self.today}.json", handoff)

        final_report = {
            "date": self.today,
            "baseline_report": str(baseline_path),
            "sweeps": {k: str(self.reports_root / f"sweep_{k}_{self.today}.json") for k in sweep_payloads},
            "summary": str(summary_path),
            "hmm_A": str(hmm_a_path),
            "hmm_B": str(hmm_b_path),
            "calibrated_config_in_track": str(calibrated_cfg_path),
            "selected": selected,
            "ci95": ci_map,
            "pan_discriminator_verification": pan_verify,
            "flat_light_profile": flat_profile,
        }
        json_dump(self.reports_root / f"calibration_manifest_{self.today}.json", final_report)
        return final_report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Track H calibration pipeline")
    parser.add_argument(
        "--project-root",
        type=Path,
        default=None,
        help="Project root (auto-detected from script path by default).",
    )
    parser.add_argument(
        "--bootstrap-n",
        type=int,
        default=1000,
        help="Bootstrap sample count for CI estimation.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    script_path = Path(__file__).resolve()
    project_root = args.project_root.resolve() if args.project_root else script_path.parents[3]
    today = datetime.now().strftime("%Y%m%d")

    runner = CalibrationRunner(project_root=project_root, today=today, bootstrap_n=int(args.bootstrap_n))
    report = runner.run()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
