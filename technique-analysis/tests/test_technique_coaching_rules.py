"""Unit tests for technique_analysis coaching rules."""

from __future__ import annotations

import sys
from pathlib import Path
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import pytest


def _make_quality(low_conf_frac: float = 0.1):
    from technique_analysis.common.contracts.models import QualityReport
    return QualityReport(
        overall_pose_confidence_mean=0.85,
        overall_pose_confidence_min=0.4,
        low_confidence_fraction=low_conf_frac,
        viewpoint_warning=None,
        jitter_score_mean=0.01,
        warnings=[],
    )


def _make_metrics(
    knee_diff: float = 5.0,
    shoulder_tilt: float = 3.0,
    stance_width: float = 1.2,
    n: int = 30,
):
    from technique_analysis.common.contracts.models import FrameMetrics
    metrics = []
    for i in range(n):
        metrics.append(FrameMetrics(
            frame_idx=i,
            timestamp_s=i / 30.0,
            pose_confidence=0.9,
            knee_flexion_L=120.0,
            knee_flexion_R=120.0 + knee_diff,
            hip_angle_L=None,
            hip_angle_R=None,
            shoulder_tilt=shoulder_tilt,
            hip_tilt=2.0,
            knee_flexion_diff=knee_diff,
            hip_height_diff=0.01,
            stance_width_ratio=stance_width,
            upper_body_quietness=None,
            hip_knee_ankle_alignment_L=0.1,
            hip_knee_ankle_alignment_R=0.1,
        ))
    return metrics


def test_large_knee_diff_triggers_action_tip():
    """knee_flexion_diff > 15° should produce an 'action' severity tip."""
    from technique_analysis.common.coaching.rules import generate_coaching_tips

    metrics = _make_metrics(knee_diff=25.0)
    tips = generate_coaching_tips(metrics, [], _make_quality())
    action_tips = [t for t in tips if t.severity == "action"]
    assert len(action_tips) >= 1
    titles = [t.title.lower() for t in action_tips]
    assert any("knee" in title or "flexion" in title for title in titles)


def test_low_confidence_fraction_triggers_camera_tip():
    """low_confidence_fraction > 0.30 should produce a camera framing tip."""
    from technique_analysis.common.coaching.rules import generate_coaching_tips

    metrics = _make_metrics(knee_diff=5.0)
    tips = generate_coaching_tips(metrics, [], _make_quality(low_conf_frac=0.5))
    info_tips = [t for t in tips if t.severity == "info"]
    assert len(info_tips) >= 1
    assert any("camera" in t.title.lower() or "confidence" in t.title.lower() for t in info_tips)


def test_good_metrics_no_action_tips():
    """Good metrics should not produce any action-severity tips."""
    from technique_analysis.common.coaching.rules import generate_coaching_tips

    metrics = _make_metrics(knee_diff=4.0, shoulder_tilt=3.0, stance_width=1.2)
    tips = generate_coaching_tips(metrics, [], _make_quality(low_conf_frac=0.05))
    action_tips = [t for t in tips if t.severity == "action"]
    assert len(action_tips) == 0


def test_tips_sorted_by_severity():
    """Tips should be sorted action > warn > info."""
    from technique_analysis.common.coaching.rules import generate_coaching_tips

    # Mix of issues
    metrics = _make_metrics(knee_diff=25.0, shoulder_tilt=15.0)
    tips = generate_coaching_tips(metrics, [], _make_quality(low_conf_frac=0.4))
    severity_order = {"action": 0, "warn": 1, "info": 2}
    for i in range(len(tips) - 1):
        assert severity_order[tips[i].severity] <= severity_order[tips[i + 1].severity]


def test_narrow_stance_triggers_warn():
    """Stance width < 0.8 should trigger a warn-severity tip."""
    from technique_analysis.common.coaching.rules import generate_coaching_tips

    metrics = _make_metrics(stance_width=0.5)
    tips = generate_coaching_tips(metrics, [], _make_quality())
    warn_tips = [t for t in tips if t.severity == "warn"]
    assert any("stance" in t.title.lower() for t in warn_tips)


def test_empty_metrics_returns_list():
    """Empty metrics should return a list (possibly empty or just camera tip)."""
    from technique_analysis.common.coaching.rules import generate_coaching_tips
    tips = generate_coaching_tips([], [], _make_quality())
    assert isinstance(tips, list)
