# backend/policy.py
"""Conversation policy: what to ask next, when to stop, and what the summary shows.

Code owns all of this. The LLM only extracts spans; it never picks the next question,
decides sufficiency, or writes summary text. No LLM calls and no I/O here.
"""
from backend import content, schema

ASK_ORDER = ["q1_what", "q3_effect", "q2_often", "q4_basis", "q5_better"]
MAX_FOLLOWUPS = 5

_ENDED = ("explicit_none", "not_applicable")


def new_state(consultation_id: str) -> dict:
    """Fresh conversation state for one consultation."""
    return {
        "consultation_id": consultation_id,
        "dims": schema.new_dims(),
        "overall": None,
        "phase": "consent",
        "follow_ups_used": 0,
        "last_target": None,
        "pending_question": None,
        "interpretation": {"cause": None, "uncertain": False},
        "resolved_dates": {},
        "edits": {},
        "approved": False,
        "transcript": [],
        "last_action": None,
        "stopped": None,
    }


def _span(value) -> str | None:
    return value if isinstance(value, str) and value != "" else None


def _rescore(dim: str, dim_state: dict) -> None:
    # An ended dimension carries no substantive score: the student said there is nothing to score.
    if dim_state["state"] in _ENDED:
        dim_state["score"] = 0
    else:
        dim_state["score"] = schema.score(dim, dim_state["checks"])


def apply_extraction(state: dict, ex: dict) -> dict:
    """Merge a validated extraction into state. Returns state (mutated)."""
    addressed: set[str] = set()
    for dim, checks in (ex.get("checks") or {}).items():
        if dim not in state["dims"] or not isinstance(checks, dict):
            continue
        stored = state["dims"][dim]["checks"]
        for name, value in checks.items():
            span = _span(value)
            if name in stored and span is not None:
                stored[name] = span  # a non-None span overwrites; None never erases
                addressed.add(dim)

    for dim, dim_state in state["dims"].items():
        any_met = any(_span(v) is not None for v in dim_state["checks"].values())
        if dim in addressed:
            dim_state["state"] = "provided"  # a fresh answer re-opens even a declined dimension
        elif any_met and dim_state["state"] in ("not_asked", "provided"):
            # an ended dimension (explicit_none, not_applicable, declined) stays ended
            # unless this extraction itself carries a span for it (handled above)
            dim_state["state"] = "provided"

    # The LLM may end a dimension only when the student addressed it in this same extraction.
    for key in _ENDED:
        for dim in ex.get(key) or []:
            if dim in addressed:
                state["dims"][dim]["state"] = key

    for dim, dim_state in state["dims"].items():
        _rescore(dim, dim_state)

    interp = ex.get("interpretation") or {}
    if _span(interp.get("cause")) is not None:
        state["interpretation"] = {"cause": interp["cause"], "uncertain": interp.get("uncertain") is True}

    for name, date in (ex.get("resolved_dates") or {}).items():
        if _span(date) is not None:
            state["resolved_dates"][name] = date
    return state


def next_target(state: dict) -> tuple[str, str] | None:
    """The first open dimension and its first missing required check; None when nothing more to ask."""
    if state["follow_ups_used"] >= MAX_FOLLOWUPS:
        return None
    for dim in ASK_ORDER:
        if dim == "q5_better":
            continue
        dim_state = state["dims"][dim]
        if schema.is_closed(dim_state):
            continue
        missing = schema.missing_required(dim, dim_state["checks"])
        if missing:
            return dim, missing[0]
    if schema.is_sufficient(state) and state["dims"]["q5_better"]["state"] == "not_asked":
        return "q5_better", "present"
    return None


def compose_question(target: tuple[str, str], state: dict | None = None) -> str:
    """Fixed question text. The consequence question drops "that morning" when no time is known."""
    if state is not None and target in content.QUESTIONS_GENERIC:
        if _span(state["dims"]["q1_what"]["checks"].get("time")) is None:
            return content.QUESTIONS_GENERIC[target]
    return content.QUESTIONS[target]


def _spans(state: dict, dim: str, names: list[str], dated: tuple[str, ...] = ()) -> list[str]:
    checks = state["dims"][dim]["checks"]
    out = []
    for name in names:
        span = _span(checks.get(name))
        if span is None:
            continue
        date = state["resolved_dates"].get(name) if name in dated else None
        out.append(f"{span} [{date}]" if date else span)
    return out


def _basis(state: dict) -> str:
    checks = state["dims"]["q4_basis"]["checks"]
    parts = []
    if _span(checks.get("experienced")):
        parts.append("Experienced it yourself")
    if _span(checks.get("observed_vantage")):
        parts.append("Saw it yourself")
    if parts:
        return "; ".join(parts)
    return _span(checks.get("mode_stated")) or ""


def _cause(state: dict) -> str:
    interp = state["interpretation"]
    cause = _span(interp.get("cause"))
    if cause is None:
        return ""
    return cause + (" (uncertain)" if interp.get("uncertain") else "")


def _suggestion(state: dict) -> str:
    checks = state["dims"]["q5_better"]["checks"]
    action = _span(checks.get("specific_action"))
    if action:
        return action
    return "; ".join(_spans(state, "q5_better", schema.CHECKS["q5_better"]))


def build_summary(state: dict) -> list[dict]:
    """Nine rows in SUMMARY_FIELDS order. Text is only stored spans, student edits, or fixed labels."""
    q1 = schema.CHECKS["q1_what"]
    texts = {
        "what": "; ".join(_spans(state, "q1_what", q1, dated=("time",))),
        "often": "; ".join(_spans(state, "q2_often", ["number", "timeframe", "context"], dated=("timeframe",))
                           + _spans(state, "q2_often", ["most_recent"], dated=("most_recent",))),
        "effect": "; ".join(_spans(state, "q3_effect", ["impact_type", "consequence", "degree"])),
        "saw": "; ".join(_spans(state, "q1_what", ["persons", "conditions"])
                         + _spans(state, "q4_basis", ["observed_vantage"])),
        "cause": _cause(state),
        "basis": _basis(state),
        "suggestion": _suggestion(state),
        "feeling": _span(state.get("feeling")) or "",
    }
    # Which dimensions decide a row's skipped / explicit_none status. Rows with no dimension have none.
    owners = {"what": ["q1_what"], "often": ["q2_often"], "effect": ["q3_effect"], "saw": ["q1_what", "q4_basis"],
              "basis": ["q4_basis"], "suggestion": ["q5_better"]}

    rows = []
    for key, label in content.SUMMARY_FIELDS:
        if key == "overall":
            overall = _span(state.get("overall"))
            text, status = (overall, "quoted") if overall else ("Skipped", "skipped")
        else:
            text = texts[key]
            dim_states = [state["dims"][d]["state"] for d in owners.get(key, [])]
            if key in state["edits"]:
                text, status = state["edits"][key], "edited"
            elif dim_states and all(s == "declined" for s in dim_states):
                status = "skipped"
            elif dim_states and all(s == "explicit_none" for s in dim_states):
                status = "explicit_none"
            elif text:
                status = "quoted"
            else:
                status = "not_given"
        if key == "overall" and key in state["edits"]:
            text, status = state["edits"][key], "edited"
        rows.append({"key": key, "label": label, "text": text, "status": status})
    return rows
