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
    assert run(st, action="why")["counter"] == "Up to 5 follow-ups"
    r1 = run(st, STUDENT[0])
    assert r1["reply"] == "Packed buses, and late again. " + c.QUESTIONS[("q1_what","behaviour")]
    assert r1["counter"] == "Follow-up 1 of up to 5" and r1["phase"] == "chat"
    assert r1["chips"] == ["Skip this question", "Why do you ask?", "Pause"] and r1["options"] == []
    assert set(r1) == {"reply", "chips", "options", "state", "counter", "phase", "unavailable"}
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
    # each answer gives exactly what was asked, so every question is new and the budget is what stops them
    lines = ["packed", "the bus left me", "at the stop", "at 8am", "with tourists", "late"]
    spans = [("q1_what", "conditions", "packed"), ("q1_what", "behaviour", "bus left me"), ("q1_what", "place", "the stop"),
             ("q1_what", "time", "8am"), ("q1_what", "persons", "tourists"), ("q3_effect", "impact_type", "late")]
    outs, checks = [], {}
    for dim, name, span in spans:
        checks.setdefault(dim, {})[name] = span
        outs.append({"checks": json.loads(json.dumps(checks)), "route": "continue", "ack": ""})
    fake(*outs)
    st = p.new_state("c"); run(st, action="start_chat")
    for line in lines: r = run(st, line)
    assert st["follow_ups_used"] == 5 and r["phase"] == "summary" and r["reply"] == c.SUFFICIENT_MESSAGE
    assert len({tuple(t) for t in st["asked"]}) == len(st["asked"]) == 5


def asked_questions(replies):
    return [q for r in replies for q in c.QUESTIONS.values() if r["reply"].endswith(q)]


def test_an_unanswered_question_is_never_asked_again(fake):
    thin = {"checks": {"q1_what": {"conditions": "packed"}}, "route": "continue", "ack": ""}
    fake(*[thin] * 6)
    st = p.new_state("c"); run(st, action="start_chat")
    replies = [run(st, "packed") for _ in range(6)]
    qs = asked_questions(replies)
    assert len(qs) == len(set(qs)) == 4  # Q1, Q3, Q2, Q4 once each; nothing open is left un-asked
    assert qs[0] == c.QUESTIONS[("q1_what", "behaviour")]
    assert replies[4]["reply"] == c.SUFFICIENT_MESSAGE and replies[4]["phase"] == "summary"
    assert st["follow_ups_used"] == 4


def _closed_except(*open_dims):
    """An extraction whose spans are all in CLOSED_LINE and that closes every dimension but open_dims."""
    full = {
        "q1_what": {"behaviour": "missed the bus", "place": "Kent Ridge", "time": "Monday", "persons": "tourists", "conditions": "packed"},
        "q2_often": {"number": "twice", "timeframe": "this week", "context": "mornings"},
        "q3_effect": {"impact_type": "late", "consequence": "late for class", "degree": "10 min"},
        "q4_basis": {"experienced": "I missed"},
    }
    return {"checks": {d: v for d, v in full.items() if d not in open_dims}, "route": "continue", "ack": ""}


CLOSED_LINE = "I missed the bus at Kent Ridge on Monday, packed with tourists, twice this week in the mornings, late for class by 10 min"


def test_hearsay_account_gets_exactly_one_q4_question(fake):
    first = _closed_except("q4_basis")
    second = {**first, "checks": {**first["checks"], "q4_basis": {"mode_stated": "my friend told me"}}}
    fake(first, second)
    st = p.new_state("c"); run(st, action="start_chat")
    r1 = run(st, CLOSED_LINE.replace("I missed", "Someone missed"))
    assert r1["reply"].endswith(c.QUESTIONS[("q4_basis", "experienced")])
    r2 = run(st, "my friend told me")
    assert st["dims"]["q4_basis"]["score"] == 1
    assert r2["reply"] == c.SUFFICIENT_MESSAGE and r2["phase"] == "summary"
    assert [t for t in st["asked"] if t[0] == "q4_basis"] == [["q4_basis", "experienced"]]
    row = next(x for x in p.build_summary(st) if x["key"] == "basis")
    assert row["text"] == "my friend told me"


def test_vague_frequency_gets_one_more_question_at_most_and_never_the_same_one(fake):
    first = _closed_except("q2_often")
    fake(first, first, first, first)
    st = p.new_state("c"); run(st, action="start_chat")
    replies = [run(st, CLOSED_LINE.replace("twice this week in the mornings", "")), run(st, "a lot"),
               run(st, "a lot"), run(st, "a lot")]
    assert replies[0]["reply"].endswith(c.QUESTIONS[("q2_often", "number")])
    q2 = [t for t in st["asked"] if t[0] == "q2_often"]
    assert len(q2) <= 2 and len({tuple(t) for t in q2}) == len(q2)
    assert asked_questions(replies[1:]).count(c.QUESTIONS[("q2_often", "number")]) == 0
    assert st["phase"] == "summary"


def test_fallback_answers_go_to_the_summary_without_the_llm(fake):
    fake()  # any LLM call would fail
    st = p.new_state("c"); run(st, action="start_chat")
    answers = {"q1_what": " The A2 was full ", "q3_effect": "late for class", "q5_better": "", "q4_basis": "  ", "bogus": "x"}
    r = o.handle(st, None, "fallback", "2026-10-28", answers=answers)
    assert r["reply"] == c.SUFFICIENT_MESSAGE and r["phase"] == "summary" and r["unavailable"] is False
    assert st["transcript"] == ["The A2 was full", "late for class"]
    assert st["edits"] == {"what": "The A2 was full", "effect": "late for class"}
    rows = {x["key"]: x for x in p.build_summary(st)}
    assert rows["what"] == {"key": "what", "label": "What happened", "text": "The A2 was full", "status": "edited"}
    assert rows["often"]["status"] == "not_given" and st["follow_ups_used"] == 0


def test_fallback_maps_every_answer_to_its_row(fake):
    fake()
    st = p.new_state("c"); run(st, action="start_chat")
    dims = ["q1_what", "q2_often", "q3_effect", "q4_basis", "q5_better"]
    o.handle(st, None, "fallback", "2026-10-28", answers={d: f"answer {d}" for d in dims})
    assert st["edits"] == {"what": "answer q1_what", "often": "answer q2_often", "effect": "answer q3_effect",
                           "basis": "answer q4_basis", "suggestion": "answer q5_better"}


def test_fallback_with_nothing_written_or_outside_chat_is_a_noop(fake):
    fake()
    st = p.new_state("c"); run(st, action="start_chat")
    r = o.handle(st, None, "fallback", "2026-10-28", answers={"q1_what": "  "})
    assert r["phase"] == "chat" and r["reply"] == c.OPENING and st["transcript"] == []
    st2 = p.new_state("c")
    assert o.handle(st2, None, "fallback", "2026-10-28", answers={"q1_what": "x"})["phase"] == "consent"

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
    assert st["transcript"] == ["the bus"]
    assert r["options"] == [] and st["last_options"] == []

def test_unclear_none_of_these_reasks_without_llm(fake):
    fake({"route": "unclear", "unclear_options": ["the bus"]})
    st = p.new_state("c"); run(st, action="start_chat"); run(st, "it was bad")
    r = run(st, action="option:1")
    assert r["reply"] == c.OPENING and st["follow_ups_used"] == 0 and st["transcript"] == []

def test_unclear_drops_options_with_banned_words(fake):
    fake({"route": "unclear", "unclear_options": ["the bus", "sorry about the food court", "the lift because"]})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "it was bad")
    assert r["options"] == ["the bus", c.NONE_OF_THESE]

def test_unclear_without_options_reasks(fake):
    fake({"route": "unclear"})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "hm")
    assert r["reply"] == c.OPENING and r["options"] == []

@pytest.mark.parametrize("route,text,chips", [
    ("out_of_scope_person", c.OUT_OF_SCOPE_PERSON, ["Continue without the name", "Stop"]),
    ("out_of_scope_appeal", c.OUT_OF_SCOPE_APPEAL, ["Continue with my general experience", "Stop"])])
def test_out_of_scope_fixed_text_uncounted_not_merged(fake, route, text, chips):
    fake({"route": route, "checks": {"q1_what": {"conditions": "packed"}}})
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "packed")
    assert r["reply"] == text and r["chips"] == chips
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
    assert st["transcript"] == [] and r["counter"] == "Up to 5 follow-ups"

def test_no_llm_leaves_state_untouched():
    st = p.new_state("c"); run(st, action="start_chat")
    before = json.dumps(st)
    r = run(st, "x")
    assert r["reply"] == c.NO_LLM_MESSAGE and json.dumps(st) == before

def test_unavailable_flag_marks_both_unavailable_replies(fake):
    fake(llm.LLMError("timeout"))
    st = p.new_state("c"); run(st, action="start_chat")
    assert run(st, "x")["unavailable"] is True

def test_unavailable_flag_when_no_llm_is_configured():
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, "x")
    assert r["reply"] == c.NO_LLM_MESSAGE and r["unavailable"] is True

def test_unavailable_flag_is_false_for_ordinary_replies(fake):
    st = p.new_state("c")
    assert run(st, action="start_chat")["unavailable"] is False
    assert run(st, action="why")["unavailable"] is False
    assert run(st, action="stop")["unavailable"] is False

def test_non_continue_messages_never_enter_the_transcript(fake, monkeypatch):
    sent = []
    outs = [{"route": "out_of_scope_person", "checks": {"q1_what": {"persons": "Prof Tan"}}},
            {"route": "out_of_scope_person"}, {"route": "meta_why"}, {"route": "meta_anonymous"},
            {"route": "stop"}, {"route": "unclear"}, EXTRACTIONS[0]]
    fake(*outs)
    real = llm.chat_json
    def spy(system, messages, max_tokens=800):
        sent.append(" ".join(m["content"] for m in messages))
        return real(system, messages, max_tokens)
    monkeypatch.setattr(llm, "chat_json", spy)
    st = p.new_state("c"); run(st, action="start_chat")
    run(st, "Prof Tan was rude to me")
    for line in ["Continue without the name", "why?", "anon?", "stop", "hm"]: run(st, line)
    assert st["transcript"] == []
    r = run(st, STUDENT[0])
    assert st["transcript"] == [STUDENT[0]] and r["reply"].startswith("Packed buses")
    assert "Prof Tan" in sent[0] and "Prof Tan" not in sent[-1] and "Continue without the name" not in sent[-1]

def test_llm_failure_after_continue_keeps_transcript(fake):
    fake(EXTRACTIONS[0], llm.LLMError("timeout"))
    st = p.new_state("c"); run(st, action="start_chat"); run(st, STUDENT[0])
    run(st, STUDENT[1])
    assert st["transcript"] == [STUDENT[0]]

def test_crisis_pauses_actions_too_except_delete(fake):
    fake({"route": "crisis"}, EXTRACTIONS[0])
    st = p.new_state("c"); run(st, action="start_chat"); run(st, "x")
    before = json.dumps(st)
    for a in ["skip", "why", "anonymous", "stop", "start_chat", "option:0"]:
        r = run(st, action=a)
        assert r["reply"] == c.CRISIS_MESSAGE and json.dumps(st) == before
    assert st["follow_ups_used"] == 0
    assert run(st, action="delete")["phase"] == "deleted" and st["stopped"] is None

def test_messages_outside_chat_phase_run_no_extraction(fake):
    fake()  # any LLM call would pop from an empty list and fail
    st = p.new_state("c")
    assert run(st, "hello")["reply"] == ""
    run(st, action="start_chat"); st["phase"] = "summary"; st["pending_question"] = None
    before = json.dumps(st)
    r = run(st, "one more thing")
    assert r["reply"] == c.SUFFICIENT_MESSAGE and json.dumps(st) == before
    st["phase"] = "deleted"
    assert run(st, "again")["reply"] == "" and json.dumps(st) == before.replace('"summary"', '"deleted"')

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
    assert rec["raw"] == EXTRACTIONS[0]
    assert rec["scores"]["q4_basis"] == 2 and rec["reply"].startswith("Packed buses")
    run(st, STUDENT[1])  # no session_id: nothing more is written
    assert len((tmp_path / "t.jsonl").read_text().splitlines()) == 1

def test_logbook_keeps_session_id_inside_the_log_dir(monkeypatch, tmp_path):
    from backend import logbook
    monkeypatch.setenv("KOPICHAT_LOG_DIR", str(tmp_path / "logs"))
    logbook.append("../evil", {"a": 1})
    assert [f.name for f in (tmp_path / "logs").iterdir()] == ["___evil.jsonl"]
    assert not (tmp_path / "evil.jsonl").exists()


def test_finish_after_a_continue_turn_goes_to_summary(fake):
    fake(EXTRACTIONS[0])
    st = p.new_state("c"); run(st, action="start_chat"); run(st, STUDENT[0])
    used = st["follow_ups_used"]
    r = run(st, action="finish")
    assert r["phase"] == "summary" and r["reply"] == c.SUFFICIENT_MESSAGE and r["chips"] == []
    assert st["pending_question"] is None and st["last_options"] == []
    assert st["follow_ups_used"] == used and r["counter"] == f"Follow-ups used {used} of up to 5"


def test_finish_before_any_answer_is_a_noop(fake):
    fake()
    st = p.new_state("c"); run(st, action="start_chat")
    r = run(st, action="finish")
    assert st["phase"] == "chat" and r["reply"] == c.OPENING and st["pending_question"] == c.OPENING
    assert st["follow_ups_used"] == 0 and r["phase"] == "chat"


def test_finish_outside_chat_phase_is_a_noop(fake):
    fake()
    st = p.new_state("c"); st["transcript"].append("something")
    r = run(st, action="finish")
    assert st["phase"] == "consent" and r["reply"] == ""


def test_delete_removes_the_sessions_log(fake, monkeypatch, tmp_path):
    monkeypatch.setenv("KOPICHAT_LOG_DIR", str(tmp_path))
    fake(EXTRACTIONS[0])
    st = p.new_state("c"); run(st, action="start_chat")
    o.handle(st, STUDENT[0], None, "2026-10-28", session_id="t")
    assert (tmp_path / "t.jsonl").exists()
    o.handle(st, None, "delete", "2026-10-28", session_id="t")
    assert not (tmp_path / "t.jsonl").exists()
    o.handle(st, None, "delete", "2026-10-28", session_id="t")  # nothing to delete: harmless


def test_a_crisis_turn_is_not_logged(fake, monkeypatch, tmp_path):
    monkeypatch.setenv("KOPICHAT_LOG_DIR", str(tmp_path))
    fake({"route": "crisis"})
    st = p.new_state("c"); run(st, action="start_chat")
    r = o.handle(st, "I want to hurt myself", None, "2026-10-28", session_id="t")
    assert r["reply"] == c.CRISIS_MESSAGE
    assert not (tmp_path / "t.jsonl").exists()


def test_storyboard_asks_each_question_once(fake):
    fake(EXTRACTIONS[0], EXTRACTIONS[1], EXTRACTIONS[2], EXTRACTIONS[3], EXTRACTIONS[4])
    st = p.new_state("c"); run(st, action="start_chat")
    for line in STUDENT: run(st, line)
    assert st["asked"] == [["q1_what", "behaviour"], ["q3_effect", "consequence"], ["q2_often", "number"], ["q5_better", "present"]]
