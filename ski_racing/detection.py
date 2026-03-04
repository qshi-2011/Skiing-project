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
        - Low-confidence fallback on the selected best frame if it still has
          fewer than 2 gates.

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

    def detect_from_consensus(
        self,
        video_path,
        conf=0.25,
        iou=0.45,
        max_frames=300,
        stride=3,
        min_support=3,
        frame_height=None,
    ):
        """
        Build gate seeds by clustering detections across sampled early frames.

        Falls back to detect_from_best_frame when consensus cannot confirm at
        least two gate clusters.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        stride = max(1, int(stride))
        max_frames = max(1, int(max_frames))
        min_support = max(1, int(min_support))

        all_detections = []
        sampled_frames = 0
        frame_idx = 0
        inferred_height = None

        while cap.isOpened() and frame_idx < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % stride != 0:
                frame_idx += 1
                continue
            if inferred_height is None and frame is not None:
                inferred_height = int(frame.shape[0])
            gates = self.detect_in_frame(frame, conf=conf, iou=iou)
            for gate in gates:
                det = dict(gate)
                det["frame_idx"] = int(frame_idx)
                all_detections.append(det)
            sampled_frames += 1
            frame_idx += 1
        cap.release()

        if frame_height is None:
            frame_height = inferred_height
        frame_height = int(frame_height) if frame_height else 720
        cluster_thresh = max(12.0, 0.10 * float(frame_height))

        candidates = sorted(
            all_detections,
            key=lambda d: (
                float(d.get("base_y", 0.0)),
                float(d.get("center_x", 0.0)),
                int(d.get("frame_idx", 0)),
                -float(d.get("confidence", 0.0)),
            ),
        )
        clusters = []

        for det in candidates:
            det_x = float(det.get("center_x", 0.0))
            det_y = float(det.get("base_y", 0.0))
            best_idx = -1
            best_dist = float("inf")
            for idx, cluster in enumerate(clusters):
                cx = float(cluster["center_x_mean"])
                cy = float(cluster["base_y_mean"])
                dist = ((det_x - cx) ** 2 + (det_y - cy) ** 2) ** 0.5
                if dist <= cluster_thresh and dist < best_dist:
                    best_dist = dist
                    best_idx = idx
            if best_idx >= 0:
                cluster = clusters[best_idx]
                cluster["items"].append(det)
                cluster["frame_ids"].add(int(det["frame_idx"]))
                n_items = len(cluster["items"])
                cluster["center_x_mean"] = (
                    (cluster["center_x_mean"] * (n_items - 1) + det_x) / n_items
                )
                cluster["base_y_mean"] = (
                    (cluster["base_y_mean"] * (n_items - 1) + det_y) / n_items
                )
            else:
                clusters.append(
                    {
                        "items": [det],
                        "frame_ids": {int(det["frame_idx"])},
                        "center_x_mean": det_x,
                        "base_y_mean": det_y,
                    }
                )

        confirmed = []
        for cluster in clusters:
            items = cluster["items"]
            support = len(cluster["frame_ids"])
            confs = [float(item.get("confidence", 0.0)) for item in items]
            med_conf = float(np.median(confs)) if confs else 0.0
            if support < min_support or med_conf < float(conf):
                continue

            class_counts = {}
            for item in items:
                cls = int(item.get("class", 0))
                class_counts[cls] = class_counts.get(cls, 0) + 1
            best_class = sorted(class_counts.items(), key=lambda p: (-p[1], p[0]))[0][0]

            name_counts = {}
            for item in items:
                if int(item.get("class", 0)) != best_class:
                    continue
                name = str(item.get("class_name", "gate"))
                name_counts[name] = name_counts.get(name, 0) + 1
            best_name = sorted(name_counts.items(), key=lambda p: (-p[1], p[0]))[0][0]

            confirmed.append(
                {
                    "class": int(best_class),
                    "class_name": best_name,
                    "center_x": float(np.median([float(item.get("center_x", 0.0)) for item in items])),
                    "base_y": float(np.median([float(item.get("base_y", 0.0)) for item in items])),
                    "confidence": med_conf,
                }
            )

        confirmed.sort(key=lambda g: (float(g["base_y"]), float(g["center_x"])))
        print(
            f"         Consensus gate init: {len(confirmed)} confirmed clusters "
            f"from {len(clusters)} raw clusters ({sampled_frames} sampled frames)"
        )

        if len(confirmed) < 2:
            print("         Consensus fallback: using single best frame search")
            return self.detect_from_best_frame(
                video_path,
                conf=conf,
                iou=iou,
                max_frames=max_frames,
                stride=stride,
            )
        return confirmed


class TemporalGateTracker:
    """
    Track gates across frames with temporal consistency.
    Handles the Slalom Problem: gates temporarily disappearing when
    racers hit them (cross-blocking technique).
    """

    def __init__(self, max_missing_frames=10, match_threshold=50.0, ema_alpha=0.4):
        """
        Args:
            max_missing_frames: How many frames a gate can be missing before removal.
            match_threshold: Max pixel distance to consider a detection matching a tracked gate.
            ema_alpha: EMA weight for position updates (0 = frozen, 1 = no smoothing).
                0.4 damps per-frame jitter while still following real camera motion.
        """
        self.gate_memory = {}       # gate_id -> last known position
        self.missing_frames = {}    # gate_id -> frames since last detection
        self.confidence = {}        # gate_id -> current confidence level
        self.max_missing = max_missing_frames
        self.match_threshold = match_threshold
        self.ema_alpha = ema_alpha
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
                # Update with fresh detection, EMA-smoothed to reduce jitter
                det = detected_gates[best_match]
                a = self.ema_alpha
                self.gate_memory[gate_id]["center_x"] = (
                    a * det["center_x"] + (1 - a) * self.gate_memory[gate_id]["center_x"]
                )
                self.gate_memory[gate_id]["base_y"] = (
                    a * det["base_y"] + (1 - a) * self.gate_memory[gate_id]["base_y"]
                )
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


class LiveGateStabilizer:
    """
    Kalman-based stabilizer for live YOLO gate detections.

    Tracks store a constant-velocity state ``[cx, by, vx, vy]`` and are
    predicted on every ``step()`` call, including non-inference frames.
    """

    def __init__(self, match_threshold: float = 80.0, alpha: float = 0.4,
                 max_stale_calls: int = 3, min_hits_to_show: int = 2,
                 show_stale: bool = False, max_shown_stale_calls: int = 0,
                 stale_conf_decay: float = 0.85, spawn_conf: float = 0.35,
                 update_conf_min: float = 0.15, display_conf: float = 0.30,
                 meas_sigma_px: float = 10.0, accel_sigma_px: float = 8.0,
                 maha_threshold: float = 3.0, class_mismatch_cost: float = 0.75):
        """
        Args:
            match_threshold: Hard Euclidean pixel-distance cap for association.
            alpha: EMA weight for confidence only (position uses Kalman filter).
            max_stale_calls: Consecutive inference calls a track can go
                unmatched before removal.
            min_hits_to_show: Track needs this many matched updates before it
                can be shown in output.
            show_stale: Whether unmatched (stale) tracks are allowed in output.
                Legacy compatibility flag.
            max_shown_stale_calls: Maximum stale inference calls still shown.
            stale_conf_decay: Confidence EMA decay applied on inference misses.
            spawn_conf: Minimum confidence required to start a new track.
            update_conf_min: Minimum confidence accepted for matching updates.
            display_conf: Minimum confidence EMA required to show a track.
            meas_sigma_px: Measurement noise sigma for Kalman R.
            accel_sigma_px: Process acceleration sigma for Kalman Q.
            maha_threshold: Mahalanobis distance gate for association.
            class_mismatch_cost: Cost penalty added when classes differ.
        """
        self._tracks: dict = {}
        self._next_id: int = 0
        self._match_threshold = float(match_threshold)
        self._alpha = float(alpha)
        self._max_stale_calls = max(0, int(max_stale_calls))
        self._min_hits_to_show = max(1, int(min_hits_to_show))
        if show_stale:
            # Legacy path: match prior "show stale until dropped" behavior.
            self._max_shown_stale_calls = self._max_stale_calls
        else:
            self._max_shown_stale_calls = max(0, int(max_shown_stale_calls))
        self._stale_conf_decay = max(0.0, float(stale_conf_decay))
        self._spawn_conf = float(spawn_conf)
        self._update_conf_min = float(update_conf_min)
        self._display_conf = float(display_conf)
        self._meas_sigma_px = float(meas_sigma_px)
        self._accel_sigma_px = float(accel_sigma_px)
        self._maha_threshold = float(maha_threshold)
        self._class_mismatch_cost = float(class_mismatch_cost)

        self._H = np.array([[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]], dtype=float)
        self._I = np.eye(4, dtype=float)
        self._R = np.diag([self._meas_sigma_px ** 2, self._meas_sigma_px ** 2]).astype(float)

        self._last_step_frame_idx: int | None = None
        self._update_call_idx: int = 0

    @staticmethod
    def _greedy_assign(cost_triples: list[tuple[float, int, int]]) -> list[tuple[int, int]]:
        matches = []
        used_tracks = set()
        used_dets = set()
        for _cost, track_id, det_i in sorted(cost_triples, key=lambda t: t[0]):
            if track_id in used_tracks or det_i in used_dets:
                continue
            used_tracks.add(track_id)
            used_dets.add(det_i)
            matches.append((track_id, det_i))
        return matches

    def _transition_matrix(self, dt: float) -> np.ndarray:
        return np.array(
            [[1.0, 0.0, dt, 0.0], [0.0, 1.0, 0.0, dt], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]],
            dtype=float,
        )

    def _process_noise(self, dt: float) -> np.ndarray:
        dt2 = dt * dt
        dt3 = dt2 * dt
        dt4 = dt2 * dt2
        axis_q = np.array([[dt4 / 4.0, dt3 / 2.0], [dt3 / 2.0, dt2]], dtype=float)
        axis_q *= self._accel_sigma_px ** 2
        q = np.zeros((4, 4), dtype=float)
        q[np.ix_([0, 2], [0, 2])] = axis_q
        q[np.ix_([1, 3], [1, 3])] = axis_q
        return q

    def _parse_candidates(self, dets: list) -> list[dict]:
        candidates = []
        for det in dets:
            if not isinstance(det, dict):
                continue
            try:
                center_x = float(det["center_x"])
                base_y = float(det["base_y"])
                confidence = float(det["confidence"])
            except (KeyError, TypeError, ValueError):
                continue
            if not np.isfinite(center_x) or not np.isfinite(base_y) or not np.isfinite(confidence):
                continue
            if confidence < self._update_conf_min:
                continue
            try:
                det_class = int(det.get("class", 0))
            except (TypeError, ValueError):
                det_class = 0
            class_name = det.get("class_name", "unknown")
            candidates.append(
                {
                    "det": det,
                    "z": np.array([center_x, base_y], dtype=float),
                    "confidence": confidence,
                    "class": det_class,
                    "class_name": str(class_name if class_name is not None else "unknown"),
                }
            )
        return candidates

    def _drop_stale_tracks(self) -> None:
        stale_ids = [
            track_id
            for track_id, track in self._tracks.items()
            if int(track.get("stale_calls", 0)) > self._max_stale_calls
        ]
        for track_id in stale_ids:
            del self._tracks[track_id]

    def _shown_tracks(self) -> list:
        output = []
        for track in self._tracks.values():
            if int(track.get("hits", 0)) < self._min_hits_to_show:
                continue
            if int(track.get("stale_calls", 0)) > self._max_shown_stale_calls:
                continue
            if float(track.get("confidence_ema", 0.0)) < self._display_conf:
                continue
            output.append({
                "track_id": int(track["track_id"]),
                "center_x": float(track["x"][0]),
                "base_y": float(track["x"][1]),
                "class": int(track.get("class", 0)),
                "class_name": str(track.get("class_name", "unknown")),
                "confidence": float(track.get("confidence_ema", 0.0)),
                "confidence_ema": float(track.get("confidence_ema", 0.0)),
                "hits": int(track.get("hits", 0)),
                "stale_calls": int(track.get("stale_calls", 0)),
            })
        output.sort(key=lambda g: g["base_y"])
        return output

    def step(self, frame_idx: int, dets: list | None) -> list:
        """
        Predict tracks and optionally update with detections.

        Args:
            frame_idx: Monotonic frame/update index for dt computation.
            dets: ``None`` for predict-only frame; ``[]`` for inference miss;
                or a detection list for normal update.

        Returns:
            List of shown gate dicts sorted by ``base_y`` ascending.
        """
        frame_idx = int(frame_idx)
        if self._last_step_frame_idx is None:
            dt = 1.0
        else:
            dt = float(max(1, frame_idx - int(self._last_step_frame_idx)))

        f = self._transition_matrix(dt)
        q = self._process_noise(dt)

        for track in self._tracks.values():
            track["x"] = f @ track["x"]
            track["P"] = f @ track["P"] @ f.T + q

        if dets is None:
            self._last_step_frame_idx = frame_idx
            return self._shown_tracks()

        candidates = self._parse_candidates(dets)
        cost_triples: list[tuple[float, int, int]] = []

        for track_id, track in self._tracks.items():
            x = track["x"]
            p = track["P"]
            hx = self._H @ x
            s = self._H @ p @ self._H.T + self._R
            try:
                s_inv = np.linalg.inv(s)
            except np.linalg.LinAlgError:
                s_inv = np.linalg.pinv(s)

            for det_i, candidate in enumerate(candidates):
                y = candidate["z"] - hx
                px_dist = float(np.linalg.norm(y))
                mahal_sq = float(y.T @ s_inv @ y)
                mahal = float(np.sqrt(max(mahal_sq, 0.0)))
                if mahal > self._maha_threshold or px_dist > self._match_threshold:
                    continue
                class_penalty = (
                    self._class_mismatch_cost
                    if int(track.get("class", 0)) != int(candidate["class"])
                    else 0.0
                )
                cost_triples.append((mahal + class_penalty, int(track_id), int(det_i)))

        matches = self._greedy_assign(cost_triples)
        matched_track_ids = {track_id for track_id, _ in matches}
        matched_det_ids = {det_i for _, det_i in matches}

        for track_id, det_i in matches:
            track = self._tracks[track_id]
            candidate = candidates[det_i]
            z = candidate["z"]
            y = z - (self._H @ track["x"])
            s = self._H @ track["P"] @ self._H.T + self._R
            try:
                s_inv = np.linalg.inv(s)
            except np.linalg.LinAlgError:
                s_inv = np.linalg.pinv(s)
            k = track["P"] @ self._H.T @ s_inv
            track["x"] = track["x"] + (k @ y)
            # Joseph form is more numerically stable; standard form is kept here
            # intentionally for simplicity/size.
            track["P"] = (self._I - (k @ self._H)) @ track["P"]
            track["hits"] = int(track.get("hits", 0)) + 1
            track["stale_calls"] = 0
            track["confidence_ema"] = (
                self._alpha * float(candidate["confidence"])
                + (1.0 - self._alpha) * float(track.get("confidence_ema", candidate["confidence"]))
            )
            track["class"] = int(candidate["class"])
            track["class_name"] = str(candidate["class_name"])

        for track_id, track in self._tracks.items():
            if track_id in matched_track_ids:
                continue
            track["stale_calls"] = int(track.get("stale_calls", 0)) + 1
            track["confidence_ema"] = float(track.get("confidence_ema", 0.0)) * self._stale_conf_decay

        self._drop_stale_tracks()

        init_cov = np.diag([self._meas_sigma_px ** 2, self._meas_sigma_px ** 2, 50.0 ** 2, 50.0 ** 2]).astype(float)
        for det_i, candidate in enumerate(candidates):
            if det_i in matched_det_ids:
                continue
            if float(candidate["confidence"]) < self._spawn_conf:
                continue
            track_id = self._next_id
            self._tracks[track_id] = {
                "track_id": int(track_id),
                "x": np.array([candidate["z"][0], candidate["z"][1], 0.0, 0.0], dtype=float),
                "P": init_cov.copy(),
                "class": int(candidate["class"]),
                "class_name": str(candidate["class_name"]),
                "confidence_ema": float(candidate["confidence"]),
                "hits": 1,
                "stale_calls": 0,
            }
            self._next_id += 1

        self._last_step_frame_idx = frame_idx

        return self._shown_tracks()

    def update(self, dets: list) -> list:
        """
        Legacy wrapper around ``step()``.

        Notes:
            dt is measured in update-call units when this wrapper is used.
            Velocities are therefore "pixels per update call" by design.
        """
        self._update_call_idx += 1
        return self.step(self._update_call_idx, dets)


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


class CourseGateCounter:
    """
    Full-video gate counter that spawns new tracks for unmatched detections.

    Unlike TemporalGateTracker (which only tracks seeded gates), this class
    runs a separate full-video pass and can discover gates that first appear
    mid-video, then merges fragments and deduplicates.
    """

    def __init__(
        self,
        detector,
        conf=0.20,
        iou=0.45,
        stride=2,
        min_hits=3,
        track_missing_max=8,
        match_thresh_ratio=0.06,
        match_thresh_min=24.0,
        fragment_merge_gap_max=45,
        fragment_merge_dist_ratio=0.10,
        dedup_dx_ratio=0.03,
        dedup_dy_ratio=0.05,
        dedup_overlap_thresh=0.50,
    ):
        self.detector = detector
        self.conf = float(conf)
        self.iou = float(iou)
        self.stride = max(1, int(stride))
        self.min_hits = max(1, int(min_hits))
        self.track_missing_max = max(1, int(track_missing_max))
        self.match_thresh_ratio = float(match_thresh_ratio)
        self.match_thresh_min = float(match_thresh_min)
        self.fragment_merge_gap_max = max(1, int(fragment_merge_gap_max))
        self.fragment_merge_dist_ratio = float(fragment_merge_dist_ratio)
        self.dedup_dx_ratio = float(dedup_dx_ratio)
        self.dedup_dy_ratio = float(dedup_dy_ratio)
        self.dedup_overlap_thresh = float(dedup_overlap_thresh)

    def count(self, video_path, frame_width, frame_height):
        """
        Run full-video gate counting pipeline.

        Returns:
            dict with keys: course_gates, course_gates_count, diagnostics
        """
        samples = self._pass_a_sample_detections(video_path)
        match_thresh = max(self.match_thresh_min, self.match_thresh_ratio * frame_width)
        finished_tracks, raw_track_count = self._pass_b_associate(samples, match_thresh)
        filtered = self._pass_c_filter(finished_tracks)
        merged, merged_pairs = self._pass_d_merge_fragments(
            filtered, frame_width, frame_height
        )
        final, dedup_drops = self._pass_e_dedup(merged, frame_width, frame_height)

        course_gates = []
        for s in final:
            course_gates.append({
                "center_x": float(s["center_x"]),
                "base_y": float(s["base_y"]),
                "class": int(s["class"]),
                "class_name": str(s["class_name"]),
                "confidence": float(s["conf_median"]),
                "hits": int(s["hits"]),
                "frame_start": int(s["frame_start"]),
                "frame_end": int(s["frame_end"]),
            })

        return {
            "course_gates": course_gates,
            "course_gates_count": len(course_gates),
            "diagnostics": {
                "raw_tracks": raw_track_count,
                "after_filter": len(filtered),
                "merged_pairs": merged_pairs,
                "dedup_drops": dedup_drops,
                "params_used": {
                    "conf": self.conf,
                    "iou": self.iou,
                    "stride": self.stride,
                    "min_hits": self.min_hits,
                    "track_missing_max": self.track_missing_max,
                    "match_thresh_ratio": self.match_thresh_ratio,
                    "match_thresh_min": self.match_thresh_min,
                    "fragment_merge_gap_max": self.fragment_merge_gap_max,
                    "fragment_merge_dist_ratio": self.fragment_merge_dist_ratio,
                    "dedup_dx_ratio": self.dedup_dx_ratio,
                    "dedup_dy_ratio": self.dedup_dy_ratio,
                    "dedup_overlap_thresh": self.dedup_overlap_thresh,
                },
            },
        }

    def _pass_a_sample_detections(self, video_path):
        """Pass A: Read every stride-th frame and run detection."""
        import cv2
        cap = cv2.VideoCapture(str(video_path))
        samples = []
        frame_idx = 0
        sample_idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % self.stride == 0:
                dets = self.detector.detect_in_frame(frame, conf=self.conf, iou=self.iou)
                samples.append((sample_idx, frame_idx, dets))
                sample_idx += 1
            frame_idx += 1
        cap.release()
        return samples

    def _pass_b_associate(self, samples, match_thresh):
        """
        Pass B: Online association with track spawning.

        Key difference from TemporalGateTracker: unmatched detections spawn
        new tracks.

        Returns:
            (finished_tracks, raw_track_count)
        """
        active_tracks = []
        finished_tracks = []
        next_id = 0

        for sample_idx, frame_idx, dets in samples:
            matched_det_indices = set()

            # Tracks-outer, detections-inner (same order as TemporalGateTracker)
            for track in active_tracks:
                best_det_idx = None
                best_dist = float("inf")
                # Use last known position for matching
                track_cx = track["center_x_list"][-1]
                track_by = track["base_y_list"][-1]
                for i, det in enumerate(dets):
                    if i in matched_det_indices:
                        continue
                    dx = track_cx - det["center_x"]
                    dy = track_by - det["base_y"]
                    dist = (dx * dx + dy * dy) ** 0.5
                    if dist < match_thresh and dist < best_dist:
                        best_dist = dist
                        best_det_idx = i
                if best_det_idx is not None:
                    det = dets[best_det_idx]
                    track["center_x_list"].append(float(det["center_x"]))
                    track["base_y_list"].append(float(det["base_y"]))
                    track["conf_list"].append(float(det["confidence"]))
                    track["class_list"].append(int(det["class"]))
                    track["frame_end"] = frame_idx
                    track["hits"] += 1
                    track["missing_samples"] = 0
                    matched_det_indices.add(best_det_idx)
                else:
                    track["missing_samples"] += 1

            # Drop tracks that exceeded missing limit
            still_active = []
            for track in active_tracks:
                if track["missing_samples"] > self.track_missing_max:
                    finished_tracks.append(track)
                else:
                    still_active.append(track)
            active_tracks = still_active

            # Spawn new tracks for unmatched detections
            for i, det in enumerate(dets):
                if i in matched_det_indices:
                    continue
                if det["confidence"] >= self.conf:
                    active_tracks.append({
                        "track_id": next_id,
                        "center_x_list": [float(det["center_x"])],
                        "base_y_list": [float(det["base_y"])],
                        "conf_list": [float(det["confidence"])],
                        "class_list": [int(det["class"])],
                        "frame_start": frame_idx,
                        "frame_end": frame_idx,
                        "hits": 1,
                        "missing_samples": 0,
                    })
                    next_id += 1

        # Flush remaining active tracks
        finished_tracks.extend(active_tracks)
        return finished_tracks, next_id

    def _pass_c_filter(self, tracks):
        """Pass C: Keep tracks with enough hits and adequate confidence."""
        filtered = []
        for track in tracks:
            if track["hits"] < self.min_hits:
                continue
            conf_median = float(np.median(track["conf_list"]))
            if conf_median < self.conf:
                continue
            # Determine best class by mode
            class_counts = {}
            for c in track["class_list"]:
                class_counts[c] = class_counts.get(c, 0) + 1
            best_class = max(class_counts, key=class_counts.get)
            # Look up class name from detector model
            class_name = self.detector.model.names.get(best_class, "gate")
            filtered.append({
                "track_id": track["track_id"],
                "center_x": float(np.median(track["center_x_list"])),
                "base_y": float(np.median(track["base_y_list"])),
                "conf_median": conf_median,
                "class": int(best_class),
                "class_name": str(class_name),
                "hits": track["hits"],
                "frame_start": track["frame_start"],
                "frame_end": track["frame_end"],
            })
        return filtered

    def _pass_d_merge_fragments(self, summaries, frame_width, frame_height):
        """Pass D: Merge track fragments with time gap and spatial proximity."""
        merged_pairs = 0
        max_dim = max(frame_width, frame_height)
        merge_dist = self.fragment_merge_dist_ratio * max_dim

        changed = True
        while changed:
            changed = False
            summaries = sorted(summaries, key=lambda s: s["frame_start"])
            new_summaries = list(summaries)
            merged_indices = set()
            for i in range(len(summaries)):
                if i in merged_indices:
                    continue
                for j in range(i + 1, len(summaries)):
                    if j in merged_indices:
                        continue
                    si, sj = summaries[i], summaries[j]
                    # Time gap check
                    if si["frame_end"] >= sj["frame_start"]:
                        continue  # overlapping, not a fragment gap
                    gap = sj["frame_start"] - si["frame_end"]
                    if gap > self.fragment_merge_gap_max:
                        continue
                    # Spatial proximity
                    dx = abs(si["center_x"] - sj["center_x"])
                    dy = abs(si["base_y"] - sj["base_y"])
                    dist = (dx * dx + dy * dy) ** 0.5
                    if dist > merge_dist:
                        continue
                    # Same class
                    if si["class"] != sj["class"]:
                        continue
                    # Merge: weighted position by hits
                    total_hits = si["hits"] + sj["hits"]
                    merged = {
                        "track_id": si["track_id"],
                        "center_x": (si["center_x"] * si["hits"] + sj["center_x"] * sj["hits"]) / total_hits,
                        "base_y": (si["base_y"] * si["hits"] + sj["base_y"] * sj["hits"]) / total_hits,
                        "conf_median": (si["conf_median"] * si["hits"] + sj["conf_median"] * sj["hits"]) / total_hits,
                        "class": si["class"],
                        "class_name": si["class_name"],
                        "hits": total_hits,
                        "frame_start": min(si["frame_start"], sj["frame_start"]),
                        "frame_end": max(si["frame_end"], sj["frame_end"]),
                    }
                    # Replace i with merged, mark j
                    idx_i = new_summaries.index(si)
                    new_summaries[idx_i] = merged
                    new_summaries.remove(sj)
                    merged_indices.add(j)
                    merged_pairs += 1
                    changed = True
                    break
                if changed:
                    break
            if changed:
                summaries = new_summaries
        return summaries, merged_pairs

    def _pass_e_dedup(self, summaries, frame_width, frame_height):
        """Pass E: Suppress duplicate tracks with spatial and temporal overlap."""
        dedup_drops = 0
        dx_thresh = self.dedup_dx_ratio * frame_width
        dy_thresh = self.dedup_dy_ratio * frame_height

        changed = True
        while changed:
            changed = False
            for i in range(len(summaries)):
                for j in range(i + 1, len(summaries)):
                    si, sj = summaries[i], summaries[j]
                    if abs(si["center_x"] - sj["center_x"]) > dx_thresh:
                        continue
                    if abs(si["base_y"] - sj["base_y"]) > dy_thresh:
                        continue
                    # Temporal overlap ratio
                    overlap_start = max(si["frame_start"], sj["frame_start"])
                    overlap_end = min(si["frame_end"], sj["frame_end"])
                    overlap = max(0, overlap_end - overlap_start)
                    dur_i = max(1, si["frame_end"] - si["frame_start"])
                    dur_j = max(1, sj["frame_end"] - sj["frame_start"])
                    overlap_ratio = overlap / min(dur_i, dur_j)
                    if overlap_ratio <= self.dedup_overlap_thresh:
                        continue
                    # Drop the one with fewer hits
                    if si["hits"] >= sj["hits"]:
                        summaries.pop(j)
                    else:
                        summaries.pop(i)
                    dedup_drops += 1
                    changed = True
                    break
                if changed:
                    break
        return summaries, dedup_drops
