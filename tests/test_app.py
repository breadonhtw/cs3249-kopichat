import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import llm
from tests.fixtures.storyboard import EXTRACTIONS


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("KOPICHAT_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("KOPICHAT_LOG_DIR", str(tmp_path / "logs"))
    from backend import app as a
    a.STORE = a.store.Store(str(tmp_path / "t.db")); a.STORE.init(); a.SESSIONS.clear()
    c = TestClient(a.app)
    c.store_path = str(tmp_path / "t.db")
    return c


def _to_chat(client, sid="t", overall="Negatively"):
    client.post("/api/session", json={"session_id": sid})
    client.post("/api/consent", json={"session_id": sid, "agreed": True})
    return client.post("/api/overall", json={"session_id": sid, "value": overall}).json()


def _submit(client, sid="t"):
    return client.post("/api/submit", json={"session_id": sid, "approved": True}).json()


def test_submit_refused_without_approval(client):
    client.post("/api/session", json={"session_id": "t"})
    r = client.post("/api/submit", json={"session_id": "t", "approved": False})
    assert r.status_code == 400
    assert r.json()["detail"] == "Approval is required before anything is stored."
    assert client.post("/api/submit", json={"session_id": "t"}).status_code == 400
    assert client.post("/api/submit", json={"session_id": "t", "approved": "true"}).status_code == 400
    from backend import app as a
    assert a.STORE.counts("campus-visitors-2026")["contributors"] == 6  # seeds only


def test_journey_round_trip(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    outs = [EXTRACTIONS[1], {"theme": "transport", "group": "Morning boarding at Kent Ridge MRT", "needs_review": False}]
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: outs.pop(0))
    client.post("/api/session", json={"session_id": "t"})
    client.post("/api/consent", json={"session_id": "t", "agreed": True})
    assert client.post("/api/overall", json={"session_id": "t", "value": "Negatively"}).json()["phase"] == "chat"
    t = client.post("/api/turn", json={"session_id": "t", "message": "Kent Ridge MRT yesterday, around 8.45am. Couldn't get onto the first A2. There was a group with a guide, but honestly mornings are crowded anyway, idk how much was because of them."}).json()
    assert t["state"]["dims"]["q1_what"]["score"] == 2 and t["counter"] == "Follow-up 1 of up to 5"
    rows = client.get("/api/summary/t").json()["rows"]
    assert any(r["key"] == "what" and "first A2" in r["text"] for r in rows)
    e = client.patch("/api/summary/t", json={"key": "often", "text": "3 times in the last 2 weeks"}).json()
    assert next(r for r in e["rows"] if r["key"] == "often")["status"] == "edited"
    s = client.post("/api/submit", json={"session_id": "t", "approved": True}).json()
    assert s["account"]["ref_code"].startswith("KR-") and s["aggregate"]["contributors"] == 7 and s["aggregate"]["group"]["count"] == 3
    s2 = client.post("/api/submit", json={"session_id": "t", "approved": True}).json()
    assert s2["account"]["id"] == s["account"]["id"] and s2["aggregate"]["contributors"] == 7


def test_reset_reloads_seeds(client):
    assert client.post("/api/admin/reset").status_code == 200


def test_session_returns_consultation_and_consent_phase(client):
    body = client.post("/api/session", json={"session_id": "t"}).json()
    assert body["state"]["phase"] == "consent"
    assert body["consultation"]["id"] == "campus-visitors-2026"
    assert "llm" in body


def test_session_is_idempotent(client):
    client.post("/api/session", json={"session_id": "t"})
    client.post("/api/consent", json={"session_id": "t", "agreed": True})
    assert client.post("/api/session", json={"session_id": "t"}).json()["state"]["phase"] == "overall"


def test_unknown_session_is_404_everywhere(client):
    assert client.post("/api/consent", json={"session_id": "nope", "agreed": True}).status_code == 404
    assert client.post("/api/overall", json={"session_id": "nope", "value": None}).status_code == 404
    assert client.post("/api/turn", json={"session_id": "nope", "message": "hi"}).status_code == 404
    assert client.get("/api/summary/nope").status_code == 404
    assert client.patch("/api/summary/nope", json={"key": "what", "text": "x"}).status_code == 404
    assert client.post("/api/submit", json={"session_id": "nope", "approved": True}).status_code == 404
    assert client.post("/api/withdraw", json={"session_id": "nope"}).status_code == 404
    assert client.post("/api/contact", json={"session_id": "nope", "contact": "a@b.sg"}).status_code == 404


def test_consent_gating(client):
    client.post("/api/session", json={"session_id": "t"})
    assert client.post("/api/consent", json={"session_id": "t", "agreed": False}).status_code == 400
    assert client.post("/api/consent", json={"session_id": "t"}).status_code == 400
    # still in consent: the overall step is refused
    assert client.post("/api/overall", json={"session_id": "t", "value": "Mixed"}).status_code == 409
    from backend import app as a
    assert a.SESSIONS["t"]["state"]["phase"] == "consent"
    r = client.post("/api/consent", json={"session_id": "t", "agreed": True})
    assert r.status_code == 200 and r.json()["phase"] == "overall"


def test_overall_rejects_unknown_value_and_accepts_null(client):
    client.post("/api/session", json={"session_id": "t"})
    client.post("/api/consent", json={"session_id": "t", "agreed": True})
    assert client.post("/api/overall", json={"session_id": "t", "value": "Furious"}).status_code == 400
    r = client.post("/api/overall", json={"session_id": "t", "value": None}).json()
    assert r["phase"] == "chat" and r["state"]["overall"] is None
    assert r["reply"].startswith("In your own words")


def test_patch_summary_bad_key_is_400(client):
    _to_chat(client)
    r = client.patch("/api/summary/t", json={"key": "bogus", "text": "x"})
    assert r.status_code == 400
    from backend import app as a
    assert a.SESSIONS["t"]["state"]["edits"] == {}


def test_patch_summary_strips_text(client):
    _to_chat(client)
    rows = client.patch("/api/summary/t", json={"key": "what", "text": "  hello  "}).json()["rows"]
    assert next(r for r in rows if r["key"] == "what")["text"] == "hello"


def test_get_summary_reports_approved_flag(client):
    _to_chat(client)
    body = client.get("/api/summary/t").json()
    assert body["approved"] is False and len(body["rows"]) == 9


def test_skip_chip_label_maps_to_skip_action(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: pytest.fail("LLM must not be called for a chip"))
    _to_chat(client)
    from backend import app as a
    st = a.SESSIONS["t"]["state"]
    st["last_target"] = "q1_what"
    st["pending_question"] = "Where were you?"
    r = client.post("/api/turn", json={"session_id": "t", "message": "Skip this question"}).json()
    assert st["dims"]["q1_what"]["state"] == "declined"
    assert r["reply"].startswith("Noted, skipping that.")


def test_why_and_anonymous_chip_labels(client):
    _to_chat(client)
    r = client.post("/api/turn", json={"session_id": "t", "message": "Is this anonymous?"}).json()
    assert "No name or student ID" in r["reply"]
    r = client.post("/api/turn", json={"session_id": "t", "message": "Stop"}).json()
    assert r["chips"] == ["Delete", "Keep draft"]


def test_noop_chips_return_pending_question(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: pytest.fail("LLM must not be called for a chip"))
    _to_chat(client)
    for label in ("Keep draft", "Continue without the name", "Continue with my general experience", "None of these"):
        r = client.post("/api/turn", json={"session_id": "t", "message": label}).json()
        assert r["reply"].startswith("In your own words") and r["chips"] == ["Skip this question", "Why do you ask?", "Pause"]


def test_delete_chip_resets_the_session_state(client):
    _to_chat(client)
    r = client.post("/api/turn", json={"session_id": "t", "message": "Delete"}).json()
    assert r["phase"] == "deleted"


def test_action_wins_over_message(client):
    _to_chat(client)
    r = client.post("/api/turn", json={"session_id": "t", "message": "Stop", "action": "anonymous"}).json()
    assert "No name or student ID" in r["reply"]


def test_turn_without_llm_says_so(client):
    _to_chat(client)
    r = client.post("/api/turn", json={"session_id": "t", "message": "The buses are packed"}).json()
    assert "needs an LLM" in r["reply"]


def test_withdraw_by_session_clears_contact_and_decrements_contributors(client):
    _to_chat(client)
    acct = _submit(client)["account"]
    assert client.post("/api/contact", json={"session_id": "t", "contact": "me@u.nus.edu"}).status_code == 200
    from backend import app as a
    assert a.STORE.counts("campus-visitors-2026")["contributors"] == 7
    r = client.post("/api/withdraw", json={"session_id": "t"})
    assert r.status_code == 200
    assert a.STORE.counts("campus-visitors-2026")["contributors"] == 6
    assert a.STORE.get(acct["id"])["withdrawn"] is True
    with sqlite3.connect(client.store_path) as c:
        assert c.execute("SELECT COUNT(*) FROM contacts").fetchone()[0] == 0
    # withdrawing twice is harmless, and a withdrawn account takes no contact
    assert client.post("/api/withdraw", json={"session_id": "t"}).status_code == 200
    assert client.post("/api/contact", json={"session_id": "t", "contact": "me@u.nus.edu"}).status_code == 409


def test_withdraw_and_contact_need_a_submitted_account(client):
    _to_chat(client)
    assert client.post("/api/withdraw", json={"session_id": "t"}).status_code == 404
    assert client.post("/api/contact", json={"session_id": "t", "contact": "a@b.sg"}).status_code == 404


def test_withdraw_ignores_a_client_supplied_account_id(client):
    _to_chat(client, "a")
    _to_chat(client, "b")
    acct_a = _submit(client, "a")["account"]
    client.post("/api/withdraw", json={"session_id": "b", "account_id": acct_a["id"]})  # b has no account
    from backend import app as a
    assert a.STORE.get(acct_a["id"])["withdrawn"] is False


def test_contact_is_stored_and_replaced(client):
    _to_chat(client)
    acct = _submit(client)["account"]
    client.post("/api/contact", json={"session_id": "t", "contact": " one@u.nus.edu "})
    client.post("/api/contact", json={"session_id": "t", "contact": "two@u.nus.edu"})
    with sqlite3.connect(client.store_path) as c:
        assert c.execute("SELECT account_id, contact FROM contacts").fetchall() == [(acct["id"], "two@u.nus.edu")]
    assert client.post("/api/contact", json={"session_id": "t", "contact": "  "}).status_code == 400


def test_reset_clears_sessions_and_submissions(client):
    _to_chat(client)
    _submit(client)
    assert client.post("/api/admin/reset").json() == {"ok": True}
    assert client.get("/api/summary/t").status_code == 404
    from backend import app as a
    assert a.STORE.counts("campus-visitors-2026")["contributors"] == 6
