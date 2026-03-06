"""Shared live gate stabilizer presets for demo/eval entry points."""

from __future__ import annotations

from typing import Any

DEFAULT_LIVE_GATE_PRESET = "T1H"

LIVE_GATE_STABILIZER_PRESETS: dict[str, dict[str, Any]] = {
    "T1H": {
        "min_hits_to_show": 1,
        "spawn_conf": 0.30,
        "display_conf": 0.30,
        "stale_conf_decay": 0.95,
        "update_conf_min": 0.15,
        "max_shown_stale_calls": 1,
        "max_stale_calls": 3,
        "match_threshold": 130.0,
        "maha_threshold": 3.0,
        "meas_sigma_px": 10.0,
        "accel_sigma_px": 8.0,
        "alpha": 0.4,
    },
    "B0": {
        "min_hits_to_show": 2,
        "spawn_conf": 0.35,
        "display_conf": 0.30,
        "stale_conf_decay": 0.85,
        "update_conf_min": 0.15,
        "max_shown_stale_calls": 1,
        "max_stale_calls": 3,
        "match_threshold": 130.0,
        "maha_threshold": 3.0,
        "meas_sigma_px": 10.0,
        "accel_sigma_px": 8.0,
        "alpha": 0.4,
    },
}


def get_live_gate_stabilizer_params(preset: str) -> dict[str, Any]:
    """Return a copy of stabilizer params for a known preset name."""
    key = str(preset).strip().upper()
    if key not in LIVE_GATE_STABILIZER_PRESETS:
        allowed = ", ".join(sorted(LIVE_GATE_STABILIZER_PRESETS.keys()))
        raise ValueError(f"Unknown live gate preset '{preset}'. Expected one of: {allowed}")
    return dict(LIVE_GATE_STABILIZER_PRESETS[key])
