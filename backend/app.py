"""HTTP surface for the student journey. Sessions live in memory, keyed by a client UUID.

Mapping and sequencing only: the conversation lives in orchestrator/policy, storage in store,
numbers in aggregate. Nothing is stored until /api/submit is called with approved == true.
"""
import datetime
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import aggregate, content, llm, orchestrator, policy, store

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"


def default_db_path() -> str:
    """KOPICHAT_DB if set, else backend/kopichat.db under the repo root (never relative to the cwd)."""
    return os.environ.get("KOPICHAT_DB") or str(REPO_ROOT / "backend" / "kopichat.db")


Path(default_db_path()).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
STORE = store.Store(default_db_path())
STORE.init()
SESSIONS: dict[str, dict] = {}

# Chip labels the student can tap, mapped to orchestrator actions before handle() runs.
CHIP_ACTIONS = {
    "Skip this question": "skip",
    "Why do you ask?": "why",
    "Is this anonymous?": "anonymous",
    "Stop and delete": "stop",
    "Stop": "stop",
    "Delete": "delete",
}
# Chips that only dismiss a prompt: the pending question comes back, nothing is extracted.
NOOP_CHIPS = {"Keep draft", "Continue without the name", "Continue with my general experience",
              "None of these", "Pause"}

app = FastAPI(title="Kopichat")


class SessionBody(BaseModel):
    session_id: str


class ConsentBody(SessionBody):
    agreed: Any = None


class OverallBody(SessionBody):
    value: str | None = None


class TurnBody(SessionBody):
    message: str | None = None
    action: str | None = None


class SubmitBody(SessionBody):
    approved: Any = None


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


def _today() -> str:
    return datetime.date.today().isoformat()


def _account_id(session_id: str) -> str:
    """The account of this session, from the server's own record. Never from the client."""
    account_id = _session(session_id)["account_id"]
    if account_id is None:
        raise HTTPException(status_code=404, detail="Nothing has been submitted for this session.")
    return account_id


@app.post("/api/session")
def create_session(body: SessionBody):
    session = SESSIONS.setdefault(body.session_id, {
        "state": policy.new_state(content.CONSULTATION["id"]), "account_id": None})
    return {"consultation": content.CONSULTATION, "state": session["state"], "llm": llm.describe()}


@app.post("/api/consent")
def consent(body: ConsentBody):
    state = _session(body.session_id)["state"]
    if body.agreed is not True:
        raise HTTPException(status_code=400, detail="Agreement is required to continue.")
    if state["phase"] == "consent":
        state["phase"] = "overall"
    return {"phase": state["phase"], "state": state}


@app.post("/api/overall")
def overall(body: OverallBody):
    state = _session(body.session_id)["state"]
    if state["phase"] == "consent":
        raise HTTPException(status_code=409, detail="Agree to continue first.")
    if body.value is not None and body.value not in content.CONSULTATION["overall_options"]:
        raise HTTPException(status_code=400, detail="Unknown overall view.")
    state["overall"] = body.value
    return orchestrator.handle(state, None, "start_chat", _today(), session_id=body.session_id)


@app.post("/api/turn")
def turn(body: TurnBody):
    state = _session(body.session_id)["state"]
    message, action = body.message, body.action
    if action == "start_chat":
        raise HTTPException(status_code=409, detail="The chat starts through /api/overall.")
    if action is None and message is not None:
        label = message.strip()
        if label in CHIP_ACTIONS:
            action, message = CHIP_ACTIONS[label], None
        elif label in NOOP_CHIPS:
            if label == "None of these":
                state["last_options"] = []
            message = None
    return orchestrator.handle(state, message, action, _today(), session_id=body.session_id)


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
    state = session["state"]
    if state["phase"] not in ("summary", "receipt"):
        raise HTTPException(status_code=409, detail="Nothing to submit yet.")
    state["approved"] = True
    account = STORE.submit(body.session_id, state, policy.build_summary(state))
    if not account["theme"]:
        names = list(STORE.counts(account["consultation_id"])["by_group"].keys())
        cls = aggregate.classify(account, names)
        group = cls["group"]
        if group and group.startswith(aggregate.NEW_GROUP_PREFIX):
            group = group[len(aggregate.NEW_GROUP_PREFIX):].strip()
        STORE.assign(account["id"], cls["theme"], group, cls["needs_review"])
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
    return {"ok": True}


@app.post("/api/contact")
def contact(body: ContactBody):
    account_id = _account_id(body.session_id)
    text = body.contact.strip()
    if not text:
        raise HTTPException(status_code=400, detail="A contact is required.")
    if STORE.get(account_id)["withdrawn"]:
        raise HTTPException(status_code=409, detail="This account has been withdrawn.")
    STORE.set_contact(account_id, text)
    return {"ok": True}


@app.post("/api/admin/reset")
def admin_reset():
    STORE.reset()
    SESSIONS.clear()
    return {"ok": True}


# Static frontend last, so it never shadows the API routes.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
