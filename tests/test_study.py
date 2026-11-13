"""What the user study needs: two consultations, the visibility choice, timing, the matched form and the blind export."""
import pytest
from fastapi.testclient import TestClient

from backend import aggregate, content, export, policy as p, strip
from backend import store as S

STUDY = "study-spaces-2026"
VISITORS = "campus-visitors-2026"


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.delenv("KOPICHAT_STUDY", raising=False)
    from backend import app as a
    a.STORE = a.store.Store(str(tmp_path / "t.db")); a.STORE.init(); a.SESSIONS.clear()
    return TestClient(a.app)


@pytest.fixture
def db(tmp_path):
    s = S.Store(str(tmp_path / "t.db")); s.init(); return s


def _chat_submit(client, sid, topic=None, visibility=None, what="No seat at CLB"):
    from backend import app as a
    client.post("/api/session", json={"session_id": sid, "topic": topic, "participant": "P01"})
    client.post("/api/consent", json={"session_id": sid, "agreed": True})
    client.post("/api/overall", json={"session_id": sid, "value": "Negatively"})
    state = a.SESSIONS[sid]["state"]
    state["phase"] = "summary"
    state["edits"]["what"] = what
    body = {"session_id": sid, "approved": True}
    if visibility:
        body["visibility"] = visibility
    return client.post("/api/submit", json=body)


# --- two consultations ---------------------------------------------------------

def test_topic_picks_the_consultation_and_the_default_is_visitors(client):
    assert client.post("/api/session", json={"session_id": "a"}).json()["consultation"]["id"] == VISITORS
    study = client.post("/api/session", json={"session_id": "b", "topic": "study"}).json()
    assert study["consultation"]["id"] == STUDY and study["state"]["consultation_id"] == STUDY
    assert "study" in study["consultation"]["overall_question"]
    assert client.post("/api/session", json={"session_id": "c", "topic": "nonsense"}).json()["consultation"]["id"] == VISITORS


def test_both_consultations_share_shape_and_options():
    for c in content.CONSULTATIONS.values():
        assert set(c) >= {"id", "topic", "title", "why", "closing_date", "overall_question", "overall_options"}
        assert c["overall_options"] == content.OVERALL_OPTIONS
    assert content.themes_for(STUDY).keys() >= {"seats", "hours", "conditions", "other", "needs_review"}
    assert content.themes_for(VISITORS) is content.THEMES


def test_each_consultation_has_six_seeds_and_its_own_groups(db):
    assert db.counts(VISITORS)["contributors"] == 6 and db.counts(STUDY)["contributors"] == 6
    assert {g["theme"] for g in db.groups(STUDY)} == {"seats", "hours", "conditions"}
    assert not {g["name"] for g in db.groups(STUDY)} & {g["name"] for g in db.groups(VISITORS)}


def test_a_study_account_is_filed_under_study_themes_and_sees_only_its_consultation(client, monkeypatch):
    from backend import llm
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    seen = {}

    def fake(system, messages, **k):
        seen["system"] = system
        return {"theme": "seats", "group": "No seats at Central Library by late morning", "needs_review": False}

    monkeypatch.setattr(llm, "chat_json", fake)
    agg = _chat_submit(client, "s", topic="study", visibility="board").json()["aggregate"]
    assert '"seats"' in seen["system"] and '"transport"' not in seen["system"]
    assert agg["theme"] == "seats" and agg["contributors"] == 7 and agg["seeds"] == 6
    assert {o["id"] for o in agg["group"]["others"]} == {"G", "H"}
    assert not {b["id"] for b in agg["board"]} & set("ABCDEF")


def test_classify_refuses_a_theme_of_the_other_consultation(monkeypatch):
    from backend import llm
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: {"theme": "transport", "group": None})
    assert aggregate.classify({"fields": [], "consultation_id": STUDY}, [])["theme"] == "needs_review"


def test_reviewer_groups_follow_the_topic(client):
    study = client.get("/api/review/groups", params={"topic": "study"}).json()
    assert study["consultation"]["id"] == STUDY and len(study["groups"]) == 5
    assert client.get("/api/review/groups").json()["consultation"]["id"] == VISITORS
    gid = study["groups"][0]["id"]
    assert client.get(f"/api/review/strip/{gid}").json()["group"]["theme"] in content.STUDY_THEMES


def test_consequence_question_says_morning_only_for_a_morning():
    st = p.new_state("c")
    st["dims"]["q1_what"]["checks"]["time"] = "last night around 9pm"
    assert p.compose_question(("q3_effect", "consequence"), st).endswith("that time?")
    for morning in ("this morning", "8.45am", "around 9 a.m."):
        st["dims"]["q1_what"]["checks"]["time"] = morning
        assert p.compose_question(("q3_effect", "consequence"), st).endswith("that morning?")


# --- private or public -----------------------------------------------------------

def test_an_account_is_private_unless_the_student_chooses_the_noticeboard(client):
    from backend import app as a
    private = _chat_submit(client, "one").json()
    assert private["aggregate"]["visibility"] == "nussu"
    public = _chat_submit(client, "two", visibility="board", what="Second account").json()
    assert public["aggregate"]["visibility"] == "board"
    assert _chat_submit(client, "three", visibility="everyone").status_code == 400
    assert a.STORE.counts(VISITORS)["contributors"] == 8  # the refused one stored nothing


def test_a_private_account_is_counted_but_never_shown_to_another_student(db):
    def send(sid, visibility, text):
        st = p.new_state(VISITORS); st.update(approved=True, visibility=visibility)
        a = db.submit(sid, st, [{"key": "what", "label": "What happened", "text": text, "status": "quoted"}])
        db.assign(a["id"], "transport", "Morning boarding at Kent Ridge MRT", False)
        return a

    private, public = send("p", "nussu", "a private account"), send("q", "board", "a public account")
    viewer = send("v", "nussu", "the viewer")
    agg = aggregate.build(db, viewer["id"])
    shown = {o["id"] for o in agg["group"]["others"]} | {b["id"] for b in agg["board"]} | {d["id"] for d in agg["differing"]}
    assert private["id"] not in shown and public["id"] in shown
    assert agg["group"]["count"] == 5 and agg["contributors"] == 9  # two seeds and all three, private included


def test_the_reviewer_sees_a_private_account_marked_as_private(db):
    st = p.new_state(VISITORS); st["approved"] = True
    a = db.submit("p", st, [{"key": "what", "label": "What happened", "text": "kept private", "status": "quoted"}])
    db.assign(a["id"], "transport", "Morning boarding at Kent Ridge MRT", False)
    built = strip.build(db, db.group_id_for("Morning boarding at Kent Ridge MRT"))
    line = next(l for l in built["panels"][0]["sections"][0]["said"] if l["quote"] == "kept private")
    assert line["note"] == strip.PRIVATE_NOTE
    seed = next(l for l in built["panels"][0]["sections"][0]["said"] if l["who"] == "A")
    assert seed["note"] is None


def test_a_database_from_before_the_study_gains_the_new_columns(tmp_path):
    import sqlite3
    path = str(tmp_path / "old.db")
    s = S.Store(path); s.init()
    with sqlite3.connect(path) as c:
        for col in ("visibility", "opened_at", "duration_s", "participant", "blind_id"):
            c.execute(f"ALTER TABLE accounts DROP COLUMN {col}")
    S.Store(path).init()
    assert S.Store(path).get("A")["visibility"] == "board"


# --- timing, participant code, study mode ------------------------------------------

def test_chat_submission_records_time_from_opening_and_the_participant_code(client):
    from backend import app as a
    client.post("/api/session", json={"session_id": "t", "participant": "P03<script>"})
    assert a.SESSIONS["t"]["state"]["participant"] == "P03script"
    a.SESSIONS["t"]["state"]["opened_at"] = "2026-11-01T02:00:00+00:00"
    _chat_submit(client, "t")
    account = a.STORE.account_for_session("t")
    assert account["participant"] == "P03script" and account["opened_at"] == "2026-11-01T02:00:00+00:00"
    assert account["duration_s"] > 0 and account["blind_id"].startswith("S-")


def test_reset_is_refused_in_study_mode(client, monkeypatch):
    assert client.post("/api/admin/reset", json={"session_id": "x"}).status_code == 200
    monkeypatch.setenv("KOPICHAT_STUDY", "1")
    assert client.post("/api/admin/reset", json={"session_id": "x"}).status_code == 403


# --- the matched form ------------------------------------------------------------

ANSWERS = {"q1_what": " No seat at CLB at 11am ", "q2_often": "three times that week", "q3_effect": "",
           "q4_basis": "happened to me"}


def test_form_asks_the_same_five_questions_in_schema_order(client):
    out = client.post("/api/form/open", json={"session_id": "f", "topic": "study"}).json()
    assert out["consultation"]["id"] == STUDY and "submission" not in out
    assert [f["dim"] for f in out["fields"]] == ["q1_what", "q2_often", "q3_effect", "q4_basis", "q5_better"]
    assert [f["key"] for f in out["fields"]] == ["what", "often", "effect", "basis", "suggestion"]


def test_form_stores_nothing_until_confirmed_and_needs_one_answer(client):
    from backend import app as a
    client.post("/api/form/open", json={"session_id": "f"})
    assert client.post("/api/form/submit", json={"session_id": "f", "answers": ANSWERS}).status_code == 400
    assert client.post("/api/form/submit", json={"session_id": "f", "confirmed": "yes", "answers": ANSWERS}).status_code == 400
    assert client.post("/api/form/submit", json={"session_id": "f", "confirmed": True, "answers": {"q1_what": "  "}}).status_code == 400
    assert client.post("/api/form/submit", json={"session_id": "f", "confirmed": True, "overall": "Fine", "answers": ANSWERS}).status_code == 400
    assert client.post("/api/form/submit", json={"session_id": "nobody", "confirmed": True, "answers": ANSWERS}).status_code == 404
    assert a.STORE.form_submitted() == []


def test_form_round_trip_rows_timing_and_no_board(client):
    from backend import app as a
    client.post("/api/form/open", json={"session_id": "f", "topic": "study", "participant": "P02"})
    first_open = a.STORE.form_open("f", STUDY, None)["opened_at"]
    client.post("/api/form/open", json={"session_id": "f", "topic": "study"})  # a reload
    assert a.STORE.form_open("f", STUDY, None)["opened_at"] == first_open  # the clock does not restart
    r = client.post("/api/form/submit", json={"session_id": "f", "confirmed": True, "overall": "Negatively",
                                              "answers": ANSWERS, "edited": ["q2_often"]})
    assert r.status_code == 200 and r.json()["ref_code"].startswith("KR-")
    rows = {row["key"]: row for row in r.json()["rows"]}
    assert rows["what"] == {"key": "what", "label": "What happened", "text": "No seat at CLB at 11am", "status": "quoted"}
    assert rows["often"]["status"] == "edited" and rows["effect"]["status"] == "skipped" and rows["suggestion"]["status"] == "skipped"
    assert rows["overall"]["text"] == "Negatively"
    sub = a.STORE.form_for_session("f")
    assert sub["participant"] == "P02" and sub["consultation_id"] == STUDY and sub["duration_s"] >= 0
    assert a.STORE.counts(STUDY)["contributors"] == 6  # a form submission is not a chat account
    assert client.post("/api/form/submit", json={"session_id": "f", "confirmed": True, "answers": ANSWERS}).status_code == 409
    again = client.post("/api/form/open", json={"session_id": "f"}).json()
    assert again["submission"]["ref_code"] == r.json()["ref_code"] and again["consultation"]["id"] == STUDY


def test_form_withdrawal_removes_it_from_the_export(client):
    from backend import app as a
    client.post("/api/form/open", json={"session_id": "f"})
    client.post("/api/form/submit", json={"session_id": "f", "confirmed": True, "answers": ANSWERS})
    assert client.post("/api/form/withdraw", json={"session_id": "nobody"}).status_code == 404
    assert client.post("/api/form/withdraw", json={"session_id": "f"}).json() == {"ok": True}
    assert a.STORE.form_submitted() == []
    assert client.post("/api/form/open", json={"session_id": "f"}).json()["submission"]["withdrawn"] is True


# --- the blind export --------------------------------------------------------------

def test_export_gives_both_channels_one_layout_with_no_channel_label(client):
    from backend import app as a
    _chat_submit(client, "c", topic="study", what="No seat at CLB at 11am")
    client.post("/api/form/open", json={"session_id": "f", "topic": "study"})
    client.post("/api/form/submit", json={"session_id": "f", "confirmed": True, "overall": "Negatively",
                                          "answers": {"q1_what": "No seat at CLB at 11am"}})
    subs = export.collect(a.STORE)
    assert sorted(s["channel"] for s in subs) == ["chat", "form"]  # seeds are left out
    texts = {s["channel"]: export.render(s["blind_id"], s["consultation_id"], s["rows"]) for s in subs}
    strip_id = lambda t: t.split("\n", 1)[1]
    assert strip_id(texts["chat"]) == strip_id(texts["form"])
    for text in texts.values():
        assert text.startswith("Submission S-") and "Study spaces during reading week and exams" in text
        assert not any(word in text.lower() for word in ("chat", "form", "kopichat", "kr-"))
        assert text.count(export.NO_ANSWER) == 4 and "What you saw" not in text
    key = export.key_csv(subs).splitlines()
    assert key[0].split(",")[:3] == ["blind_id", "channel", "topic"] and len(key) == 3
    assert {line.split(",")[1] for line in key[1:]} == {"chat", "form"}


def test_export_keeps_a_chat_only_row_when_it_holds_text():
    rows = [{"key": "what", "text": "x", "status": "quoted"}, {"key": "saw", "text": "bags on seats", "status": "quoted"},
            {"key": "feeling", "text": "", "status": "not_given"}, {"key": "effect", "text": "none", "status": "explicit_none"}]
    text = export.render("S-TEST1", STUDY, rows)
    assert "What you saw\nbags on seats" in text and "Feeling" not in text and "Effect on you\nnone" in text


# --- the reviewer view says where its accounts came from ---------------------------------

def test_reviewer_context_is_truthful_about_a_simulated_consultation(client):
    for topic in ("visitors", "study"):
        ctx = client.get("/api/review/groups", params={"topic": topic}).json()["context"]
        assert ctx["opens"] is None and ctx["closes"] == content.CLOSING_DATE and "placeholder" in ctx["closes_note"]
        assert ctx["reach"].startswith("Simulated consultation.") and "not sent out" in ctx["reach"]
        assert (ctx["accounts"], ctx["seeds"]) == (6, 6)


def test_reviewer_counts_include_private_accounts_and_leave_out_withdrawn_ones(client):
    from backend import app as a
    _chat_submit(client, "one")                       # private by default
    _chat_submit(client, "two", what="Second one")
    client.post("/api/withdraw", json={"session_id": "two"})
    out = client.get("/api/review/groups").json()
    assert (out["context"]["accounts"], out["context"]["seeds"]) == (7, 6)
    assert sum(g["count"] for g in out["groups"]) == 7
    assert "context" not in client.post("/api/session", json={"session_id": "s"}).json()["consultation"]
