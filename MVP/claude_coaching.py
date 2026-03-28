"""Generate personalised coaching feedback for a single run using Claude.

Reads the technique-analysis summary JSON, sends it to Anthropic's Messages
API with the available drill library, and returns structured coaching output.

Usage (standalone test):
    python MVP/claude_coaching.py path/to/summary.json

Requires:
    pip install requests
    ANTHROPIC_API_KEY env var (or CLAUDE_API_KEY)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().with_name(".env.worker"))

# ---------------------------------------------------------------------------
# Drill library — keep in sync with MVP/web/lib/drills.ts
# ---------------------------------------------------------------------------

DRILLS = [
    {"id": "traverse-outside-ski", "title": "Traverse on outside ski", "category": "balance"},
    {"id": "equal-rhythm-turns", "title": "Equal rhythm turns", "category": "rhythm"},
    {"id": "hockey-stops", "title": "Hockey stops both sides", "category": "edging"},
    {"id": "hands-forward-quiet-poles", "title": "Hands forward, quiet poles", "category": "movement"},
    {"id": "inside-ski-lift", "title": "Lift inside ski in turns", "category": "balance"},
    {"id": "short-turns-corridor", "title": "Short turns in a corridor", "category": "edging"},
    {"id": "no-poles-balance", "title": "Ski without poles", "category": "balance"},
    {"id": "side-slip-falling-leaf", "title": "Side-slip & falling leaf", "category": "edging"},
    {"id": "hold-finish-pause", "title": "Pause at turn finish", "category": "balance"},
]

DRILL_IDS = [d["id"] for d in DRILLS]
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL") or os.environ.get("CLAUDE_MODEL") or "claude-sonnet-4-6"
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

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


def _build_prompt(summary: dict) -> tuple[str, str]:
    """Build the full prompt for the summary."""
    drill_list = "\n".join(
        f'- id: "{d["id"]}" | title: "{d["title"]}" | category: {d["category"]}'
        for d in DRILLS
    )
    system = SYSTEM_PROMPT + drill_list
    user_msg = json.dumps(summary, indent=2, default=str)
    return system, user_msg


def _extract_text(response_json: dict) -> str:
    content = response_json.get("content")
    if not isinstance(content, list):
        raise RuntimeError("Claude response did not include a content array")

    texts = [
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    text = "\n".join(part.strip() for part in texts if part.strip()).strip()
    if not text:
        raise RuntimeError("Claude returned no text content")
    return text


def _parse_json_text(text: str) -> dict:
    raw = text.strip()
    candidates = [raw]

    if raw.startswith("```"):
        stripped = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        candidates.append(stripped)

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(raw[start : end + 1])

    last_error: json.JSONDecodeError | None = None
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc

    raise last_error or json.JSONDecodeError("No JSON object found", raw, 0)


def _sanitize_result(result: dict) -> dict:
    if not isinstance(result, dict):
        raise RuntimeError("Claude coaching payload must be a JSON object")

    result.setdefault("coach_summary", "")
    result.setdefault("coaching_points", [])
    result.setdefault("additional_observations", [])

    if not isinstance(result["coaching_points"], list):
        result["coaching_points"] = []
    if not isinstance(result["additional_observations"], list):
        result["additional_observations"] = []

    for point in result["coaching_points"]:
        if not isinstance(point, dict):
            continue
        drill_id = point.get("recommended_drill_id")
        if drill_id and drill_id not in DRILL_IDS:
            point["recommended_drill_id"] = None

    return result


def generate_coaching(
    summary: dict,
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout: int = 90,
) -> dict:
    """Call Claude to generate coaching feedback for a run summary."""
    key = api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    system_prompt, user_msg = _build_prompt(summary)
    response = requests.post(
        ANTHROPIC_API_URL,
        headers={
            "x-api-key": key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
        json={
            "model": model or DEFAULT_MODEL,
            "max_tokens": 1400,
            "temperature": 0.4,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_msg}],
        },
        timeout=timeout,
    )

    if not response.ok:
        detail = response.text.strip().replace("\n", " ")
        raise RuntimeError(f"Claude API error ({response.status_code}): {detail[:400]}")

    text = _extract_text(response.json())
    return _sanitize_result(_parse_json_text(text))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <summary.json>", file=sys.stderr)
        sys.exit(1)

    summary_path = Path(sys.argv[1])
    summary = json.loads(summary_path.read_text())

    result = generate_coaching(summary)
    print(json.dumps(result, indent=2))
