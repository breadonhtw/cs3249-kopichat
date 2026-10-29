# tests/test_extract.py
import pytest
from backend import extract as x, llm

T = ["The buses are always packed, damn frustrating. I was late again.",
     "Kent Ridge MRT yesterday, around 8.45am. Couldn't get onto the first A2."]

def test_spans_must_be_substrings():
    raw = {"checks": {"q1_what": {"place": "Kent Ridge MRT", "time": "around 8.45am", "persons": "a tour guide"}}}
    out = x.validate_extraction(raw, T)
    assert out["checks"]["q1_what"]["place"] == "Kent Ridge MRT"
    assert out["checks"]["q1_what"]["persons"] is None

def test_case_and_whitespace_insensitive():
    raw = {"checks": {"q1_what": {"behaviour": "couldn't  get onto the FIRST A2"}}}
    assert x.validate_extraction(raw, T)["checks"]["q1_what"]["behaviour"] is not None

def test_unknown_keys_and_routes_dropped():
    raw = {"checks": {"q9": {"x": "y"}, "q1_what": {"colour": "blue"}}, "route": "send_everything", "ack": "x"}
    out = x.validate_extraction(raw, T)
    assert "q9" not in out["checks"] and "colour" not in out["checks"]["q1_what"] and out["route"] == "continue"

def test_ack_rules():
    assert x.validate_extraction({"ack": "That sounds frustrating."}, T)["ack"] == ""
    assert len(x.validate_extraction({"ack": "a" * 200}, T)["ack"]) == 80

def test_singlish_spans_validate():
    t = ["damn jialat, bus always full one, late for tut again sia"]
    raw = {"checks": {"q1_what": {"conditions": "bus always full one"}, "q3_effect": {"impact_type": "late for tut"}}}
    out = x.validate_extraction(raw, t)
    assert out["checks"]["q1_what"]["conditions"] and out["checks"]["q3_effect"]["impact_type"]

def test_long_message_truncated_in_prompt():
    from backend import prompts
    msg = "x" * 2000
    assert len(prompts.extract_turn([msg], "2026-10-28")) < 1000

def test_extract_raises_on_llm_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: (_ for _ in ()).throw(llm.LLMError("timeout")))
    with pytest.raises(llm.LLMError):
        x.extract(T, "2026-10-28")
