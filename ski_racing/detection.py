"""
Gate detection module for ski racing analysis.
Uses YOLOv8 for detecting red and blue gates in race footage.
"""
import cv2
import numpy as np
from ultralytics import YOLO


class GateDetector:
    """
    Detect ski racing gates using a fine-tuned YOLOv8 model.
    """

    def __init__(self, model_path):
        """
        Args:
            model_path: Path to trained YOLOv8 weights (.pt file).
        """
        self.model = YOLO(model_path)

    def detect_in_frame(self, frame, conf=0.25, iou=0.45):
        """
        Detect gates in a single frame.

        Args:
            frame: BGR image (numpy array).
            conf: Minimum confidence threshold (lowered to 0.25 to catch more gates).
            iou: NMS IoU threshold (lowered to 0.45 to reduce duplicate suppression).

        Returns:
            List of gate detections, each with class, center, base, confidence.
        """
        results = self.model(frame, conf=conf, iou=iou, verbose=False)
        gates = []

        for box in results[0].boxes:
            bbox = box.xyxy[0].cpu().numpy()
            gates.append({
                "class": int(box.cls[0]),
                "class_name": self.model.names[int(box.cls[0])],
                "center_x": float((bbox[0] + bbox[2]) / 2),
                "center_y": float((bbox[1] + bbox[3]) / 2),
                "base_y": float(bbox[3]),  # Bottom of bounding box = base of pole
                "bbox": bbox.tolist(),
                "confidence": float(box.conf[0]),
            })

        # Sort gates by Y position (top to bottom = far to near)
        gates.sort(key=lambda g: g["base_y"])
        return gates

    def detect_from_first_frame(self, video_path, conf=0.25, iou=0.45):
        """
        Detect gates from the first frame of a video.
        Best used before the race starts when all gates are fully visible.

        Args:
            video_path: Path to video file.
            conf: Minimum confidence threshold.
            iou: NMS IoU threshold.

        Returns:
            List of gate detections.
        """
        cap = cv2.VideoCapture(video_path)
        ret, frame = cap.read()
        cap.release()

        if not ret:
            raise ValueError(f"Could not read video: {video_path}")

        return self.detect_in_frame(frame, conf=conf, iou=iou)

    def detect_from_best_frame(self, video_path, conf=0.25, iou=0.45, max_frames=300, stride=3):
        """
        Scan early frames and return the frame with the most detected gates.

        Improvements over v1:
        - Wider search window (300 frames instead of 150) to handle videos
          where the skier starts late or camera pans before the race.
        - Smaller stride (3 instead of 5) for denser sampling.
        - Lower default conf/iou to maximise recall.
        - Multi-frame consensus: also tries a lowered conf pass if the best
          result still has fewer than 2 gates.

        Args:
            video_path: Path to video file.
            conf: Confidence threshold.
            iou: NMS IoU threshold.
            max_frames: Max frames to scan from the start.
            stride: Process every Nth frame.

        Returns:
            List of gate detections from the best frame.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        best_gates = []
        best_frame_idx = -1
        best_frame = None
        best_mean_conf = 0.0
        frame_idx = 0
        stride = max(1, int(stride))
        max_frames = max(1, int(max_frames))

        while cap.isOpened() and frame_idx < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % stride != 0:
                frame_idx += 1
                continue

            gates = self.detect_in_frame(frame, conf=conf, iou=iou)
            mean_conf = (
                sum(g["confidence"] for g in gates) / len(gates) if gates else 0.0
            )
            # Primary: more gates wins outright.
            # Tie-break: same count but meaningfully higher mean confidence
            # (+0.02 margin avoids churn between near-identical frames).
            if len(gates) > len(best_gates) or (
                len(gates) == len(best_gates) and mean_conf > best_mean_conf + 0.02
            ):
                best_gates = gates
                best_frame_idx = frame_idx
                best_frame = frame.copy()
                best_mean_conf = mean_conf

            frame_idx += 1

        cap.release()

        if best_frame_idx >= 0:
            print(f"         Best gate frame: {best_frame_idx} with {len(best_gates)} gates")

        # Fallback: if we still found fewer than 2 gates, try an even more
        # aggressive conf on the best frame we found
        if len(best_gates) < 2 and best_frame is not None:
            for fallback_conf in (0.15, 0.10):
                fallback_gates = self.detect_in_frame(best_frame, conf=fallback_conf, iou=0.40)
                if len(fallback_gates) >= len(best_gates):
                    print(f"         Fallback conf={fallback_conf}: found {len(fallback_gates)} gates")
                    best_gates = fallback_gates
                if len(best_gates) >= 2:
                    break

        return best_gates


class TemporalGateTracker:
    """
    Track gates across frames with temporal consistency.
    Handles the Slalom Problem: gates temporarily disappearing when
    racers hit them (cross-blocking technique).
    """

    def __init__(self, max_missing_frames=10, match_threshold=50.0):
        """
        Args:
            max_missing_frames: How many frames a gate can be missing before removal.
            match_threshold: Max pixel distance to consider a detection matching a tracked gate.
        """
        self.gate_memory = {}       # gate_id -> last known position
        self.missing_frames = {}    # gate_id -> frames since last detection
        self.confidence = {}        # gate_id -> current confidence level
        self.max_missing = max_missing_frames
        self.match_threshold = match_threshold
        self.next_id = 0
        self.frame_history = {}     # frame_idx -> {gate_id: (center_x, base_y)} (detected-only)
        self.frame_history_full = {}  # frame_idx -> {gate_id: gate_info} (includes interpolated)

    def initialize(self, gates, frame_idx=0):
        """
        Initialize tracker with gates detected from the first (clean) frame.

        Args:
            gates: List of gate detections from GateDetector.
        """
        for gate in gates:
            self.gate_memory[self.next_id] = {
                "center_x": gate["center_x"],
                "base_y": gate["base_y"],
                "class": gate["class"],
                "class_name": gate.get("class_name", "unknown"),
            }
            self.missing_frames[self.next_id] = 0
            # Initialize with detector confidence if available
            self.confidence[self.next_id] = float(gate.get("confidence", 0.9))
            self.next_id += 1

    def update(self, detected_gates, frame_idx=None):
        """
        Update tracked gates with new detections.
        Handles occlusion gracefully by maintaining last known positions.

        Args:
            detected_gates: List of gate detections from current frame.

        Returns:
            List of all tracked gates (including interpolated missing ones).
        """
        matched_detections = set()
        matched_tracked = set()

        # Match detected gates to tracked gates (nearest neighbor)
        for gate_id, tracked in self.gate_memory.items():
            best_match = None
            best_dist = float("inf")

            for i, det in enumerate(detected_gates):
                if i in matched_detections:
                    continue
                dist = (
                    (tracked["center_x"] - det["center_x"]) ** 2
                    + (tracked["base_y"] - det["base_y"]) ** 2
                ) ** 0.5

                if dist < self.match_threshold and dist < best_dist:
                    best_dist = dist
                    best_match = i

            if best_match is not None:
                # Update with fresh detection
                det = detected_gates[best_match]
                self.gate_memory[gate_id]["center_x"] = det["center_x"]
                self.gate_memory[gate_id]["base_y"] = det["base_y"]
                self.missing_frames[gate_id] = 0
                # Smooth confidence using detector output if available
                det_conf = float(det.get("confidence", self.confidence[gate_id]))
                self.confidence[gate_id] = 0.7 * self.confidence[gate_id] + 0.3 * det_conf
                matched_detections.add(best_match)
                matched_tracked.add(gate_id)
            else:
                # Gate not detected this frame
                self.missing_frames[gate_id] += 1
                # Decay confidence while missing
                self.confidence[gate_id] = max(0.1, self.confidence[gate_id] * 0.98)

        # Remove gates that have been missing too long
        to_remove = [
            gid
            for gid, missed in self.missing_frames.items()
            if missed > self.max_missing
        ]
        for gid in to_remove:
            del self.gate_memory[gid]
            del self.missing_frames[gid]
            del self.confidence[gid]

        # Return all tracked gates with confidence info
        result = []
        for gate_id, pos in self.gate_memory.items():
            result.append({
                "gate_id": gate_id,
                "center_x": pos["center_x"],
                "base_y": pos["base_y"],
                "class": pos["class"],
                "class_name": pos["class_name"],
                "confidence": self.confidence[gate_id],
                "is_interpolated": self.missing_frames[gate_id] > 0,
                "missing_frames": self.missing_frames[gate_id],
            })

        return result

    def update_with_frame_idx(self, detected_gates, frame_idx):
        """
        Update tracked gates and record per-frame positions.

        Args:
            detected_gates: List of gate detections from current frame.
            frame_idx: Current frame index (for history recording).

        Returns:
            List of all tracked gates (same as update()).
        """
        result = self.update(detected_gates, frame_idx=frame_idx)

        # Record current positions of all tracked gates for this frame
        frame_positions = {}
        frame_positions_full = {}
        for gate_id, pos in self.gate_memory.items():
            gate_info = {
                "gate_id": int(gate_id),
                "center_x": float(pos["center_x"]),
                "base_y": float(pos["base_y"]),
                "class": int(pos["class"]),
                "class_name": pos["class_name"],
                "confidence": float(self.confidence[gate_id]),
                "is_interpolated": self.missing_frames.get(gate_id, 0) > 0,
                "missing_frames": int(self.missing_frames.get(gate_id, 0)),
            }
            frame_positions_full[gate_id] = gate_info
            if self.missing_frames.get(gate_id, 0) == 0:
                # Only record gates that were actually detected this frame
                frame_positions[gate_id] = (pos["center_x"], pos["base_y"])
        self.frame_history[frame_idx] = frame_positions
        self.frame_history_full[frame_idx] = frame_positions_full

        return result

    def get_frame_history(self):
        """
        Get per-frame gate positions.

        Returns:
            Dict: {frame_idx: {gate_id: (center_x, base_y)}}
        """
        return self.frame_history

    def get_frame_history_full(self):
        """
        Get per-frame gate positions including interpolated (missing) gates.

        Returns:
            Dict: {frame_idx: {gate_id: gate_info}}
        """
        return self.frame_history_full

    def get_status(self):
        """Get summary of tracking status."""
        total = len(self.gate_memory)
        missing = sum(1 for m in self.missing_frames.values() if m > 0)
        return {
            "total_tracked": total,
            "currently_visible": total - missing,
            "currently_interpolated": missing,
            "avg_confidence": (
                sum(self.confidence.values()) / total if total > 0 else 0
            ),
        }


# ---------------------------------------------------------------------------
# v2.1 additions — ported from Track B reference implementation (Wave 2)
# Manager-applied 2026-02-19 from:
#   tracks/B_model_retraining/reports/proposed_ski_racing_detection_py_changes_20260219.md
# ---------------------------------------------------------------------------

import math as _math
from typing import Dict, Optional, Tuple


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _safe_log(value: float) -> float:
    return float(_math.log(max(value, 1e-9)))


def resolve_gate_base(
    detection: Dict,
    bev_frame: Optional[Dict],
    tau_kp: float = 0.5,
) -> Dict:
    """
    Three-tier gate-base fallback hierarchy (v2.1 spec, Section 4.3).

    Tier 1 — keypoint base confident (kp0_conf >= tau_kp).
    Tier 2 — VP projection through tip keypoint when base is uncertain
              but alpha_t > 0 and tip is confident.
    Tier 3 — bbox bottom-centre (sets is_degraded=True).

    Args:
        detection: dict with keys bbox_xyxy, keypoint_base_px, keypoint_tip_px.
        bev_frame:  one row from per_frame_bev.schema.json (Track C output).
        tau_kp:     keypoint confidence threshold (default 0.5).

    Returns:
        dict with keys: base_px {x_px, y_px}, base_fallback_tier (1/2/3), is_degraded.
    """
    x1, y1, x2, y2 = [float(v) for v in detection["bbox_xyxy"]]
    kp0 = detection.get("keypoint_base_px")
    kp1 = detection.get("keypoint_tip_px")

    kp0_conf = float(kp0["conf"]) if isinstance(kp0, dict) else 0.0
    kp1_conf = float(kp1["conf"]) if isinstance(kp1, dict) else 0.0

    alpha_t, vp_x, vp_y, horizon_y = 0.0, None, None, None
    if isinstance(bev_frame, dict):
        alpha_t = float(bev_frame.get("alpha_t", 0.0) or 0.0)
        vp = bev_frame.get("vp_t") or {}
        if isinstance(vp, dict) and "x_px" in vp and "y_px" in vp:
            vp_x = float(vp["x_px"])
            vp_y = float(vp["y_px"])
        if "horizon_y_px" in bev_frame:
            horizon_y = float(bev_frame["horizon_y_px"])

    # Tier 1
    if kp0_conf >= tau_kp and isinstance(kp0, dict):
        return {
            "base_px": {"x_px": float(kp0["x_px"]), "y_px": float(kp0["y_px"])},
            "base_fallback_tier": 1,
            "is_degraded": False,
        }

    # Tier 2
    if (
        kp0_conf < tau_kp
        and alpha_t > 0.0
        and kp1_conf >= tau_kp
        and isinstance(kp1, dict)
        and vp_x is not None
        and vp_y is not None
        and horizon_y is not None
        and abs(vp_y - float(kp1["y_px"])) > 1e-6
    ):
        kp1_x, kp1_y = float(kp1["x_px"]), float(kp1["y_px"])
        t = (horizon_y - kp1_y) / (vp_y - kp1_y)
        base_x = kp1_x + t * (vp_x - kp1_x)
        return {
            "base_px": {"x_px": float(base_x), "y_px": float(horizon_y)},
            "base_fallback_tier": 2,
            "is_degraded": False,
        }

    # Tier 3
    return {
        "base_px": {"x_px": float((x1 + x2) * 0.5), "y_px": float(y2)},
        "base_fallback_tier": 3,
        "is_degraded": True,
    }


def compute_geometry_check(
    kp0: Optional[Dict],
    kp1: Optional[Dict],
    bev_frame: Optional[Dict],
    tau_kp: float = 0.5,
) -> Tuple[Optional[float], bool]:
    """
    Rolling-shutter geometry check (v2.1 spec).

    Computes pole_vector_angle_deg and checks it against the rolling-shutter
    lean bound from Track C (rolling_shutter_theta_deg + 5° buffer).

    Returns:
        (pole_vector_angle_deg_or_None, geometry_check_passed)
    """
    if not isinstance(kp0, dict) or not isinstance(kp1, dict):
        return None, True  # insufficient keypoints → pass by default
    if float(kp0.get("conf", 0.0)) < tau_kp or float(kp1.get("conf", 0.0)) < tau_kp:
        return None, True

    dx = float(kp1["x_px"]) - float(kp0["x_px"])
    dy = float(kp1["y_px"]) - float(kp0["y_px"])
    angle_deg = float(_math.degrees(_math.atan2(dx, -dy)))

    theta_deg = None
    if isinstance(bev_frame, dict) and "rolling_shutter_theta_deg" in bev_frame:
        theta_deg = float(bev_frame["rolling_shutter_theta_deg"])

    if theta_deg is None:
        return angle_deg, True  # no rolling-shutter data → pass
    return angle_deg, abs(angle_deg) <= (abs(theta_deg) + 5.0)


def emission_log_prob(class_label: str, conf_class: float) -> Dict[str, float]:
    """
    Per-state emission log-probabilities for HMM decoder (Track F).

    Returns dict with log_prob_red, log_prob_blue, log_prob_dnf.
    All values guaranteed <= 0 (log-space probabilities).
    """
    conf = _clamp(float(conf_class), 0.0, 1.0)
    inv = 1.0 - conf + 1e-9
    if class_label == "red":
        log_red, log_blue = _safe_log(conf), _safe_log(inv)
    elif class_label == "blue":
        log_red, log_blue = _safe_log(inv), _safe_log(conf)
    else:
        log_red, log_blue = _safe_log(inv), _safe_log(inv)
    log_dnf = _safe_log(0.05)
    return {
        "log_prob_red":  min(0.0, float(log_red)),
        "log_prob_blue": min(0.0, float(log_blue)),
        "log_prob_dnf":  min(0.0, float(log_dnf)),
    }
