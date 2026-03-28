"""Generate personalised coaching feedback for a single run using LM Studio.

Reads the technique-analysis summary JSON, sends it to LM Studio's local
OpenAI-compatible chat completions endpoint, and returns structured coaching
output.

Usage (standalone test):
    python MVP/lmstudio_coaching.py path/to/summary.json

Requires:
    pip install requests
    LM Studio server running locally
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
DEFAULT_BASE_URL = "http://localhost:1234"

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
  knee asymmetry averaged 18 degrees, aim for under 10 degrees").
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


def _normalize_language(language: str | None) -> str:
    value = (language or "en").strip().lower()
    if value.startswith("zh"):
        return "zh"
    return "en"


def _language_instruction(language: str) -> str:
    if language == "zh":
        return """

LANGUAGE REQUIREMENT:
- Write every natural-language value in Simplified Chinese.
- Keep the JSON keys in English exactly as specified.
- Keep enum values for category, severity, and recommended_drill_id exactly in English.
"""

    return """

LANGUAGE REQUIREMENT:
- Write every natural-language value in English.
- Keep the JSON keys, enum values, and recommended_drill_id exactly as specified.
"""


def _build_messages(summary: dict, language: str = "en") -> list[dict]:
    drill_list = "\n".join(
        f'- id: "{d["id"]}" | title: "{d["title"]}" | category: {d["category"]}'
        for d in DRILLS
    )
    system = SYSTEM_PROMPT + drill_list + _language_instruction(_normalize_language(language))
    user_msg = json.dumps(summary, indent=2, default=str)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_msg},
    ]


def _coaching_schema() -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "ski_coaching_response",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "coach_summary": {"type": "string"},
                    "coaching_points": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "feedback": {"type": "string"},
                                "category": {
                                    "type": "string",
                                    "enum": ["balance", "edging", "rhythm", "movement"],
                                },
                                "severity": {
                                    "type": "string",
                                    "enum": ["action", "warn", "info"],
                                },
                                "recommended_drill_id": {
                                    "anyOf": [
                                        {"type": "string", "enum": DRILL_IDS},
                                        {"type": "null"},
                                    ]
                                },
                            },
                            "required": [
                                "title",
                                "feedback",
                                "category",
                                "severity",
                                "recommended_drill_id",
                            ],
                            "additionalProperties": False,
                        },
                    },
                    "additional_observations": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": [
                    "coach_summary",
                    "coaching_points",
                    "additional_observations",
                ],
                "additionalProperties": False,
            },
        },
    }


def _normalize_base_url(base_url: str | None) -> str:
    raw = (base_url or os.environ.get("LMSTUDIO_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    if raw.endswith("/v1"):
        return raw
    return f"{raw}/v1"


def _headers(api_key: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    key = api_key or os.environ.get("LMSTUDIO_API_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _resolve_model(base_url: str, headers: dict[str, str], model: str | None) -> str:
    configured = model or os.environ.get("LMSTUDIO_MODEL")
    if configured:
        return configured

    response = requests.get(f"{base_url}/models", headers=headers, timeout=15)
    if not response.ok:
        detail = response.text.strip().replace("\n", " ")
        raise RuntimeError(f"LM Studio model lookup failed ({response.status_code}): {detail[:400]}")

    data = response.json().get("data")
    if not isinstance(data, list) or not data:
        raise RuntimeError(
            "LM Studio returned no models. Load a model in LM Studio or set LMSTUDIO_MODEL explicitly."
        )

    first_id = data[0].get("id")
    if not first_id:
        raise RuntimeError("LM Studio /v1/models response did not include a usable model id")
    return str(first_id)


def _extract_text(response_json: dict) -> str:
    choices = response_json.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("LM Studio response did not include choices")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise RuntimeError("LM Studio response did not include a message object")

    content = message.get("content", "")
    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, list):
        texts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        ]
        text = "\n".join(part.strip() for part in texts if part.strip()).strip()
    else:
        text = ""

    if not text:
        raise RuntimeError("LM Studio returned no text content")
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
        raise RuntimeError("LM Studio coaching payload must be a JSON object")

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
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    language: str = "en",
    timeout: int = 120,
) -> dict:
    """Call LM Studio to generate coaching feedback for a run summary."""
    normalized_base_url = _normalize_base_url(base_url)
    headers = _headers(api_key)
    resolved_model = _resolve_model(normalized_base_url, headers, model)
    messages = _build_messages(summary, language=language)

    response = requests.post(
        f"{normalized_base_url}/chat/completions",
        headers=headers,
        json={
            "model": resolved_model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 1400,
            "stream": False,
            "response_format": _coaching_schema(),
        },
        timeout=timeout,
    )

    if not response.ok:
        detail = response.text.strip().replace("\n", " ")
        raise RuntimeError(f"LM Studio API error ({response.status_code}): {detail[:400]}")

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
