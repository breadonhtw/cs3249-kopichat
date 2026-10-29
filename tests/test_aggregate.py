import pytest
from backend import aggregate as A, store as S, policy as p, llm, prompts

FIXED = {"theme": "needs_review", "group": None, "needs_review": True}


@pytest.fixture
def db(tmp_path):
    s = S.Store(str(tmp_path / "t.db")); s.init(); return s


def _llm(monkeypatch, reply):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: reply)


def test_classify_validates(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: {"theme": "weather", "group": "x"})
    assert A.classify({"fields": []}, ["g"]) == {"theme": "needs_review", "group": None, "needs_review": True}


def test_classify_llm_failure(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: (_ for _ in ()).throw(llm.LLMError("x")))
    assert A.classify({"fields": []}, [])["needs_review"] is True


def test_classify_llm_disabled():
    assert A.classify({"fields": []}, ["g"]) == FIXED


def test_classify_accepts_existing_group(monkeypatch):
    _llm(monkeypatch, {"theme": "transport", "group": "g", "needs_review": False})
    assert A.classify({"fields": []}, ["g"]) == {"theme": "transport", "group": "g", "needs_review": False}


def test_classify_new_group_kept_and_truncated(monkeypatch):
    _llm(monkeypatch, {"theme": "food", "group": "new: " + "x" * 100, "needs_review": 0})
    out = A.classify({"fields": []}, [])
    assert out["group"].startswith("new: x") and len(out["group"]) == 60
    assert out["needs_review"] is False
    _llm(monkeypatch, {"theme": "food", "group": "new: Short name", "needs_review": False})
    assert A.classify({"fields": []}, [])["group"] == "new: Short name"


def test_classify_unknown_group_becomes_none(monkeypatch):
    _llm(monkeypatch, {"theme": "food", "group": "invented", "needs_review": False})
    assert A.classify({"fields": []}, ["g"])["group"] is None
    _llm(monkeypatch, {"theme": "food", "group": 7, "needs_review": False})
    assert A.classify({"fields": []}, ["g"])["group"] is None


def test_classify_passes_max_tokens_and_turn(monkeypatch):
    seen = {}
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")

    def fake(system, messages, max_tokens=500):
        seen.update(system=system, messages=messages, max_tokens=max_tokens)
        return {"theme": "other", "group": None, "needs_review": False}

    monkeypatch.setattr(llm, "chat_json", fake)
    A.classify({"fields": [{"key": "what", "label": "What happened", "text": "Missed the A2", "status": "quoted"}]}, ["g"])
    assert seen["max_tokens"] == 200
    assert seen["system"] == prompts.CLASSIFY_SYSTEM
    assert "Missed the A2" in seen["messages"][0]["content"]


def test_classify_turn_only_includes_quoted_fields():
    acct = {"fields": [
        {"key": "what", "label": "What happened", "text": "Missed the A2", "status": "quoted"},
        {"key": "effect", "label": "Effect", "text": "None", "status": "explicit_none"},
        {"key": "better", "label": "What would help", "text": "", "status": "skipped"},
        {"key": "often", "label": "How often", "text": "hidden", "status": "not_asked"},
    ]}
    turn = prompts.classify_turn(acct, ["Group one"])
    assert "Missed the A2" in turn and "Group one" in turn and "None" in turn
    assert "hidden" not in turn and "What would help" not in turn


def _submit(db, often=2):
    st = p.new_state("campus-visitors-2026"); st["approved"] = True
    st["dims"]["q2_often"].update(score=often, state="provided")
    return db.submit("s1", st, [{"key": "what", "text": "Couldn't get onto the first A2", "status": "quoted"}])


def test_build_after_demo_submission(db):
    st = p.new_state("campus-visitors-2026"); st["approved"] = True
    st["dims"]["q2_often"].update(score=2, state="provided")
    a = db.submit("s1", st, [{"key": "what", "text": "Couldn't get onto the first A2", "status": "quoted"}])
    db.assign(a["id"], "transport", "Morning boarding at Kent Ridge MRT", False)
    agg = A.build(db, a["id"])
    assert agg["provisional"] and agg["contributors"] == 7 and agg["seeds"] == 6
    assert agg["group"]["count"] == 3 and len(agg["group"]["others"]) == 2
    assert agg["coverage"]["how_often"] == {"said": 2, "of": 3}
    assert {d["id"] for d in agg["differing"]} >= {"C", "D"}


def test_build_shape_and_projection(db):
    a = _submit(db)
    db.assign(a["id"], "transport", "Morning boarding at Kent Ridge MRT", False)
    agg = A.build(db, a["id"])
    assert set(agg) == {"provisional", "theme", "group", "contributors", "seeds", "differing", "coverage", "closing_line"}
    assert agg["theme"] == "transport"
    assert agg["group"]["name"] == "Morning boarding at Kent Ridge MRT"
    assert agg["closing_line"] == "This is what NUSSU reads before it decides what to raise."
    assert all(set(o) == {"id", "excerpt"} for o in agg["group"]["others"])
    assert {o["id"] for o in agg["group"]["others"]} == {"A", "B"}
    assert all(set(d) == {"id", "excerpt", "note"} for d in agg["differing"])
    assert a["id"] not in {d["id"] for d in agg["differing"]}


def test_build_without_group(db):
    a = _submit(db, often=2)
    db.assign(a["id"], "needs_review", None, True)
    agg = A.build(db, a["id"])
    assert agg["group"] == {"name": None, "count": 1, "others": []}
    assert agg["coverage"]["how_often"] == {"said": 1, "of": 1}
    assert a["id"] not in {d["id"] for d in agg["differing"]}
    assert {"C", "D"} <= {d["id"] for d in agg["differing"]}
    b = db.submit("s2", {**p.new_state("campus-visitors-2026"), "approved": True}, [])
    db.assign(b["id"], "other", None, True)
    assert A.build(db, b["id"])["coverage"]["how_often"] == {"said": 0, "of": 1}


def test_build_excludes_withdrawn_member(db):
    a = _submit(db)
    db.assign(a["id"], "transport", "Morning boarding at Kent Ridge MRT", False)
    db.withdraw("A")
    agg = A.build(db, a["id"])
    assert agg["group"]["count"] == 2 and [o["id"] for o in agg["group"]["others"]] == ["B"]
    assert agg["coverage"]["how_often"] == {"said": 1, "of": 2}
