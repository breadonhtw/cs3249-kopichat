"""One conversation turn. The LLM proposes (extract), this code decides, and nothing the student
sees is written by the LLM except a short acknowledgement."""
from datetime import datetime, timezone

from backend import content, extract, llm, logbook, policy

DEFAULT_CHIPS = ["Skip this question", "Why do you ask?", "Pause"]
OUT_OF_SCOPE_PERSON_CHIPS = ["Continue without the name", "Stop"]
OUT_OF_SCOPE_APPEAL_CHIPS = ["Continue with my general experience", "Stop"]
STOP_CHIPS = ["Delete", "Keep draft"]


def _counter(state: dict) -> str:
    n = state["follow_ups_used"]
    if state["phase"] == "summary":
        return f"Follow-ups used {n} of up to {policy.MAX_FOLLOWUPS}"
    if state["phase"] == "chat" and n == 0:
        return f"Up to {policy.MAX_FOLLOWUPS} follow-ups"
    if state["pending_question"]:
        return f"Follow-up {n} of up to {policy.MAX_FOLLOWUPS}"
    return ""


def _result(state: dict, reply: str, chips: list[str] | None = None, options: list[str] | None = None) -> dict:
    if chips is None:
        chips = list(DEFAULT_CHIPS) if state["pending_question"] else []
    return {"reply": reply, "chips": chips, "options": options or [], "state": state,
            "counter": _counter(state), "phase": state["phase"]}


def _with_pending(state: dict, text: str) -> str:
    pending = state["pending_question"]
    return f"{text} {pending}" if pending else text


def _why(state: dict) -> str:
    dim = state["last_target"]
    why = content.WHY.get(dim) if dim else None
    if why is None:
        return state["pending_question"] or ""
    return _with_pending(state, why)


def _ask_next(state: dict, ack: str = "") -> str:
    """Pick the next question (code decides), count it, and return the reply text."""
    target = policy.next_target(state)
    if target is None:
        state["phase"] = "summary"
        state["pending_question"] = None
        return content.SUFFICIENT_MESSAGE
    question = policy.compose_question(target, state)
    state["last_target"] = target[0]
    state["pending_question"] = question
    state["follow_ups_used"] += 1
    return f"{ack} {question}" if ack else question


def _reset(state: dict) -> dict:
    fresh = policy.new_state(state["consultation_id"])
    fresh["last_options"] = []
    fresh["phase"] = "deleted"
    state.clear()
    state.update(fresh)
    return _result(state, "", chips=[])


def _log(session_id, state, message, action, extraction, reply, error=None) -> None:
    if session_id is None:
        return
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "message": message,
        "transcript": list(state["transcript"]),
        "extraction": extraction,
        "scores": {dim: d["score"] for dim, d in state["dims"].items()},
        "reply": reply,
    }
    if error:
        record["error"] = error
    try:
        logbook.append(session_id, record)
    except OSError:
        pass  # a log that cannot be written must not cost the student their turn


def handle(state: dict, message: str | None, action: str | None, today: str,
           session_id: str | None = None) -> dict:
    state.setdefault("last_options", [])

    # Actions that need no LLM.
    if action == "start_chat":
        state["phase"] = "chat"
        state["pending_question"] = content.OPENING
        state["last_target"] = None
        res = _result(state, content.OPENING)
        _log(session_id, state, message, action, None, res["reply"])
        return res
    if action == "delete":
        res = _reset(state)
        _log(session_id, state, message, action, None, res["reply"])
        return res
    if action in ("why", "anonymous", "stop", "skip"):
        res = _action_reply(state, action)
        _log(session_id, state, message, action, None, res["reply"])
        return res

    if action is not None and action.startswith("option:"):
        message = _chosen_option(state, action)
        if message is None:
            return _result(state, state["pending_question"] or "")
        if message == content.NONE_OF_THESE:
            state["last_options"] = []
            return _result(state, state["pending_question"] or "")
    if message is None or not message.strip():
        return _result(state, state["pending_question"] or "")

    if state["stopped"] == "crisis":
        return _result(state, content.CRISIS_MESSAGE, chips=[])
    if not llm.enabled():
        return _result(state, content.NO_LLM_MESSAGE)

    state["transcript"].append(message)
    try:
        ex = extract.extract(state["transcript"], today)
    except llm.LLMError as e:
        state["transcript"].pop()
        res = _result(state, content.UNAVAILABLE_MESSAGE)
        _log(session_id, state, message, action, None, res["reply"], error=str(e))
        return res

    res = _route(state, ex)
    _log(session_id, state, message, action, ex, res["reply"])
    return res


def _chosen_option(state: dict, action: str) -> str | None:
    options = state.get("last_options") or []
    try:
        return options[int(action.split(":", 1)[1])]
    except (ValueError, IndexError):
        return None


def _action_reply(state: dict, action: str) -> dict:
    if action == "why":
        return _result(state, _why(state))
    if action == "anonymous":
        return _result(state, _with_pending(state, content.ANONYMOUS_MESSAGE))
    if action == "stop":
        return _result(state, content.STOP_MESSAGE, chips=list(STOP_CHIPS))
    # skip: decline the question that was just asked, then move on
    dim = state["last_target"]
    if dim is None:
        return _result(state, state["pending_question"] or "")
    state["dims"][dim]["state"] = "declined"
    return _result(state, _ask_next(state, content.SKIP_ACK))


def _route(state: dict, ex: dict) -> dict:
    route = ex["route"]
    state["last_options"] = []
    if route == "crisis":
        state["stopped"] = "crisis"
        return _result(state, content.CRISIS_MESSAGE, chips=[])
    if route == "out_of_scope_person":
        return _result(state, content.OUT_OF_SCOPE_PERSON, chips=list(OUT_OF_SCOPE_PERSON_CHIPS))
    if route == "out_of_scope_appeal":
        return _result(state, content.OUT_OF_SCOPE_APPEAL, chips=list(OUT_OF_SCOPE_APPEAL_CHIPS))
    if route == "meta_why":
        return _result(state, _why(state))
    if route == "meta_anonymous":
        return _result(state, _with_pending(state, content.ANONYMOUS_MESSAGE))
    if route == "stop":
        return _result(state, content.STOP_MESSAGE, chips=list(STOP_CHIPS))
    if route == "unclear":
        options = ex["unclear_options"]
        if not options:
            return _result(state, state["pending_question"] or "")
        state["last_options"] = options
        return _result(state, f"{content.UNCLEAR_PREFIX}:", chips=[], options=options + [content.NONE_OF_THESE])

    policy.apply_extraction(state, ex)
    return _result(state, _ask_next(state, ex["ack"]))
