"""YOLOv8-based person detector with ByteTrack identity locking.

Two-step pipeline:
  1. YOLO detects all persons each frame.
  2. ByteTrack (built into Ultralytics) assigns consistent track IDs across frames.
  3. We lock to the primary skier's track ID at frame 0 and follow it throughout.

Why ByteTrack instead of our own Kalman:
  - ByteTrack uses IoU overlap between predicted and actual bounding boxes,
    not centre-point distance. IoU is robust to fast lateral motion because
    even a quickly-moving box still overlaps its previous position somewhat.
  - Our hand-rolled Kalman used centre-distance matching: at 20 fps a skier
    moving at ~10 m/s laterally can shift 0.10 normalised units between samples,
    making a nearby bystander appear "closer" to the prediction.  ByteTrack
    does not have this failure mode.
"""

from __future__ import annotations

import cv2
import numpy as np

_PERSON_CLASS = 0
_DEFAULT_MODEL = "yolov8n.pt"
_RELOCK_AFTER_LOST = 10

# YOLO always runs at this resolution so ByteTrack coordinates are consistent
# across tracking and analysis frames.  960p is a good balance: fast enough
# for GPU inference, high enough for reliable small-person detection.
_YOLO_RES = 960


def _best_device() -> str:
    """Return 'mps', 'cuda', or 'cpu' depending on what's available."""
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


_DEVICE = _best_device()


def _pad_bbox(
    x1: int, y1: int, x2: int, y2: int,
    pad_frac: float,
    frame_w: int, frame_h: int,
) -> tuple[int, int, int, int]:
    w, h = x2 - x1, y2 - y1
    px, py = int(w * pad_frac), int(h * pad_frac)
    return (
        max(0, x1 - px),
        max(0, y1 - py),
        min(frame_w, x2 + px),
        min(frame_h, y2 + py),
    )


class PersonDetector:
    """YOLOv8 person detector with ByteTrack identity locking.

    Usage:
        for frame in video:
            bbox = detector.detect_primary(frame)   # (x1,y1,x2,y2,conf) or None
            if bbox:
                crop, region = detector.crop(frame, bbox)
    """

    def __init__(
        self,
        model_name: str = _DEFAULT_MODEL,
        conf: float = 0.25,
        pad_frac: float = 0.20,
    ) -> None:
        self._model_name = model_name
        self._conf = conf
        self._pad_frac = pad_frac
        self._model = None
        # ByteTrack state
        self._primary_track_id: int | None = None
        self._last_bbox: tuple[int, int, int, int, float] | None = None
        self._frames_since_locked: int = 0   # frames since we last saw the primary track

    def _ensure_loaded(self) -> None:
        if self._model is None:
            from ultralytics import YOLO
            self._model = YOLO(self._model_name)

    # ------------------------------------------------------------------
    # Primary API
    # ------------------------------------------------------------------

    def detect_primary(
        self, frame_bgr: np.ndarray
    ) -> tuple[int, int, int, int, float] | None:
        """Return (x1,y1,x2,y2,conf) for the primary skier, or None.

        On the first call the largest detected person is chosen and their
        ByteTrack ID is locked.  Subsequent calls follow that track ID.
        If the locked track is temporarily lost, the last known bbox is
        held for up to _RELOCK_AFTER_LOST frames; after that the largest
        visible person is re-locked.
        """
        self._ensure_loaded()

        # Run ByteTrack — persist=True tells Ultralytics to maintain track
        # state between calls so IDs are consistent across frames.
        results = self._model.track(
            frame_bgr,
            persist=True,
            conf=self._conf,
            classes=[_PERSON_CLASS],
            verbose=False,
        )

        detections: list[tuple[int, int, int, int, float, int | None]] = []
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                conf = float(box.conf[0])
                tid = int(box.id[0]) if box.id is not None else None
                detections.append((x1, y1, x2, y2, conf, tid))

        if not detections:
            self._frames_since_locked += 1
            return self._last_bbox[:5] if self._last_bbox and self._frames_since_locked <= _RELOCK_AFTER_LOST else None

        # --- First call: lock to largest person ---
        if self._primary_track_id is None:
            best = max(detections, key=lambda d: (d[2] - d[0]) * (d[3] - d[1]))
            self._primary_track_id = best[5]
            self._last_bbox = best[:5]  # (x1,y1,x2,y2,conf)
            self._frames_since_locked = 0
            return self._last_bbox

        # --- Subsequent calls: follow locked track ---
        locked = [d for d in detections if d[5] == self._primary_track_id]
        if locked:
            self._last_bbox = locked[0][:5]
            self._frames_since_locked = 0
            return self._last_bbox

        # --- Locked track lost ---
        self._frames_since_locked += 1

        if self._frames_since_locked <= _RELOCK_AFTER_LOST:
            # Hold last known bbox for a short window
            return self._last_bbox

        # Re-lock: ByteTrack may have assigned a new ID after the skier
        # was occluded.  Use position proximity to last known bbox to find
        # the most likely candidate and re-lock.
        if self._last_bbox is not None:
            lx1, ly1, lx2, ly2, _ = self._last_bbox
            lcx, lcy = (lx1 + lx2) / 2, (ly1 + ly2) / 2
            best = min(
                detections,
                key=lambda d: ((d[0] + d[2]) / 2 - lcx) ** 2
                              + ((d[1] + d[3]) / 2 - lcy) ** 2,
            )
        else:
            best = max(detections, key=lambda d: (d[2] - d[0]) * (d[3] - d[1]))

        self._primary_track_id = best[5]
        self._last_bbox = best[:5]
        self._frames_since_locked = 0
        return self._last_bbox

    # ------------------------------------------------------------------
    # Legacy detection (used in fallback / tests)
    # ------------------------------------------------------------------

    def detect(
        self, frame_bgr: np.ndarray
    ) -> list[tuple[int, int, int, int, float]]:
        """Return raw list of (x1,y1,x2,y2,conf) — no tracking."""
        self._ensure_loaded()
        results = self._model(
            frame_bgr, conf=self._conf, classes=[_PERSON_CLASS], verbose=False,
        )
        boxes: list[tuple[int, int, int, int, float]] = []
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                boxes.append((x1, y1, x2, y2, float(box.conf[0])))
        return boxes

    # ------------------------------------------------------------------
    # Crop helper
    # ------------------------------------------------------------------

    def crop(
        self,
        frame_bgr: np.ndarray,
        bbox: tuple[int, int, int, int, float],
    ) -> tuple[np.ndarray, tuple[int, int, int, int]]:
        """Crop frame to bbox + padding."""
        h, w = frame_bgr.shape[:2]
        x1, y1, x2, y2, _ = bbox
        cx1, cy1, cx2, cy2 = _pad_bbox(x1, y1, x2, y2, self._pad_frac, w, h)
        return frame_bgr[cy1:cy2, cx1:cx2], (cx1, cy1, cx2, cy2)
