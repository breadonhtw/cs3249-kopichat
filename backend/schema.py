# backend/schema.py
"""V2 feedback schema: five dimensions, their checks, and the scoring rules."""

DIMENSIONS = ["q1_what", "q2_often", "q3_effect", "q4_basis", "q5_better"]

CHECKS = {
    "q1_what": ["behaviour", "place", "location", "persons", "time", "conditions", "activities"],
    "q2_often": ["number", "timeframe", "context", "own_recurrence", "most_recent"],
    "q3_effect": ["impact_type", "consequence", "degree", "duration", "behaviour_change"],
    "q4_basis": ["experienced", "observed_vantage", "mode_stated", "source_identified", "source_context", "corroboration"],
    "q5_better": ["present", "specific_action", "linked", "actor", "scope", "outcome"],
}

STATES = ["provided", "explicit_none", "not_applicable", "declined", "not_asked"]

Q1_ASK_ORDER = ["place", "time", "persons", "conditions", "location", "activities"]


def _met(checks: dict, name: str) -> bool:
    value = checks.get(name)
    return isinstance(value, str) and value != ""


def _count(checks: dict, names: list[str]) -> int:
    return sum(_met(checks, n) for n in names)


def _score_q1(checks: dict) -> int:
    behaviour = _met(checks, "behaviour")
    others = _count(checks, [c for c in CHECKS["q1_what"] if c != "behaviour"])
    if behaviour and others >= 4:
        return 2
    if not behaviour and others <= 1:
        return 0
    return 1


def _score_q2(checks: dict) -> int:
    met = _count(checks, ["number", "timeframe", "context"])
    if met == 3:
        return 2
    if met == 0:
        return 0
    return 1


def _score_q3(checks: dict) -> int:
    if not _met(checks, "impact_type"):
        return 0
    if _met(checks, "consequence") and _met(checks, "degree"):
        return 2
    return 1


def _score_q4(checks: dict) -> int:
    if _met(checks, "experienced") or _met(checks, "observed_vantage"):
        return 2
    if _met(checks, "mode_stated"):
        return 1
    return 0


def _score_q5(checks: dict) -> int:
    if not _met(checks, "present"):
        return 0
    if (_met(checks, "specific_action") and _met(checks, "linked")
            and _count(checks, ["actor", "scope", "outcome"]) >= 1):
        return 2
    return 1


_SCORERS = {
    "q1_what": _score_q1,
    "q2_often": _score_q2,
    "q3_effect": _score_q3,
    "q4_basis": _score_q4,
    "q5_better": _score_q5,
}


def score(dimension: str, checks: dict) -> int:
    """Return 0, 1 or 2 for one dimension under the V2 tables."""
    return _SCORERS[dimension](checks)


def missing_required(dimension: str, checks: dict) -> list[str]:
    """Unmet required checks for a dimension, in ask priority. Empty once the dimension scores 2."""
    if score(dimension, checks) == 2:
        return []
    if dimension == "q1_what":
        if not _met(checks, "behaviour"):
            return ["behaviour"]
        need = 4 - _count(checks, Q1_ASK_ORDER)
        unmet = [c for c in Q1_ASK_ORDER if not _met(checks, c)]
        return unmet[:max(need, 0)]
    if dimension == "q4_basis":
        # one question template covers experienced, observed and heard
        return [] if _met(checks, "experienced") else ["experienced"]
    if dimension == "q5_better":
        # present gates the rest, as behaviour gates Q1
        if not _met(checks, "present"):
            return ["present"]
        return [c for c in ["specific_action", "linked"] if not _met(checks, c)]
    required = {
        "q2_often": ["number", "timeframe", "context"],
        "q3_effect": ["impact_type", "consequence", "degree"],
    }[dimension]
    return [c for c in required if not _met(checks, c)]


def is_closed(dim_state: dict) -> bool:
    """Settled when the dimension scores 2, or the student ended it (declined, explicit none, not applicable)."""
    if dim_state["score"] == 2:
        return True
    return dim_state["state"] in ("explicit_none", "not_applicable", "declined")


def is_sufficient(state: dict) -> bool:
    """True once Q1 to Q4 are all settled. Q5 does not gate sufficiency."""
    return all(is_closed(state["dims"][d]) for d in DIMENSIONS[:4])


def new_dims() -> dict[str, dict]:
    """Fresh state for every dimension: score 0, not asked, all checks unset."""
    return {
        d: {"score": 0, "state": "not_asked", "checks": {name: None for name in CHECKS[d]}}
        for d in DIMENSIONS
    }
