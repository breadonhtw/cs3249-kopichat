"""HTTP surface for the student journey. Sessions live in memory, keyed by a client UUID.

Mapping and sequencing only: the conversation lives in orchestrator/policy, storage in store,
numbers in aggregate. Nothing is stored until /api/submit is called with approved == true.
"""
import datetime
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import aggregate, content, llm, orchestrator, policy, store, strip

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"


def default_db_path() -> str:
    """KOPICHAT_DB if set, else backend/kopichat.db under the repo root (never relative to the cwd)."""
    return os.environ.get("KOPICHAT_DB") or str(REPO_ROOT / "backend" / "kopichat.db")


Path(default_db_path()).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
STORE = store.Store(default_db_path())
STORE.init()
SESSIONS: dict[str, dict] = {}

# Chip labels sent as an action, mapped to orchestrator actions before handle() runs. Typed text is
# always a message, even when it reads like a chip label.
CHIP_ACTIONS = {
    "Skip this question": "skip",
    "Why do you ask?": "why",
    "Is this anonymous?": "anonymous",
    "Stop and delete": "stop",
    "Stop": "stop",
    "Delete": "delete",
    "Check my summary": "finish",
}
app = FastAPI(title="Kopichat")


class SessionBody(BaseModel):
    session_id: str


class OpenBody(SessionBody):
    topic: str | None = None        # which consultation the link opens (?topic=study); the default one when empty
    participant: str | None = None  # a study code such as P03 (?p=P03); never a name, never shown to the student


class ConsentBody(SessionBody):
    agreed: Any = None


class OverallBody(SessionBody):
    value: str | None = None


class TurnBody(SessionBody):
    message: str | None = None
    action: str | None = None
    answers: dict[str, Any] | None = None  # the written fallback's answers, by dimension


class SubmitBody(SessionBody):
    approved: Any = None
    visibility: str | None = None  # "nussu" or "board"; the student's choice on the summary


class FormSubmitBody(SessionBody):
    confirmed: Any = None
    overall: str | None = None
    answers: dict[str, Any] | None = None  # by dimension, as typed; an empty or missing answer is a skipped question
    edited: list[str] | None = None        # dimensions changed on the review page


class SummaryEdit(BaseModel):
    key: str
    text: str


class ContactBody(SessionBody):
    contact: str


def _session(session_id: str) -> dict:
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown session.")
    return session


def _participant(value: str | None) -> str | None:
    """A study code from the link, cut to something safe to store: letters, digits, dash and underscore."""
    code = "".join(ch for ch in (value or "") if ch.isalnum() or ch in "-_")[:24]
    return code or None


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def study_mode() -> bool:
    """KOPICHAT_STUDY=1 while the user study runs: the reset endpoint is refused, so no session can wipe the data."""
    return os.environ.get("KOPICHAT_STUDY", "").strip().lower() in ("1", "true", "yes", "on")


def _today() -> str:
    return datetime.date.today().isoformat()


def _account_id(session_id: str) -> str:
    """The account of this session, from the server's own record. Never from the client."""
    account_id = _session(session_id)["account_id"]
    if account_id is None:
        raise HTTPException(status_code=404, detail="Nothing has been submitted for this session.")
    return account_id


def _sent(account: dict) -> dict:
    """What the student's screen needs to show an account already sent: the receipt, settled."""
    return {"account": {"id": account["id"], "ref_code": account["ref_code"]},
            "aggregate": aggregate.build(STORE, account["id"]), "summary_rows": account["fields"]}


@app.post("/api/session")
def create_session(body: OpenBody):
    session = SESSIONS.get(body.session_id)
    if session is None:
        # After a backend restart the session is gone from memory, but its account may be stored.
        # Then the student is back at their receipt, never at a fresh journey that would resubmit it.
        account = STORE.account_for_session(body.session_id)
        consultation_id = account["consultation_id"] if account else content.consultation_for_topic(body.topic)["id"]
        state = policy.new_state(consultation_id)
        # The clock for "time from opening to confirmed submission" starts when the link is first opened.
        state.update(opened_at=_now(), participant=_participant(body.participant))
        if account is not None:
            state.update(phase="deleted" if account["withdrawn"] else "receipt", approved=True,
                         overall=account["overall"], visibility=account["visibility"])
        session = SESSIONS[body.session_id] = {"state": state, "account_id": account["id"] if account else None}
    out = {"consultation": content.consultation(session["state"]["consultation_id"]), "state": session["state"],
           "llm": llm.describe()}
    if session["account_id"] is not None:
        out.update(_sent(STORE.get(session["account_id"])))
    return out


@app.post("/api/consent")
def consent(body: ConsentBody):
    state = _session(body.session_id)["state"]
    if body.agreed is not True:
        raise HTTPException(status_code=400, detail="Agreement is required to continue.")
    if state["phase"] == "consent":
        state["phase"] = "overall"
    return {"phase": state["phase"], "state": state}


ALREADY_SENT = "This account has already been sent."


@app.post("/api/overall")
def overall(body: OverallBody):
    session = _session(body.session_id)
    state = session["state"]
    if session["account_id"] is not None:
        raise HTTPException(status_code=409, detail=ALREADY_SENT)
    if state["phase"] == "consent":
        raise HTTPException(status_code=409, detail="Agree to continue first.")
    if body.value is not None and body.value not in content.consultation(state["consultation_id"])["overall_options"]:
        raise HTTPException(status_code=400, detail="Unknown overall view.")
    state["overall"] = body.value
    return orchestrator.handle(state, None, "start_chat", _today(), session_id=body.session_id)


@app.post("/api/turn")
def turn(body: TurnBody):
    state = _session(body.session_id)["state"]
    message, action = body.message, body.action
    if action == "start_chat":
        raise HTTPException(status_code=409, detail="The chat starts through /api/overall.")
    action = CHIP_ACTIONS.get(action, action)
    return orchestrator.handle(state, message, action, _today(), session_id=body.session_id, answers=body.answers)


@app.get("/api/summary/{session_id}")
def get_summary(session_id: str):
    state = _session(session_id)["state"]
    return {"rows": policy.build_summary(state), "approved": state["approved"]}


@app.patch("/api/summary/{session_id}")
def edit_summary(session_id: str, body: SummaryEdit):
    state = _session(session_id)["state"]
    if body.key not in dict(content.SUMMARY_FIELDS):
        raise HTTPException(status_code=400, detail="Unknown summary field.")
    state["edits"][body.key] = body.text.strip()
    return {"rows": policy.build_summary(state)}


@app.post("/api/submit")
def submit(body: SubmitBody):
    session = _session(body.session_id)
    if body.approved is not True:
        raise HTTPException(status_code=400, detail="Approval is required before anything is stored.")
    if session["account_id"] is not None:
        raise HTTPException(status_code=409, detail=ALREADY_SENT)
    state = session["state"]
    if state["phase"] != "summary":
        raise HTTPException(status_code=409, detail="Nothing to submit yet.")
    if body.visibility is not None:
        if body.visibility not in content.VISIBILITY:
            raise HTTPException(status_code=400, detail="Unknown visibility.")
        state["visibility"] = body.visibility
    state["approved"] = True
    account = STORE.submit(body.session_id, state, policy.build_summary(state))
    if not account["theme"]:
        names = list(STORE.counts(account["consultation_id"])["by_group"].keys())
        cls = aggregate.classify(account, names)
        group = cls["group"]
        new_group = bool(group) and group.startswith(aggregate.NEW_GROUP_PREFIX)
        if new_group:
            group = group[len(aggregate.NEW_GROUP_PREFIX):].strip()
        STORE.assign(account["id"], cls["theme"], group, cls["needs_review"], new_group=new_group)
        account = STORE.get(account["id"])
    session["account_id"] = account["id"]
    state["phase"] = "receipt"
    return {"account": {"id": account["id"], "ref_code": account["ref_code"]},
            "aggregate": aggregate.build(STORE, account["id"])}


@app.post("/api/withdraw")
def withdraw(body: SessionBody):
    account_id = _account_id(body.session_id)
    STORE.withdraw(account_id)
    STORE.clear_contact(account_id)
    _session(body.session_id)["state"]["phase"] = "deleted"  # a reload shows the withdrawal, not "Received"
    return {"ok": True}


@app.post("/api/contact")
def contact(body: ContactBody):
    account_id = _account_id(body.session_id)
    text = body.contact.strip()
    if not text:
        # an empty contact takes the update request back
        STORE.clear_contact(account_id)
        return {"ok": True}
    if STORE.get(account_id)["withdrawn"]:
        raise HTTPException(status_code=409, detail="This account has been withdrawn.")
    STORE.set_contact(account_id, text)
    return {"ok": True}


@app.post("/api/admin/reset")
def admin_reset():
    if study_mode():
        raise HTTPException(status_code=403, detail="Reset is switched off while the study runs (KOPICHAT_STUDY).")
    STORE.reset()
    SESSIONS.clear()
    return {"ok": True}


# The matched form: the user study's comparison condition. Same consultation, notice and five questions as the chat,
# as fixed fields with no follow-ups and no model. Nothing is stored until /api/form/submit is called with
# confirmed == true; before that the server holds only when the link was opened.
def _form_fields() -> list[dict]:
    return [{"dim": dim, "key": key, "label": label, "hint": hint} for dim, key, label, hint in content.FORM_FIELDS]


def _form_rows(overall: str | None, answers: dict, edited: list[str]) -> list[dict]:
    """The submission as rows, labelled like the chat's summary so both read the same when exported."""
    labels = dict(content.SUMMARY_FIELDS)
    rows = [{"key": "overall", "label": labels["overall"], "text": overall or "Skipped",
             "status": "quoted" if overall else "skipped"}]
    for dim, key, _label, _hint in content.FORM_FIELDS:
        text = answers.get(dim)
        text = text.strip() if isinstance(text, str) else ""
        status = "skipped" if not text else "edited" if dim in edited else "quoted"
        rows.append({"key": key, "label": labels[key], "text": text, "status": status})
    return rows


def _form_sent(sub: dict) -> dict:
    return {"ref_code": sub["ref_code"], "rows": sub["fields"], "withdrawn": sub["withdrawn"]}


@app.post("/api/form/open")
def form_open(body: OpenBody):
    sub = STORE.form_for_session(body.session_id)
    if sub is None:
        opened = STORE.form_open(body.session_id, content.consultation_for_topic(body.topic)["id"],
                                 _participant(body.participant))
        consultation_id = opened["consultation_id"]
    else:
        consultation_id = sub["consultation_id"]
    out = {"consultation": content.consultation(consultation_id), "fields": _form_fields()}
    if sub is not None:
        out["submission"] = _form_sent(sub)
    return out


@app.post("/api/form/submit")
def form_submit(body: FormSubmitBody):
    if body.confirmed is not True:
        raise HTTPException(status_code=400, detail="Confirmation is required before anything is stored.")
    if STORE.form_for_session(body.session_id) is not None:
        raise HTTPException(status_code=409, detail="This form has already been sent.")
    if body.overall is not None and body.overall not in content.OVERALL_OPTIONS:
        raise HTTPException(status_code=400, detail="Unknown overall view.")
    answers = body.answers or {}
    rows = _form_rows(body.overall, answers, body.edited or [])
    if not any(r["key"] != "overall" and r["text"] for r in rows):
        raise HTTPException(status_code=400, detail="Answer at least one question before sending.")
    try:
        sub = STORE.form_submit(body.session_id, body.overall, rows)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown session.") from None
    return _form_sent(sub)


@app.post("/api/form/withdraw")
def form_withdraw(body: SessionBody):
    try:
        STORE.form_withdraw(body.session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Nothing has been submitted for this session.") from None
    return {"ok": True}


# NUSSU reviewer view. A demo: there is no sign-in, which a real reviewer view would need.
@app.get("/api/review/groups")
def review_groups(topic: str | None = Query(default=None)):
    consultation = content.consultation_for_topic(topic)
    counts = STORE.counts(consultation["id"])
    # The reviewer is told the period, how students were reached and how many accounts are fictional seeds. The
    # numbers are counted from the store: accounts still in the consultation, withdrawn ones left out.
    context = {**content.REVIEW_CONTEXT, "closes": consultation["closing_date"],
               "accounts": counts["contributors"], "seeds": counts["seeds"]}
    return {"consultation": consultation, "groups": strip.groups(STORE, consultation["id"]), "context": context}


@app.get("/api/review/locate/{ref_code}")
def review_locate(ref_code: str):
    """Which group holds a submitted account: how the demo jumps from the student's receipt to NUSSU's side."""
    group_id = strip.locate(STORE, ref_code)
    if group_id is None:
        raise HTTPException(status_code=404, detail="No account with that reference.")
    return {"ref": ref_code, "group_id": group_id}


@app.get("/api/review/strip/{group_id}")
def review_strip(group_id: str, topic: str | None = Query(default=None)):
    built = strip.build(STORE, group_id, content.consultation_for_topic(topic)["id"])
    if built is None:
        raise HTTPException(status_code=404, detail="No such group.")
    return built


# Static frontend last, so it never shadows the API routes. /review is a page of the same single-page app.
if FRONTEND_DIST.is_dir():
    @app.get("/review")
    def review_page():
        return FileResponse(FRONTEND_DIST / "index.html")


    @app.get("/form")
    def form_page():
        return FileResponse(FRONTEND_DIST / "index.html")


    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
