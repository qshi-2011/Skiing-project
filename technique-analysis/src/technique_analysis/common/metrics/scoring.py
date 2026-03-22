"""Per-frame and per-turn technique scoring.

Scoring formulas adapted from Alpine-ski-analyzer (ski_analyzer.py / turn_analyzer.py).
All scores are 0–100 where 100 is ideal.
"""

from __future__ import annotations

import numpy as np

from technique_analysis.common.contracts.models import FrameMetrics, TurnSummary

_CONF_MIN = 0.4   # frames below this are not scored
_IDEAL_KNEE = 120.0  # degrees — optimal knee flexion for dynamic carving


# ---------------------------------------------------------------------------
# Frame-level scoring
# ---------------------------------------------------------------------------

def _movement_quality_label(m: FrameMetrics, score: float) -> str:
    """Categorical quality label matching Alpine-ski-analyzer conventions."""
    # Critical thresholds (order matters — check most severe first)
    if m.com_shift_3d is not None and m.com_shift_3d > 0.25:
        return "Critical - Balance"
    knee = m.knee_angle_3d
    if knee is None:
        if m.knee_flexion_L is not None and m.knee_flexion_R is not None:
            knee = (m.knee_flexion_L + m.knee_flexion_R) / 2
    if knee is not None and (knee < 60 or knee > 165):
        return "Critical - Knee Angle"
    if m.knee_flexion_diff is not None and m.knee_flexion_diff > 30:
        return "Critical - Asymmetric"
    # Score-based thresholds
    if score >= 80:
        return "Excellent"
    if score >= 65:
        return "Good"
    if score >= 50:
        return "Fair"
    # Poor sub-types
    if m.com_shift_3d is not None and m.com_shift_3d > 0.15:
        return "Poor - Balance Issue"
    if m.knee_flexion_diff is not None and m.knee_flexion_diff > 20:
        return "Poor - Unbalanced"
    if m.lean_angle_deg is not None and m.lean_angle_deg > 20:
        return "Poor - Posture"
    return "Poor - Technique"


def compute_frame_score(m: FrameMetrics) -> tuple[float | None, str | None]:
    """Return (overall_score 0–100, movement_quality label) for one frame.

    Returns (None, None) for low-confidence frames.
    """
    if m.pose_confidence < _CONF_MIN:
        return None, None

    scores: dict[str, float] = {}
    weights: dict[str, float] = {}

    # Knee angle (35 %) — prefer 3D
    knee = m.knee_angle_3d
    if knee is None and m.knee_flexion_L is not None and m.knee_flexion_R is not None:
        knee = (m.knee_flexion_L + m.knee_flexion_R) / 2
    if knee is not None:
        scores["knee"] = max(0.0, 100.0 - abs(knee - _IDEAL_KNEE) * 1.0)
        weights["knee"] = 0.35

    # Symmetry (35 %)
    if m.knee_flexion_diff is not None:
        scores["symmetry"] = max(0.0, 100.0 - m.knee_flexion_diff * 2.0)
        weights["symmetry"] = 0.35

    # Balance / CoM control (30 %)
    if m.com_shift_3d is not None:
        if 0.05 <= m.com_shift_3d <= 0.45:
            scores["balance"] = 100.0
        elif m.com_shift_3d < 0.05:
            scores["balance"] = (m.com_shift_3d / 0.05) * 100.0
        else:
            scores["balance"] = max(0.0, 100.0 - (m.com_shift_3d - 0.45) * 200.0)
        weights["balance"] = 0.30

    if not scores:
        return None, None

    total_w = sum(weights.values())
    overall = sum(scores[k] * weights[k] for k in scores) / total_w
    overall = round(overall, 1)
    label = _movement_quality_label(m, overall)
    return overall, label


# ---------------------------------------------------------------------------
# Per-turn quality scoring
# ---------------------------------------------------------------------------

def compute_turn_quality(
    turn: TurnSummary,
    metrics_in_turn: list[FrameMetrics],
) -> tuple[float | None, float | None, float | None]:
    """Return (quality_score, smoothness_score, peak_lateral_shift) for a turn.

    All inputs are high-confidence frames that fall within the turn's time window.

    Scoring uses 3 components (smoothness removed — too noise-sensitive):
      - Knee angle proximity to ideal     (35 %)
      - Left/right knee symmetry           (35 %)
      - Balance — moderate CoM shift       (30 %)
    """
    scores: dict[str, float] = {}
    weights: dict[str, float] = {}

    # 1. Knee angle proximity to ideal (35 %)
    #    _IDEAL_KNEE = 120°.  Penalty: 1.0 pt per degree off (gentler than 1.5).
    #    Acceptable range ~95–145° still scores 75+.
    knee: float | None = None
    if turn.avg_knee_flexion_L is not None and turn.avg_knee_flexion_R is not None:
        knee = (turn.avg_knee_flexion_L + turn.avg_knee_flexion_R) / 2
    if knee is not None:
        scores["knee"] = max(0.0, 100.0 - abs(knee - _IDEAL_KNEE) * 1.0)
        weights["knee"] = 0.35

    # 2. Symmetry (35 %)
    #    Penalty: 2.0 pts per degree of L/R diff (was 4.0).
    #    10° diff → 80/100;  20° diff → 60/100;  >50° → 0.
    if turn.avg_knee_flexion_diff is not None:
        scores["symmetry"] = max(0.0, 100.0 - turn.avg_knee_flexion_diff * 2.0)
        weights["symmetry"] = 0.35

    # 3. Balance — CoM shift should be moderate (30 %)
    #    Sweet spot widened: 0.05–0.45 m (5–45 cm) covers recreational to racing.
    #    Beyond 0.45 m penalty is 200 pts/m (gentler than 500).
    com_vals = [m.com_shift_x for m in metrics_in_turn if m.com_shift_x is not None]
    smoothness_score: float | None = None
    peak_lateral_shift: float | None = None
    if com_vals:
        abs_vals = [abs(v) for v in com_vals]
        peak_lateral_shift = round(float(max(abs_vals)), 4)
        shift = turn.avg_com_shift_3d if turn.avg_com_shift_3d is not None else peak_lateral_shift
        if 0.05 <= shift <= 0.45:
            bal = 100.0
        elif shift < 0.05:
            bal = (shift / 0.05) * 100.0
        else:
            bal = max(0.0, 100.0 - (shift - 0.45) * 200.0)
        scores["balance"] = bal
        weights["balance"] = 0.30

    # Legacy: still compute smoothness for the summary field, but it no longer
    # contributes to quality_score.
    if len(com_vals) >= 4:
        accels = np.diff(np.diff(np.array(com_vals, dtype=float)))
        raw_smooth = float(1.0 / (1.0 + np.std(accels) * 10.0))
        smoothness_score = round(raw_smooth * 100.0, 1)

    if not scores:
        return None, smoothness_score, peak_lateral_shift

    total_w = sum(weights.values())
    quality = sum(scores[k] * weights[k] for k in scores) / total_w
    return round(quality, 1), smoothness_score, peak_lateral_shift
