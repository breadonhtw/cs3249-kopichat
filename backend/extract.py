"""Extraction: ask the LLM what the student has said, then keep only what the code can verify."""
import math
import re
from datetime import date

from backend import llm, prompts
from backend.schema import CHECKS, DIMENSIONS

ROUTES = {"continue", "crisis", "out_of_scope_person", "out_of_scope_appeal",
          "meta_why", "meta_anonymous", "stop", "unclear"}
MAX_MESSAGE_CHARS = prompts.MAX_MESSAGE_CHARS

ACK_MAX_CHARS = 140
ACK_BANNED = ["sounds", "sorry", "frustrating", "because"]
MAX_UNCLEAR_OPTIONS = 3
UNCLEAR_OPTION_MAX_CHARS = 40
EXTRACT_MAX_TOKENS = 1000

_ALL_CHECKS = {c for names in CHECKS.values() for c in names}
_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
_MONTH = re.compile(r"\d{4}-(\d{2})")
_WORD = re.compile(r"[a-z]+(?:'[a-z]+)?")
ACK_MIN_WORD_LEN = 4


def normalise(text: str) -> str:
    """Straighten curly quotes, lowercase, and collapse every run of whitespace to one space."""
    text = text.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    return " ".join(text.lower().split())


def _content_words(text: str) -> list[str]:
    """Normalised words of 4+ letters, punctuation stripped."""
    return [w for w in _WORD.findall(normalise(text)) if len(w) >= ACK_MIN_WORD_LEN]


def _grounded(ack: str, transcript_words: set[str]) -> bool:
    """An ack must reuse the student's words: at least half of its distinct content words appear in the
    transcript, so repeating one borrowed word cannot carry invented ones.
    An ack with no content words ("Got it.") says nothing the student did not, so it stays."""
    words = set(_content_words(ack))
    if not words:
        return True
    return sum(w in transcript_words for w in words) >= math.ceil(len(words) / 2)


def _cap(ack: str) -> str:
    """At most ACK_MAX_CHARS, cut at a word boundary. A first word longer than the cap leaves no ack."""
    if len(ack) <= ACK_MAX_CHARS:
        return ack
    head = ack[:ACK_MAX_CHARS + 1]  # the extra character says whether the cut falls inside a word
    match = re.match(r"(.*\S)\s", head, flags=re.DOTALL)
    return match.group(1) if match else ""


def _valid_date(value) -> bool:
    """A real calendar day "YYYY-MM-DD" or a real month "YYYY-MM"."""
    if not isinstance(value, str):
        return False
    if _DAY.fullmatch(value):
        try:
            date.fromisoformat(value)
        except ValueError:
            return False
        return True
    month = _MONTH.fullmatch(value)
    return month is not None and 1 <= int(month.group(1)) <= 12


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
    resolved = {k: v for k, v in dates.items() if k in _ALL_CHECKS and _valid_date(v)}

    ack = raw.get("ack") if isinstance(raw.get("ack"), str) else ""
    ack = ack.strip()
    if any(word in ack.lower() for word in ACK_BANNED):
        ack = ""
    ack = _cap(ack)
    if ack and not _grounded(ack, set(_WORD.findall(haystack))):
        ack = ""  # an ack that does not reuse the student's words is not shown (this also stops injected text)

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
        "feeling": _span(raw.get("feeling"), haystack),
        "ack": ack,
        "route": route,
        "unclear_options": options[:MAX_UNCLEAR_OPTIONS],
    }


def extract_with_raw(transcript: list[str], today: str) -> tuple[dict, dict]:
    """One LLM call over the whole transcript. Returns (validated extraction, raw LLM output).

    Raises llm.LLMError if the call fails."""
    messages = [{"role": "user", "content": prompts.extract_turn(transcript, today)}]
    raw = llm.chat_json(prompts.EXTRACT_SYSTEM, messages, max_tokens=EXTRACT_MAX_TOKENS)
    return validate_extraction(raw, transcript), raw


def extract(transcript: list[str], today: str) -> dict:
    """One LLM call over the whole transcript, validated. Raises llm.LLMError if the call fails."""
    return extract_with_raw(transcript, today)[0]
