"""Unit tests for technique_analysis turn segmenter."""

from __future__ import annotations

import sys
from pathlib import Path
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import math
import pytest


def _make_metrics_from_hip_tilt(hip_tilts: list[float], fps: float = 30.0):
    """Build synthetic FrameMetrics list from hip_tilt values."""
    from technique_analysis.common.contracts.models import FrameMetrics

    metrics = []
    for i, tilt in enumerate(hip_tilts):
        metrics.append(FrameMetrics(
            frame_idx=i,
            timestamp_s=i / fps,
            pose_confidence=0.9,  # high confidence so frames are included
            knee_flexion_L=120.0,
            knee_flexion_R=120.0,
            hip_angle_L=None,
            hip_angle_R=None,
            shoulder_tilt=None,
            hip_tilt=tilt,
            knee_flexion_diff=0.0,
            hip_height_diff=0.0,
            stance_width_ratio=1.0,
            upper_body_quietness=None,
            hip_knee_ankle_alignment_L=None,
            hip_knee_ankle_alignment_R=None,
        ))
    return metrics


def test_turn_segmenter_cosine_wave_turn_count():
    """A cosine wave over 5 seconds at 30fps should produce multiple turns."""
    from technique_analysis.common.turns.segmenter import segment_turns

    fps = 30.0
    duration_s = 5.0
    n_frames = int(duration_s * fps)
    # 2 full oscillations = 4 half-cycles (turns)
    n_oscillations = 2
    hip_tilts = [
        5.0 * math.cos(2 * math.pi * n_oscillations * i / n_frames)
        for i in range(n_frames)
    ]
    metrics = _make_metrics_from_hip_tilt(hip_tilts, fps=fps)
    turns = segment_turns(metrics, min_duration_s=0.5, smoothing_window=10)
    # We expect at least 2 turns (conservative: segmenter might merge some)
    assert len(turns) >= 2


def test_turn_segmenter_labels_sides():
    """Turns should be labelled 'left' or 'right'."""
    from technique_analysis.common.turns.segmenter import segment_turns

    fps = 30.0
    n_frames = 180
    hip_tilts = [
        4.0 * math.cos(2 * math.pi * i / n_frames)
        for i in range(n_frames)
    ]
    metrics = _make_metrics_from_hip_tilt(hip_tilts, fps=fps)
    turns = segment_turns(metrics, min_duration_s=0.5, smoothing_window=10)
    for t in turns:
        assert t.side in ("left", "right")


def test_turn_segmenter_filters_short_turns():
    """Very short oscillations below min_duration_s should be filtered out."""
    from technique_analysis.common.turns.segmenter import segment_turns

    fps = 30.0
    # 10 oscillations over 3 seconds → each cycle ~0.3s — below 0.8s threshold
    n_frames = 90
    hip_tilts = [
        3.0 * math.cos(2 * math.pi * 10 * i / n_frames)
        for i in range(n_frames)
    ]
    metrics = _make_metrics_from_hip_tilt(hip_tilts, fps=fps)
    turns = segment_turns(metrics, min_duration_s=0.8, smoothing_window=5)
    # With many short cycles, most/all should be filtered
    assert len(turns) <= 2  # at most a couple might survive boundary effects


def test_turn_segmenter_empty_input():
    """Empty input should return empty list."""
    from technique_analysis.common.turns.segmenter import segment_turns
    assert segment_turns([]) == []


def test_turn_segmenter_confidence_weighted_aggregation():
    """Turns should have None aggregated values when no high-conf frames exist."""
    from technique_analysis.common.contracts.models import FrameMetrics
    from technique_analysis.common.turns.segmenter import segment_turns

    fps = 30.0
    n_frames = 90
    # Low confidence frames mixed with cosine signal
    import math
    metrics = []
    for i in range(n_frames):
        tilt = 5.0 * math.cos(2 * math.pi * 2 * i / n_frames)
        metrics.append(FrameMetrics(
            frame_idx=i,
            timestamp_s=i / fps,
            pose_confidence=0.2,  # below 0.4 threshold — should not contribute to averages
            knee_flexion_L=120.0,
            knee_flexion_R=130.0,
            hip_angle_L=None,
            hip_angle_R=None,
            shoulder_tilt=None,
            hip_tilt=tilt,
            knee_flexion_diff=10.0,
            hip_height_diff=0.01,
            stance_width_ratio=1.2,
            upper_body_quietness=None,
            hip_knee_ankle_alignment_L=None,
            hip_knee_ankle_alignment_R=None,
        ))
    turns = segment_turns(metrics, min_duration_s=0.5, smoothing_window=10)
    # All frames are low-confidence, so n_frames_used should be 0 per turn
    for t in turns:
        assert t.n_frames_used == 0
        assert t.avg_knee_flexion_L is None
