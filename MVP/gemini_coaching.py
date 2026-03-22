"""Generate personalised coaching feedback for a single run using Gemini.

Reads the technique-analysis summary JSON, sends it to Gemini with the
available drill library, and returns structured coaching output.

Usage (standalone test):
    python MVP/gemini_coaching.py path/to/summary.json

Requires:
    pip install google-genai          # Gemini SDK
    GEMINI_API_KEY env var
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Drill library — keep in sync with MVP/web/lib/drills.ts
# ---------------------------------------------------------------------------

DRILLS = [
    {"id": "traverse-outside-ski",     "title": "Traverse on outside ski",       "category": "balance"},
    {"id": "equal-rhythm-turns",       "title": "Equal rhythm turns",            "category": "rhythm"},
    {"id": "hockey-stops",             "title": "Hockey stops both sides",       "category": "edging"},
    {"id": "hands-forward-quiet-poles","title": "Hands forward, quiet poles",    "category": "movement"},
    {"id": "inside-ski-lift",          "title": "Lift inside ski in turns",      "category": "balance"},
    {"id": "short-turns-corridor",     "title": "Short turns in a corridor",     "category": "edging"},
    {"id": "no-poles-balance",         "title": "Ski without poles",             "category": "balance"},
    {"id": "side-slip-falling-leaf",   "title": "Side-slip & falling leaf",      "category": "edging"},
    {"id": "hold-finish-pause",        "title": "Pause at turn finish",          "category": "balance"},
]

DRILL_IDS = [d["id"] for d in DRILLS]

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an expert alpine ski coach reviewing a single run analysis produced
by a computer-vision pipeline. The analysis includes per-turn biomechanical
metrics and quality data.

Your job is to write personalised, actionable coaching feedback for this
specific run. Write as a friendly but direct coach speaking to the skier.

IMPORTANT GUIDELINES:
- Base your feedback ONLY on the metrics provided. Do not invent observations
  about things you cannot see (you do not have the video).
- Be specific: reference actual numbers from the data (e.g., "your left-right
  knee asymmetry averaged 18°, aim for under 10°").
- Keep the tone encouraging but honest.
- If the data quality is low (low pose confidence, warnings present), mention
  that some observations may be less reliable.

OUTPUT FORMAT — respond with valid JSON only, no markdown fences:
{
  "coach_summary": "A 2-4 sentence overall assessment of the run.",
  "coaching_points": [
    {
      "title": "Short title (5-8 words)",
      "feedback": "2-3 sentences of specific, actionable coaching.",
      "category": "balance|edging|rhythm|movement",
      "severity": "action|warn|info",
      "recommended_drill_id": "<drill_id from the list below, or null if none fit>"
    }
  ],
  "additional_observations": [
    "Any extra observations that don't map to the drills above (text only)."
  ]
}

Produce 2-4 coaching_points (the most important ones). If an observation fits
one of the available drills, set recommended_drill_id. If none fit, set it to null.

AVAILABLE DRILLS:
"""


def _build_prompt(summary: dict) -> str:
    """Build the full user prompt with the run summary."""
    drill_list = "\n".join(
        f'- id: "{d["id"]}" | title: "{d["title"]}" | category: {d["category"]}'
        for d in DRILLS
    )
    system = SYSTEM_PROMPT + drill_list

    user_msg = json.dumps(summary, indent=2, default=str)
    return system, user_msg


# ---------------------------------------------------------------------------
# Gemini API call
# ---------------------------------------------------------------------------


def generate_coaching(summary: dict, *, api_key: str | None = None) -> dict:
    """Call Gemini to generate coaching feedback for a run summary.

    Returns the parsed JSON response dict, or raises on failure.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    from google import genai

    client = genai.Client(api_key=key)

    system_prompt, user_msg = _build_prompt(summary)

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_msg,
        config={
            "system_instruction": system_prompt,
            "temperature": 0.4,
            "response_mime_type": "application/json",
        },
    )

    text = response.text.strip()

    # Parse — Gemini should return raw JSON
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        # Try stripping markdown fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            result = json.loads(text)
        else:
            raise

    # Validate drill IDs — strip invalid ones
    for point in result.get("coaching_points", []):
        drill_id = point.get("recommended_drill_id")
        if drill_id and drill_id not in DRILL_IDS:
            point["recommended_drill_id"] = None

    return result


# ---------------------------------------------------------------------------
# CLI for testing
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <summary.json>", file=sys.stderr)
        sys.exit(1)

    summary_path = Path(sys.argv[1])
    summary = json.loads(summary_path.read_text())

    result = generate_coaching(summary)
    print(json.dumps(result, indent=2))
