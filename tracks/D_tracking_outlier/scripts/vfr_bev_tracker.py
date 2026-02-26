#!/usr/bin/env python3
"""
Wave 3 Track D runner for VFR-aware Kalman + BEV ByteTrack-style association.

This script is intentionally self-contained inside tracks/D_tracking_outlier so
it can be used without editing shared modules owned by other tracks.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np


def project_point_h(H: np.ndarray, x: float, y: float) -> Tuple[float, float]:
    p = np.array([x, y, 1.0], dtype=np.float64)
    out = H @ p
    if abs(out[2]) < 1e-12:
        return float(x), float(y)
    return float(out[0] / out[2]), float(out[1] / out[2])


def project_bbox_to_bev(H: np.ndarray, bbox_xyxy: Sequence[float]) -> Tuple[float, float, float, float]:
    x1, y1, x2, y2 = [float(v) for v in bbox_xyxy]
    corners = [
        project_point_h(H, x1, y1),
        project_point_h(H, x2, y1),
        project_point_h(H, x2, y2),
        project_point_h(H, x1, y2),
    ]
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]
    return (float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys)))


def iou_xyxy(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom = area_a + area_b - inter
    if denom <= 0.0:
        return 0.0
    return float(inter / denom)


def safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


@dataclass
class Observation:
    frame_idx: int
    detection_id: str
    conf_class: float
    is_degraded: bool
    class_label: str
    geom_ok: bool
    bev_x: float
    bev_y: float
    bev_bbox: Tuple[float, float, float, float]
    scale_s: float
    aspect_ratio: Optional[float]
    colour_hist: Optional[np.ndarray]
    image_base_x: float
    image_base_y: float


@dataclass
class FrameTrack:
    track_id: int
    bev_x: float
    bev_y: float
    bev_vx: float
    bev_vy: float
    innovation_magnitude: Optional[float]
    frames_since_observation: int
    base_px: Dict[str, float]


class KalmanTrack:
    def __init__(self, track_id: int, obs: Observation, frame_idx: int):
        self.track_id = int(track_id)
        self.x = np.array(
            [obs.bev_x, obs.bev_y, 0.0, 0.0, obs.scale_s, 0.0],
            dtype=np.float64,
        )
        self.P = np.diag([1.0, 1.0, 10.0, 10.0, 1.0, 10.0]).astype(np.float64)
        self.last_frame_idx = int(frame_idx)
        self.frames_since_observation = 0
        self.hits = 1
        self.age = 1
        self.innovation_magnitude: Optional[float] = None
        self.aspect_ratio = obs.aspect_ratio if obs.aspect_ratio is not None else 1.0
        self.colour_hist = obs.colour_hist

    @staticmethod
    def _build_F(dt: float) -> np.ndarray:
        return np.array(
            [
                [1.0, 0.0, dt, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, dt, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
                [0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 0.0, 0.0, 1.0, dt],
                [0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
            ],
            dtype=np.float64,
        )

    @staticmethod
    def _build_Q(dt: float, sigma_pos: float = 0.6, sigma_scale: float = 0.25) -> np.ndarray:
        q = np.zeros((6, 6), dtype=np.float64)
        dt2 = dt * dt
        dt3 = dt2 * dt
        dt4 = dt2 * dt2
        block_pos = np.array([[dt4 / 4.0, dt3 / 2.0], [dt3 / 2.0, dt2]], dtype=np.float64) * (sigma_pos**2)
        block_s = np.array([[dt4 / 4.0, dt3 / 2.0], [dt3 / 2.0, dt2]], dtype=np.float64) * (sigma_scale**2)
        q[np.ix_([0, 2], [0, 2])] = block_pos
        q[np.ix_([1, 3], [1, 3])] = block_pos
        q[np.ix_([4, 5], [4, 5])] = block_s
        return q

    @staticmethod
    def _H() -> np.ndarray:
        return np.array(
            [
                [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
                [0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            ],
            dtype=np.float64,
        )

    def predict(self, dt: float) -> None:
        dt = max(1e-6, float(dt))
        F = self._build_F(dt)
        Q = self._build_Q(dt)
        self.x = F @ self.x
        self.P = F @ self.P @ F.T + Q
        self.last_frame_idx += 1
        self.frames_since_observation += 1
        self.age += 1

    def innovation_for(self, obs: Observation, degraded_r_boost: float = 4.0) -> Tuple[np.ndarray, np.ndarray, float]:
        H = self._H()
        z = np.array([obs.bev_x, obs.bev_y, obs.scale_s], dtype=np.float64)
        y = z - (H @ self.x)
        r_xy = 0.2
        r_s = 0.2
        if obs.is_degraded:
            r_xy *= degraded_r_boost
            r_s *= degraded_r_boost * 0.75
        R = np.diag([r_xy**2, r_xy**2, r_s**2]).astype(np.float64)
        S = H @ self.P @ H.T + R
        try:
            S_inv = np.linalg.inv(S)
            mahal = float(math.sqrt(max(0.0, y.T @ S_inv @ y)))
        except np.linalg.LinAlgError:
            mahal = float("inf")
        return y, S, mahal

    def update(self, obs: Observation, degraded_r_boost: float = 4.0) -> float:
        H = self._H()
        y, S, mahal = self.innovation_for(obs, degraded_r_boost=degraded_r_boost)
        try:
            K = self.P @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            K = np.zeros((6, 3), dtype=np.float64)
        self.x = self.x + (K @ y)
        self.P = (np.eye(6, dtype=np.float64) - K @ H) @ self.P
        self.frames_since_observation = 0
        self.hits += 1
        self.innovation_magnitude = float(mahal)
        if obs.aspect_ratio is not None:
            self.aspect_ratio = float(obs.aspect_ratio)
        if obs.colour_hist is not None:
            self.colour_hist = obs.colour_hist
        self.last_frame_idx = obs.frame_idx
        return float(mahal)

    def predicted_bbox(self) -> Tuple[float, float, float, float]:
        s = max(1e-4, float(self.x[4]))
        ar = max(1e-3, float(self.aspect_ratio if self.aspect_ratio is not None else 1.0))
        width = s / math.sqrt(ar)
        height = s * math.sqrt(ar)
        cx = float(self.x[0])
        cy = float(self.x[1])
        return (cx - width / 2.0, cy - height / 2.0, cx + width / 2.0, cy + height / 2.0)


class BeVByteTracker:
    def __init__(
        self,
        high_thresh: float = 0.5,
        low_thresh: float = 0.1,
        max_lost: int = 30,
        maha_gate: float = 14.0,
        degraded_r_boost: float = 4.0,
        use_fixed_dt: bool = False,
    ):
        self.high_thresh = float(high_thresh)
        self.low_thresh = float(low_thresh)
        self.max_lost = int(max_lost)
        self.maha_gate = float(maha_gate)
        self.degraded_r_boost = float(degraded_r_boost)
        self.use_fixed_dt = bool(use_fixed_dt)
        self.tracks: List[KalmanTrack] = []
        self.next_track_id = 1
        self.stats: Dict[str, float] = {
            "frames": 0,
            "tracks_created": 0,
            "tracks_deleted": 0,
            "pass1_matches": 0,
            "pass2_matches": 0,
            "updates_total": 0,
            "coast_steps": 0,
            "mean_innovation": 0.0,
            "max_innovation": 0.0,
        }
        self._innovations: List[float] = []
        self.dt_used: List[float] = []

    @staticmethod
    def _appearance_cost(track: KalmanTrack, obs: Observation) -> float:
        costs: List[float] = []
        if track.colour_hist is not None and obs.colour_hist is not None:
            a = track.colour_hist.astype(np.float64)
            b = obs.colour_hist.astype(np.float64)
            if a.size == b.size and a.size > 0:
                an = a / (np.sum(a) + 1e-9)
                bn = b / (np.sum(b) + 1e-9)
                costs.append(float(0.5 * np.sum(np.abs(an - bn))))
        if track.aspect_ratio is not None and obs.aspect_ratio is not None:
            den = abs(float(track.aspect_ratio)) + 1e-6
            costs.append(float(min(2.0, abs(float(obs.aspect_ratio) - float(track.aspect_ratio)) / den)))
        if not costs:
            return 0.0
        return float(sum(costs) / len(costs))

    @staticmethod
    def _greedy_assign(cost_pairs: List[Tuple[float, int, int]]) -> List[Tuple[int, int]]:
        assigned_tracks = set()
        assigned_dets = set()
        matches: List[Tuple[int, int]] = []
        for _, ti, di in sorted(cost_pairs, key=lambda t: t[0]):
            if ti in assigned_tracks or di in assigned_dets:
                continue
            assigned_tracks.add(ti)
            assigned_dets.add(di)
            matches.append((ti, di))
        return matches

    def _spawn(self, obs: Observation, frame_idx: int) -> None:
        tr = KalmanTrack(track_id=self.next_track_id, obs=obs, frame_idx=frame_idx)
        self.tracks.append(tr)
        self.next_track_id += 1
        self.stats["tracks_created"] += 1

    def step(
        self,
        frame_idx: int,
        delta_t_s: float,
        fps_nominal: float,
        observations: Sequence[Observation],
        condition_light: str,
        H_inv_for_output: Optional[np.ndarray],
    ) -> List[FrameTrack]:
        self.stats["frames"] += 1
        dt = float(delta_t_s)
        if self.use_fixed_dt:
            dt = 1.0 / max(1e-6, float(fps_nominal))
        if dt <= 0.0:
            dt = 1.0 / max(1e-6, float(fps_nominal))
        self.dt_used.append(dt)

        for tr in self.tracks:
            tr.predict(dt)
            self.stats["coast_steps"] += 1

        high = [o for o in observations if o.conf_class >= self.high_thresh]
        low = [o for o in observations if self.low_thresh <= o.conf_class < self.high_thresh]

        appearance_weight = 0.05 if str(condition_light).lower() == "flat" else 0.2

        pass1_costs: List[Tuple[float, int, int]] = []
        for ti, tr in enumerate(self.tracks):
            for di, obs in enumerate(high):
                _, _, mahal = tr.innovation_for(obs, degraded_r_boost=self.degraded_r_boost)
                if not np.isfinite(mahal) or mahal > self.maha_gate:
                    continue
                app_cost = self._appearance_cost(tr, obs)
                geom_penalty = 0.15 if not obs.geom_ok else 0.0
                blended = 0.8 * mahal + appearance_weight * app_cost + geom_penalty
                pass1_costs.append((float(blended), ti, di))

        pass1_matches = self._greedy_assign(pass1_costs)
        matched_track_ids = {ti for ti, _ in pass1_matches}
        matched_high_ids = {di for _, di in pass1_matches}

        for ti, di in pass1_matches:
            tr = self.tracks[ti]
            obs = high[di]
            mahal = tr.update(obs, degraded_r_boost=self.degraded_r_boost)
            self._innovations.append(mahal)
            self.stats["pass1_matches"] += 1
            self.stats["updates_total"] += 1

        unmatched_tracks = [ti for ti in range(len(self.tracks)) if ti not in matched_track_ids]
        pass2_pool = low + [o for di, o in enumerate(high) if di not in matched_high_ids]
        pass2_high_index: Dict[int, int] = {}
        offset = len(low)
        for hi, obs in enumerate(high):
            if hi in matched_high_ids:
                continue
            pass2_high_index[offset] = hi
            offset += 1

        pass2_costs: List[Tuple[float, int, int]] = []
        for ui, ti in enumerate(unmatched_tracks):
            tr = self.tracks[ti]
            pred_box = tr.predicted_bbox()
            for di, obs in enumerate(pass2_pool):
                ov = iou_xyxy(pred_box, obs.bev_bbox)
                if ov <= 0.0:
                    continue
                pass2_costs.append((float(1.0 - ov), ui, di))

        pass2_matches_local = self._greedy_assign(pass2_costs)
        matched_pass2_pool = set()
        matched_high_via_pass2 = set()
        for ui, di in pass2_matches_local:
            ti = unmatched_tracks[ui]
            tr = self.tracks[ti]
            obs = pass2_pool[di]
            mahal = tr.update(obs, degraded_r_boost=self.degraded_r_boost)
            self._innovations.append(mahal)
            matched_pass2_pool.add(di)
            if di in pass2_high_index:
                matched_high_via_pass2.add(pass2_high_index[di])
            self.stats["pass2_matches"] += 1
            self.stats["updates_total"] += 1

        matched_high_final = set(matched_high_ids) | matched_high_via_pass2

        for di, obs in enumerate(high):
            if di not in matched_high_final:
                self._spawn(obs, frame_idx=frame_idx)

        kept: List[KalmanTrack] = []
        for tr in self.tracks:
            if tr.frames_since_observation <= self.max_lost:
                kept.append(tr)
            else:
                self.stats["tracks_deleted"] += 1
        self.tracks = kept

        frame_tracks: List[FrameTrack] = []
        for tr in sorted(self.tracks, key=lambda t: t.track_id):
            bev_x = float(tr.x[0])
            bev_y = float(tr.x[1])
            out_base_x, out_base_y = bev_x, bev_y
            if H_inv_for_output is not None:
                out_base_x, out_base_y = project_point_h(H_inv_for_output, bev_x, bev_y)
            frame_tracks.append(
                FrameTrack(
                    track_id=int(tr.track_id),
                    bev_x=bev_x,
                    bev_y=bev_y,
                    bev_vx=float(tr.x[2]),
                    bev_vy=float(tr.x[3]),
                    innovation_magnitude=float(tr.innovation_magnitude) if tr.innovation_magnitude is not None else None,
                    frames_since_observation=int(tr.frames_since_observation),
                    base_px={"x_px": float(out_base_x), "y_px": float(out_base_y)},
                )
            )

        if self._innovations:
            self.stats["mean_innovation"] = float(np.mean(self._innovations))
            self.stats["max_innovation"] = float(np.max(self._innovations))

        return frame_tracks


def load_json(path: Path) -> Dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def sanitize_clip_id(clip_id: str) -> str:
    return "".join(c if c.isalnum() or c in (" ", "-", "_", ".", "(", ")") else "_" for c in clip_id).strip()


def build_light_map(eval_split_path: Path) -> Dict[str, str]:
    payload = load_json(eval_split_path)
    out: Dict[str, str] = {}
    for item in payload.get("clips", []):
        if not isinstance(item, dict):
            continue
        cid = str(item.get("clip_id", ""))
        if cid:
            out[cid] = str(item.get("condition_light", "normal"))
    return out


def find_clip_file(dir_path: Path, clip_id: str, suffix: str) -> Path:
    candidate = dir_path / f"{clip_id}{suffix}"
    if candidate.exists():
        return candidate
    # Fallback to sanitized stem match.
    stem = f"{clip_id}{suffix}"
    for p in dir_path.glob(f"*{suffix}"):
        if p.name == stem or p.stem == Path(stem).stem:
            return p
    raise FileNotFoundError(f"Missing file for clip '{clip_id}' in {dir_path} with suffix '{suffix}'")


def parse_observations(
    frame_idx: int,
    det_frame: Dict[str, object],
    bev_frame: Dict[str, object],
) -> List[Observation]:
    H = np.array(bev_frame.get("homography_H_t", [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]), dtype=np.float64).reshape(3, 3)
    out: List[Observation] = []
    raw_dets = det_frame.get("detections", [])
    if not isinstance(raw_dets, list):
        return out
    for det in raw_dets:
        if not isinstance(det, dict):
            continue
        base = det.get("base_px")
        if not isinstance(base, dict):
            continue
        bx = safe_float(base.get("x_px"), 0.0)
        by = safe_float(base.get("y_px"), 0.0)
        bev_x, bev_y = project_point_h(H, bx, by)
        bbox = det.get("bbox_xyxy")
        if isinstance(bbox, list) and len(bbox) == 4:
            bev_bbox = project_bbox_to_bev(H, bbox)
        else:
            bev_bbox = (bev_x - 0.1, bev_y - 0.1, bev_x + 0.1, bev_y + 0.1)
        bw = max(1e-6, bev_bbox[2] - bev_bbox[0])
        bh = max(1e-6, bev_bbox[3] - bev_bbox[1])
        s = float(math.sqrt(bw * bh))
        aspect = det.get("aspect_ratio")
        aspect_ratio = float(aspect) if isinstance(aspect, (int, float)) else None
        hist = det.get("colour_histogram")
        colour_hist = None
        if isinstance(hist, list) and hist:
            try:
                colour_hist = np.array([float(v) for v in hist], dtype=np.float64)
            except Exception:
                colour_hist = None
        out.append(
            Observation(
                frame_idx=frame_idx,
                detection_id=str(det.get("detection_id", f"det_{frame_idx}_{len(out)}")),
                conf_class=float(safe_float(det.get("conf_class"), 0.0)),
                is_degraded=bool(det.get("is_degraded", False)),
                class_label=str(det.get("class_label", "unknown")),
                geom_ok=bool(det.get("geometry_check_passed", True)),
                bev_x=float(bev_x),
                bev_y=float(bev_y),
                bev_bbox=bev_bbox,
                scale_s=s,
                aspect_ratio=aspect_ratio,
                colour_hist=colour_hist,
                image_base_x=bx,
                image_base_y=by,
            )
        )
    return out


def run_clip(
    clip_id: str,
    sidecar_path: Path,
    bev_path: Path,
    detections_path: Path,
    light_condition: str,
    out_path: Path,
    fixed_dt: bool = False,
) -> Dict[str, object]:
    sidecar = load_json(sidecar_path)
    bev = load_json(bev_path)
    det = load_json(detections_path)

    side_frames = sidecar.get("frames", [])
    bev_frames = bev.get("frames", [])
    det_frames = det.get("frames", [])
    if not isinstance(side_frames, list) or not isinstance(bev_frames, list) or not isinstance(det_frames, list):
        raise ValueError(f"Invalid input JSON structure for clip {clip_id}")

    fps_nominal = safe_float(sidecar.get("fps_nominal"), 30.0)
    det_map = {int(f.get("frame_idx", -1)): f for f in det_frames if isinstance(f, dict)}
    bev_map = {int(f.get("frame_idx", -1)): f for f in bev_frames if isinstance(f, dict)}
    pts_map = {int(f.get("frame_idx", -1)): f for f in side_frames if isinstance(f, dict)}
    frame_indices = sorted(set(pts_map.keys()) & set(bev_map.keys()))

    tracker = BeVByteTracker(use_fixed_dt=fixed_dt)
    out_frames: List[Dict[str, object]] = []

    for frame_idx in frame_indices:
        pts = pts_map[frame_idx]
        bev_frame = bev_map[frame_idx]
        det_frame = det_map.get(frame_idx, {"frame_idx": frame_idx, "detections": []})
        dt = safe_float(pts.get("delta_t_s"), 0.0)
        observations = parse_observations(frame_idx=frame_idx, det_frame=det_frame, bev_frame=bev_frame)
        H = np.array(bev_frame.get("homography_H_t", [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]), dtype=np.float64).reshape(3, 3)
        try:
            H_inv = np.linalg.inv(H)
        except np.linalg.LinAlgError:
            H_inv = None
        tracks = tracker.step(
            frame_idx=frame_idx,
            delta_t_s=dt,
            fps_nominal=fps_nominal,
            observations=observations,
            condition_light=light_condition,
            H_inv_for_output=H_inv,
        )
        frame_out_tracks = []
        frame_out_detections = []
        for t in tracks:
            item = {
                "track_id": t.track_id,
                "bev_x": t.bev_x,
                "bev_y": t.bev_y,
                "bev_vx": t.bev_vx,
                "bev_vy": t.bev_vy,
                "innovation_magnitude": t.innovation_magnitude,
                "frames_since_observation": t.frames_since_observation,
                "base_px": t.base_px,
            }
            frame_out_tracks.append(item)
            frame_out_detections.append(
                {
                    "track_id": t.track_id,
                    "base_px": t.base_px,
                    "class_label": "unknown",
                }
            )
        out_frames.append(
            {
                "frame_idx": frame_idx,
                "tracks": frame_out_tracks,
                "detections": frame_out_detections,
            }
        )

    payload = {
        "clip_id": clip_id,
        "tracker_version": "track_d_vfr_bev_v2_1_local",
        "use_fixed_dt": bool(fixed_dt),
        "settings": {
            "high_thresh": tracker.high_thresh,
            "low_thresh": tracker.low_thresh,
            "max_lost": tracker.max_lost,
            "maha_gate": tracker.maha_gate,
            "degraded_r_boost": tracker.degraded_r_boost,
            "condition_light": light_condition,
        },
        "frames": out_frames,
        "diagnostics": {
            **tracker.stats,
            "dt_min": float(min(tracker.dt_used)) if tracker.dt_used else 0.0,
            "dt_max": float(max(tracker.dt_used)) if tracker.dt_used else 0.0,
            "dt_mean": float(np.mean(tracker.dt_used)) if tracker.dt_used else 0.0,
            "dt_std": float(np.std(tracker.dt_used)) if tracker.dt_used else 0.0,
        },
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def summarize_delta_t(sidecar_path: Path) -> Dict[str, float]:
    payload = load_json(sidecar_path)
    frames = payload.get("frames", [])
    dts: List[float] = []
    for fr in frames:
        if not isinstance(fr, dict):
            continue
        dts.append(safe_float(fr.get("delta_t_s"), 0.0))
    arr = np.array(dts, dtype=np.float64) if dts else np.array([0.0], dtype=np.float64)
    unique = int(len(set(round(float(v), 6) for v in arr.tolist())))
    return {
        "count": int(arr.size),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "mean": float(np.mean(arr)),
        "std": float(np.std(arr)),
        "unique_6dp": unique,
        "is_non_uniform": bool(unique > 2),  # includes first-frame 0.0
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run VFR BEV ByteTrack-style tracker for Track D.")
    parser.add_argument("--clips", nargs="+", required=True, help="Clip IDs to process.")
    parser.add_argument(
        "--sidecar-dir",
        type=Path,
        default=Path("../../tracks/A_eval_harness/sidecars"),
        help="Directory with <clip_id>.json sidecar files.",
    )
    parser.add_argument(
        "--bev-dir",
        type=Path,
        default=Path("../../tracks/C_bev_egomotion/outputs"),
        help="Directory with <clip_id>_bev.json files.",
    )
    parser.add_argument(
        "--detections-dir",
        type=Path,
        default=Path("inputs/per_frame_detections"),
        help="Directory with <clip_id>_detections.json files.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("outputs"),
        help="Output directory for <clip_id>_tracks.json",
    )
    parser.add_argument(
        "--eval-split",
        type=Path,
        default=Path("../../tracks/A_eval_harness/eval_split.json"),
        help="Eval split manifest with condition_light values.",
    )
    parser.add_argument(
        "--fixed-dt",
        action="store_true",
        help="Run fixed-dt baseline mode (1/fps_nominal).",
    )
    parser.add_argument(
        "--summary-json",
        type=Path,
        default=Path("reports/vfr_bev_tracker_run_summary.json"),
        help="Summary JSON output path.",
    )
    args = parser.parse_args()

    sidecar_dir = args.sidecar_dir.resolve()
    bev_dir = args.bev_dir.resolve()
    detections_dir = args.detections_dir.resolve()
    out_dir = args.out_dir.resolve()
    eval_split = args.eval_split.resolve()

    light_map = build_light_map(eval_split)
    results: List[Dict[str, object]] = []

    for clip_id in args.clips:
        sidecar_path = find_clip_file(sidecar_dir, clip_id, ".json")
        bev_path = find_clip_file(bev_dir, clip_id, "_bev.json")
        det_path = find_clip_file(detections_dir, clip_id, "_detections.json")
        out_path = out_dir / f"{sanitize_clip_id(clip_id)}_tracks.json"
        payload = run_clip(
            clip_id=clip_id,
            sidecar_path=sidecar_path,
            bev_path=bev_path,
            detections_path=det_path,
            light_condition=light_map.get(clip_id, "normal"),
            out_path=out_path,
            fixed_dt=bool(args.fixed_dt),
        )
        dt_summary = summarize_delta_t(sidecar_path)
        results.append(
            {
                "clip_id": clip_id,
                "sidecar": str(sidecar_path),
                "bev": str(bev_path),
                "detections": str(det_path),
                "output_tracks": str(out_path),
                "fixed_dt": bool(args.fixed_dt),
                "delta_t_summary": dt_summary,
                "tracker_diagnostics": payload.get("diagnostics", {}),
            }
        )
        print(f"[done] {clip_id} -> {out_path}")

    summary = {
        "timestamp": datetime.now().isoformat(),
        "fixed_dt": bool(args.fixed_dt),
        "clips": results,
    }
    summary_path = args.summary_json.resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"[summary] {summary_path}")


if __name__ == "__main__":
    main()
