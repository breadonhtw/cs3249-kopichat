"""The question phraser: the model words a question the code chose, and the code checks the words."""
import pytest

from backend import content, llm, orchestrator as o, phrase, policy as p

FIXED = content.QUESTIONS[("q2_often", "timeframe")]


def test_flag_off_by_default(monkeypatch):
    monkeypatch.delenv("PHRASE_QUESTIONS", raising=False)
    assert phrase.enabled() is False
    monkeypatch.setenv("PHRASE_QUESTIONS", "1")
    assert phrase.enabled() is True


@pytest.mark.parametrize("text", [
    "Over how long has that been happening, roughly?",
    "And over how long, roughly?",
])
def test_a_plain_question_in_the_register_passes(text):
    assert phrase.validate_question(text, FIXED) == text


@pytest.mark.parametrize("text", [
    "Were there visitors on the bus at the time?",          # names a cause
    "Was it a tour group that filled the bus?",             # names a cause
    "Sorry to hear that, over how long?",                   # sympathy
    "That sounds frustrating. Over what period?",           # feeling, two sentences
    "Over what period? And how often?",                     # two questions
    "Over what period.",                                    # not a question
    "",                                                     # empty
    None,                                                   # not a string
    "I think the buses are always full in the mornings, so over what period would you say this has been going on for you?",  # too long
    "I need to know the period for my records?",            # the agent about itself
])
def test_a_sentence_that_breaks_a_rule_is_refused(text):
    assert phrase.validate_question(text, FIXED) is None


def test_the_fixed_wording_itself_passes():
    assert phrase.validate_question(FIXED, FIXED) == FIXED


def test_turn_lists_what_is_met_and_the_recent_words():
    st = p.new_state("c")
    st["dims"]["q1_what"]["checks"]["place"] = "Kent Ridge MRT"
    st["transcript"] = ["one", "two", "three"]
    turn = phrase.phrase_turn(FIXED, ("q2_often", "timeframe"), phrase.met_spans(st), st["transcript"][-2:], "Three times.")
    assert f"Ask for: {FIXED}" in turn and "q1_what.place: Kent Ridge MRT" in turn
    assert "- two" in turn and "- three" in turn and "- one" not in turn
    assert "Three times." in turn


def test_phrase_question_falls_back_on_a_failed_call(monkeypatch):
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: (_ for _ in ()).throw(llm.LLMError("down")))
    assert phrase.phrase_question(FIXED, ("q2_often", "timeframe"), p.new_state("c")) is None


def test_phrase_question_returns_the_checked_sentence(monkeypatch):
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: {"question": "Over how long, roughly?"})
    assert phrase.phrase_question(FIXED, ("q2_often", "timeframe"), p.new_state("c")) == "Over how long, roughly?"
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: {"question": "Were visitors the problem?"})
    assert phrase.phrase_question(FIXED, ("q2_often", "timeframe"), p.new_state("c")) is None


def test_ask_next_uses_the_model_wording_only_when_the_flag_is_on(monkeypatch):
    calls = []
    monkeypatch.setattr(phrase, "phrase_question", lambda fixed, target, state, ack="": calls.append(target) or "Over how long, roughly?")
    st = p.new_state("c"); st["phase"] = "chat"; st["transcript"] = ["x"]
    st["dims"]["q1_what"]["checks"].update(behaviour="a", place="b", time="c", conditions="d", location="e")
    st["dims"]["q3_effect"]["checks"].update(impact_type="t", consequence="c", degree="d")
    st["dims"]["q4_basis"]["checks"]["experienced"] = "me"
    st["dims"]["q2_often"]["checks"]["number"] = "3 times"
    p.apply_extraction(st, {"checks": {}})
    monkeypatch.delenv("PHRASE_QUESTIONS", raising=False)
    reply = o._ask_next(dict(st), "Three times.")
    assert reply.endswith(FIXED) and calls == []
    monkeypatch.setenv("PHRASE_QUESTIONS", "1")
    st2 = dict(st); st2["asked"] = []; st2["follow_ups_used"] = 0
    reply = o._ask_next(st2, "Three times.")
    assert reply == "Three times. Over how long, roughly?" and calls == [("q2_often", "timeframe")]
    assert st2["pending_question"] == "Over how long, roughly?" and st2["question_source"] == "model"
