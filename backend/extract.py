"""Extraction: ask the LLM what the student has said, then keep only what the code can verify."""
import re

from backend import llm, prompts
from backend.schema import CHECKS, DIMENSIONS

ROUTES = {"continue", "crisis", "out_of_scope_person", "out_of_scope_appeal",
          "meta_why", "meta_anonymous", "stop", "unclear"}
MAX_MESSAGE_CHARS = 600

ACK_MAX_CHARS = 80
ACK_BANNED = ["sounds", "sorry", "frustrating", "because"]
MAX_UNCLEAR_OPTIONS = 3
UNCLEAR_OPTION_MAX_CHARS = 40
EXTRACT_MAX_TOKENS = 1000

_ALL_CHECKS = {c for names in CHECKS.values() for c in names}
_DATE = re.compile(r"\d{4}-\d{2}(-\d{2})?")


def normalise(text: str) -> str:
    """Lowercase and collapse every run of whitespace to one space."""
    return " ".join(text.lower().split())


def _span(value, haystack: str):
    """The span as given if it appears in the student's words, else None."""
    if not isinstance(value, str):
        return None
    needle = normalise(value)
    if needle and needle in haystack:
        return value
    return None


def _dims(value) -> list[str]:
    """Known dimensions only, in schema order, no repeats."""
    if not isinstance(value, list):
        return []
    return [d for d in DIMENSIONS if d in value]


def validate_extraction(raw: dict, transcript: list[str]) -> dict:
    """Reduce an LLM proposal to the fixed extraction shape, dropping whatever cannot be verified."""
    if not isinstance(raw, dict):
        raw = {}
    haystack = normalise(" ".join(transcript))

    raw_checks = raw.get("checks") if isinstance(raw.get("checks"), dict) else {}
    checks = {}
    for dim in DIMENSIONS:
        proposed = raw_checks.get(dim) if isinstance(raw_checks.get(dim), dict) else {}
        checks[dim] = {name: _span(proposed.get(name), haystack) for name in CHECKS[dim]}

    interp = raw.get("interpretation") if isinstance(raw.get("interpretation"), dict) else {}
    cause = _span(interp.get("cause"), haystack)

    dates = raw.get("resolved_dates") if isinstance(raw.get("resolved_dates"), dict) else {}
    resolved = {k: v for k, v in dates.items()
                if k in _ALL_CHECKS and isinstance(v, str) and _DATE.fullmatch(v)}

    ack = raw.get("ack") if isinstance(raw.get("ack"), str) else ""
    ack = ack.strip()
    if any(word in ack.lower() for word in ACK_BANNED):
        ack = ""
    ack = ack[:ACK_MAX_CHARS]

    route = raw.get("route")
    route = route.strip().lower() if isinstance(route, str) else ""
    if route not in ROUTES:
        route = "continue"

    options = raw.get("unclear_options") if isinstance(raw.get("unclear_options"), list) else []
    options = [o.strip()[:UNCLEAR_OPTION_MAX_CHARS] for o in options if isinstance(o, str) and o.strip()]

    return {
        "checks": checks,
        "explicit_none": _dims(raw.get("explicit_none")),
        "not_applicable": _dims(raw.get("not_applicable")),
        "interpretation": {"cause": cause, "uncertain": cause is not None and interp.get("uncertain") is True},
        "resolved_dates": resolved,
        "ack": ack,
        "route": route,
        "unclear_options": options[:MAX_UNCLEAR_OPTIONS],
    }


def extract(transcript: list[str], today: str) -> dict:
    """One LLM call over the whole transcript, validated. Raises llm.LLMError if the call fails."""
    messages = [{"role": "user", "content": prompts.extract_turn(transcript, today)}]
    raw = llm.chat_json(prompts.EXTRACT_SYSTEM, messages, max_tokens=EXTRACT_MAX_TOKENS)
    return validate_extraction(raw, transcript)
