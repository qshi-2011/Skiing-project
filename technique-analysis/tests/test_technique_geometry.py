"""Unit tests for technique_analysis geometry helpers."""

from __future__ import annotations

import sys
from pathlib import Path
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import math
import pytest


def test_angle_three_points_right_angle():
    from technique_analysis.common.metrics.geometry import angle_three_points
    # L-shape: a=(0,1), b=(0,0), c=(1,0) → 90°
    result = angle_three_points((0.0, 1.0), (0.0, 0.0), (1.0, 0.0))
    assert abs(result - 90.0) < 0.5


def test_angle_three_points_straight_line():
    from technique_analysis.common.metrics.geometry import angle_three_points
    # Straight line: a=(0,0), b=(1,0), c=(2,0) → 180°
    result = angle_three_points((0.0, 0.0), (1.0, 0.0), (2.0, 0.0))
    assert abs(result - 180.0) < 0.5


def test_angle_three_points_45_degrees():
    from technique_analysis.common.metrics.geometry import angle_three_points
    # 45° angle
    result = angle_three_points((1.0, 0.0), (0.0, 0.0), (0.0, 1.0))
    assert abs(result - 90.0) < 0.5  # still 90° for perpendicular


def test_horizontal_tilt_horizontal_line():
    from technique_analysis.common.metrics.geometry import horizontal_tilt_deg
    # Perfectly horizontal → 0°
    result = horizontal_tilt_deg((0.0, 0.5), (1.0, 0.5))
    assert abs(result - 0.0) < 0.5


def test_horizontal_tilt_vertical_line():
    from technique_analysis.common.metrics.geometry import horizontal_tilt_deg
    # Perfectly vertical → 90°
    result = horizontal_tilt_deg((0.5, 0.0), (0.5, 1.0))
    assert abs(result - 90.0) < 0.5


def test_horizontal_tilt_45_degrees():
    from technique_analysis.common.metrics.geometry import horizontal_tilt_deg
    result = horizontal_tilt_deg((0.0, 0.0), (1.0, 1.0))
    assert abs(result - 45.0) < 0.5


def test_stance_width_ratio_equal_width():
    from technique_analysis.common.metrics.geometry import normalized_distance
    # Two pairs of points with same distance should give ratio ~1.0
    ankle_width = normalized_distance((0.3, 0.9), (0.7, 0.9))
    hip_width = normalized_distance((0.3, 0.5), (0.7, 0.5))
    ratio = ankle_width / hip_width
    assert abs(ratio - 1.0) < 0.01


def test_stance_width_ratio_wider_stance():
    from technique_analysis.common.metrics.geometry import normalized_distance
    # Ankles wider than hips → ratio > 1
    ankle_width = normalized_distance((0.2, 0.9), (0.8, 0.9))  # 0.6
    hip_width = normalized_distance((0.35, 0.5), (0.65, 0.5))  # 0.3
    ratio = ankle_width / hip_width
    assert ratio > 1.5


def test_vertical_alignment_score_perfect_stack():
    from technique_analysis.common.metrics.geometry import vertical_alignment_score
    # Perfect vertical stack: all same x → score near 0
    result = vertical_alignment_score((0.5, 0.3), (0.5, 0.6), (0.5, 0.9))
    assert result < 0.1


def test_vertical_alignment_score_full_offset():
    from technique_analysis.common.metrics.geometry import vertical_alignment_score
    # Mid point very far from top-bottom midpoint
    result = vertical_alignment_score((0.0, 0.0), (1.0, 0.5), (0.0, 1.0))
    assert result > 0.5


def test_vertical_alignment_score_bounded():
    from technique_analysis.common.metrics.geometry import vertical_alignment_score
    # Score should always be between 0 and 1
    result = vertical_alignment_score((0.1, 0.0), (0.9, 0.5), (0.1, 1.0))
    assert 0.0 <= result <= 1.0
