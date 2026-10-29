import json, pytest
from backend import orchestrator as o, policy as p, content as c, extract as x, llm
from tests.fixtures.storyboard import STUDENT, WHY_LINE, EXTRACTIONS

@pytest.fixture
def fake(monkeypatch):
    def install(*outs):
        outs = list(outs)
        monkeypatch.setenv("LLM_PROVIDER", "anthropic")
        def chat_json(system, messages, max_tokens=800):
            r = outs.pop(0)
            if isinstance(r, Exception): raise r
            return r
        monkeypatch.setattr(llm, "chat_json", chat_json)
    return install

def run(st, msg=None, action=None):
    return o.handle(st, msg, action, "2026-10-28")

def test_storyboard_journey(fake):
    fake(EXTRACTIONS[0], EXTRACTIONS[1], EXTRACTIONS[2], {"route": "meta_why"}, EXTRACTIONS[3], EXTRACTIONS[4])
    st = p.new_state("c"); st["overall"] = "Negatively"
    assert run(st, action="start_chat")["reply"] == c.OPENING
    r1 = run(st, STUDENT[0]); assert r1["reply"].endswith(c.QUESTIONS[("q1_what","behaviour")]) and st["follow_ups_used"] == 1
    r2 = run(st, STUDENT[1]); assert st["dims"]["q1_what"]["score"] == 2 and st["dims"]["q4_basis"]["score"] == 2
    assert r2["reply"].endswith(c.QUESTIONS[("q3_effect","consequence")]) and st["follow_ups_used"] == 2
    r3 = run(st, STUDENT[2]); assert st["dims"]["q3_effect"]["score"] == 2 and r3["reply"].endswith(c.QUESTIONS[("q2_often","number")])
    rw = run(st, WHY_LINE); assert rw["reply"].startswith(c.WHY["q2_often"]) and st["follow_ups_used"] == 3
    r4 = run(st, STUDENT[3]); assert st["dims"]["q2_often"]["score"] == 2 and r4["reply"].endswith(c.QUESTIONS[("q5_better","present")]) and st["follow_ups_used"] == 4
    r5 = run(st, STUDENT[4]); assert st["dims"]["q5_better"]["score"] == 2 and r5["reply"] == c.SUFFICIENT_MESSAGE
    assert r5["phase"] == "summary" and r5["counter"] == "Follow-ups used 4 of up to 5"

def test_storyboard_acks_and_counters(fake):
    fake(EXTRACTIONS[0], EXTRACTIONS[1])
    st = p.new_state("c"); run(st, action="start_chat")
    r1 = run(st, STUDENT[0])
    assert r1["reply"] == "Packed buses, and late again. " + c.QUESTIONS[("q1_what","behaviour")]
    assert r1["counter"] == "Follow-up 1 of up to 5" and r1["phase"] == "chat"
    assert r1["chips"] == ["Skip this question", "Why do you ask?", "Pause"] and r1["options"] == []
    assert set(r1) == {"reply", "chips", "options", "state", "counter", "phase"}
    r2 = run(st, STUDENT[1])
    assert r2["reply"] == "You couldn't get onto the first A2. " + c.QUESTIONS[("q3_effect","consequence")]

def test_skip_declines_and_moves_on(fake):
    fake(EXTRACTIONS[0], EXTRACTIONS[1])
    st = p.new_state("c"); run(st, action="start_chat"); run(st, STUDENT[0]); run(st, STUDENT[1])
    r = run(st, action="skip")
    assert st["dims"]["q3_effect"]["state"] == "declined" and r["reply"].startswith(c.SKIP_ACK)
    assert r["reply"].endswith(c.QUESTIONS[("q2_often","number")]) and st["follow_ups_used"] == 3

def test_skip_with_no_target_is_a_noop(fake):
    fake()
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, action="skip")
    assert r["reply"] == c.OPENING and st["follow_ups_used"] == 0
    assert all(d["state"] == "not_asked" for d in st["dims"].values())

def test_skip_last_question_gives_sufficient_message(fake):
    fake(*EXTRACTIONS[:4])
    st = p.new_state("c"); run(st, action="start_chat")
    for s in STUDENT[:4]: run(st, s)
    r = run(st, action="skip")
    assert st["dims"]["q5_better"]["state"] == "declined"
    assert r["reply"] == c.SUFFICIENT_MESSAGE and r["phase"] == "summary"

def test_budget_caps_at_five(fake):
    thin = {"checks": {"q1_what": {"conditions": "packed"}}, "route": "continue", "ack": ""}
    fake(*[thin]*6)
    st = p.new_state("c"); run(st, action="start_chat")
    for i in range(6): r = run(st, "packed")
    assert st["follow_ups_used"] == 5 and r["phase"] == "summary"

def test_crisis_short_circuits(fake):
    fake({"route": "crisis", "checks": {"q1_what": {"behaviour": "x"}}})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "x")
    assert r["reply"] == c.CRISIS_MESSAGE and st["stopped"] == "crisis" and st["dims"]["q1_what"]["checks"]["behaviour"] is None

def test_after_crisis_questions_stay_paused(fake):
    fake({"route": "crisis"})
    st = p.new_state("c"); run(st, action="start_chat"); run(st, "x")
    r = run(st, "hello?")
    assert r["reply"] == c.CRISIS_MESSAGE and st["follow_ups_used"] == 0

def test_unclear_offers_options_uncounted(fake):
    fake({"route": "unclear", "unclear_options": ["the bus", "the food court"]})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "it was bad")
    assert r["options"] == ["the bus", "the food court", c.NONE_OF_THESE] and st["follow_ups_used"] == 0
    assert r["reply"].startswith(c.UNCLEAR_PREFIX)

def test_unclear_option_is_taken_as_the_students_message(fake):
    fake({"route": "unclear", "unclear_options": ["the bus", "the food court"]}, EXTRACTIONS[0])
    st = p.new_state("c"); run(st, action="start_chat"); run(st, "it was bad")
    r = run(st, action="option:0")
    assert st["transcript"] == ["it was bad", "the bus"]
    assert r["options"] == [] and st["last_options"] == []

def test_unclear_none_of_these_reasks_without_llm(fake):
    fake({"route": "unclear", "unclear_options": ["the bus"]})
    st = p.new_state("c"); run(st, action="start_chat"); run(st, "it was bad")
    r = run(st, action="option:1")
    assert r["reply"] == c.OPENING and st["follow_ups_used"] == 0 and st["transcript"] == ["it was bad"]

def test_unclear_without_options_reasks(fake):
    fake({"route": "unclear"})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "hm")
    assert r["reply"] == c.OPENING and r["options"] == []

@pytest.mark.parametrize("route,text", [("out_of_scope_person", c.OUT_OF_SCOPE_PERSON),
                                        ("out_of_scope_appeal", c.OUT_OF_SCOPE_APPEAL)])
def test_out_of_scope_fixed_text_uncounted_not_merged(fake, route, text):
    fake({"route": route, "checks": {"q1_what": {"conditions": "packed"}}})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "packed")
    assert r["reply"] == text and r["chips"] == ["Continue without the name", "Stop"]
    assert st["follow_ups_used"] == 0 and st["dims"]["q1_what"]["checks"]["conditions"] is None

def test_meta_anonymous_and_action(fake):
    fake({"route": "meta_anonymous"})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "is this anonymous?")
    assert r["reply"] == c.ANONYMOUS_MESSAGE + " " + c.OPENING and st["follow_ups_used"] == 0
    assert run(st, action="anonymous")["reply"] == r["reply"]

def test_why_action_uses_last_target(fake):
    fake(EXTRACTIONS[0])
    st = p.new_state("c"); run(st, action="start_chat"); run(st, STUDENT[0])
    r = run(st, action="why")
    assert r["reply"] == c.WHY["q1_what"] + " " + st["pending_question"] and st["follow_ups_used"] == 1

def test_stop_route_and_action(fake):
    fake({"route": "stop"})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "stop")
    assert r["reply"] == c.STOP_MESSAGE and r["chips"] == ["Delete", "Keep draft"]
    assert run(st, action="stop")["reply"] == c.STOP_MESSAGE

def test_llm_failure_leaves_state_unchanged(fake):
    fake(llm.LLMError("timeout"))
    st = p.new_state("c"); run(st, action="start_chat"); before = json.dumps(st["dims"])
    r = run(st, "x")
    assert r["reply"] == c.UNAVAILABLE_MESSAGE and json.dumps(st["dims"]) == before and st["follow_ups_used"] == 0
    assert st["transcript"] == [] and r["counter"] == "Follow-up 0 of up to 5"

def test_no_llm_leaves_state_untouched():
    st = p.new_state("c"); run(st, action="start_chat")
    before = json.dumps(st)
    r = run(st, "x")
    assert r["reply"] == c.NO_LLM_MESSAGE and json.dumps(st) == before

def test_delete_resets(fake):
    fake(EXTRACTIONS[0])
    st = p.new_state("c"); run(st, action="start_chat"); run(st, STUDENT[0])
    r = run(st, action="delete")
    assert r["phase"] == "deleted" and st["transcript"] == []
    assert st["consultation_id"] == "c" and st["follow_ups_used"] == 0 and st["dims"]["q1_what"]["checks"]["conditions"] is None

def test_turn_is_logged_when_session_id_given(fake, monkeypatch, tmp_path):
    monkeypatch.setenv("KOPICHAT_LOG_DIR", str(tmp_path))
    fake(EXTRACTIONS[0], EXTRACTIONS[1])
    st = p.new_state("c"); run(st, action="start_chat")
    o.handle(st, STUDENT[0], None, "2026-10-28", session_id="t")
    lines = (tmp_path / "t.jsonl").read_text().splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert {"transcript", "extraction", "scores", "reply"} <= set(rec)
    assert rec["transcript"] == [STUDENT[0]] and rec["extraction"]["route"] == "continue"
    assert rec["scores"]["q4_basis"] == 2 and rec["reply"].startswith("Packed buses")
    run(st, STUDENT[1])  # no session_id: nothing more is written
    assert len((tmp_path / "t.jsonl").read_text().splitlines()) == 1

def test_logbook_keeps_session_id_inside_the_log_dir(monkeypatch, tmp_path):
    from backend import logbook
    monkeypatch.setenv("KOPICHAT_LOG_DIR", str(tmp_path / "logs"))
    logbook.append("../evil", {"a": 1})
    assert [f.name for f in (tmp_path / "logs").iterdir()] == ["___evil.jsonl"]
    assert not (tmp_path / "evil.jsonl").exists()
