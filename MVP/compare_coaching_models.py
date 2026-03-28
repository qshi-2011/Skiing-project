"""Compare coaching quality between local Ollama models.

Usage:
    python MVP/compare_coaching_models.py [summary.json]

Defaults to the bundled test summary if no path given.
"""

from __future__ import annotations

import json
import sys
import textwrap
import time
import urllib.error
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Prompt (copied from gemini_coaching.py)
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


def _build_messages(summary: dict) -> list[dict]:
    drill_list = "\n".join(
        f'- id: "{d["id"]}" | title: "{d["title"]}" | category: {d["category"]}'
        for d in DRILLS
    )
    system = SYSTEM_PROMPT + drill_list
    user_content = json.dumps(summary, indent=2, default=str)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# Ollama API call
# ---------------------------------------------------------------------------

OLLAMA_URL = "http://localhost:11434/api/chat"


def call_ollama(model: str, messages: list[dict], timeout: int = 120) -> tuple[str, float]:
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.4},
        "format": "json",
    }).encode()

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read())
    except urllib.error.URLError as e:
        raise RuntimeError(f"Ollama unreachable: {e}") from e

    elapsed = time.time() - t0
    text = body["message"]["content"].strip()
    return text, elapsed


# ---------------------------------------------------------------------------
# Parse and validate response
# ---------------------------------------------------------------------------

VALID_DRILL_IDS = {d["id"] for d in DRILLS}


def parse_response(text: str) -> tuple[dict | None, str | None]:
    """Returns (parsed_dict, error_message)."""
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        result = json.loads(text)
    except json.JSONDecodeError as e:
        return None, f"JSON parse error: {e}\nRaw: {text[:300]}"

    # Sanitize drill IDs
    for point in result.get("coaching_points", []):
        drill_id = point.get("recommended_drill_id")
        if drill_id and drill_id not in VALID_DRILL_IDS:
            point["recommended_drill_id"] = None

    return result, None


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

SEV_LABEL = {"action": "ACTION", "warn": "WARN ", "info": "INFO "}
CAT_LABEL = {"balance": "balance", "edging": "edging", "rhythm": "rhythm", "movement": "movement"}

WIDTH = 72


def _wrap(text: str, indent: int = 4) -> str:
    prefix = " " * indent
    return textwrap.fill(text, width=WIDTH, initial_indent=prefix, subsequent_indent=prefix)


def print_result(model: str, result: dict | None, elapsed: float, error: str | None) -> None:
    bar = "=" * WIDTH
    print(f"\n{bar}")
    print(f"  MODEL: {model}  ({elapsed:.1f}s)")
    print(bar)

    if error:
        print(f"  ERROR: {error}")
        return

    print(f"\nSUMMARY\n")
    print(_wrap(result.get("coach_summary", "(none)")))

    points = result.get("coaching_points", [])
    print(f"\nCOACHING POINTS ({len(points)})\n")
    for i, pt in enumerate(points, 1):
        sev = SEV_LABEL.get(pt.get("severity", "info"), "     ")
        cat = CAT_LABEL.get(pt.get("category", ""), pt.get("category", ""))
        drill = pt.get("recommended_drill_id") or "—"
        print(f"  {i}. [{sev}] {pt.get('title', '')}")
        print(f"     category: {cat}  |  drill: {drill}")
        print(_wrap(pt.get("feedback", ""), indent=5))
        print()

    obs = result.get("additional_observations", [])
    if obs:
        print("ADDITIONAL OBSERVATIONS\n")
        for o in obs:
            print(_wrap(f"• {o}", indent=4))
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

MODELS = ["qwen3.5:9b", "qwen3:14b"]

DEFAULT_SUMMARY = (
    Path(__file__).parent.parent
    / "technique-analysis/artifacts/runs/20260322_105817_video/summary/summary.json"
)


def main() -> None:
    summary_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SUMMARY
    if not summary_path.exists():
        print(f"Summary not found: {summary_path}", file=sys.stderr)
        sys.exit(1)

    summary = json.loads(summary_path.read_text())
    messages = _build_messages(summary)

    print(f"Testing with: {summary_path.name}")
    print(f"Turns: {len(summary.get('turns', []))}  |  "
          f"Confidence: {summary.get('quality', {}).get('overall_pose_confidence_mean', 0):.2%}")
    print(f"\nQuerying {len(MODELS)} models...", flush=True)

    results: list[tuple[str, dict | None, float, str | None]] = []
    for model in MODELS:
        print(f"  → {model} ... ", end="", flush=True)
        try:
            raw, elapsed = call_ollama(model, messages)
            parsed, err = parse_response(raw)
        except RuntimeError as e:
            parsed, elapsed, err = None, 0.0, str(e)
        print(f"done ({elapsed:.1f}s)" if not err else f"ERROR")
        results.append((model, parsed, elapsed, err))

    for model, parsed, elapsed, err in results:
        print_result(model, parsed, elapsed, err)

    # Save raw results to a file for closer inspection
    out_path = Path(__file__).parent / "coaching_comparison_results.json"
    saved = {}
    for model, parsed, elapsed, err in results:
        saved[model] = {
            "elapsed_s": round(elapsed, 2),
            "result": parsed,
            "error": err,
        }
    out_path.write_text(json.dumps(saved, indent=2))
    print(f"\nFull results saved to: {out_path}")


if __name__ == "__main__":
    main()
