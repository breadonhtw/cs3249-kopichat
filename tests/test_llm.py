# tests/test_llm.py
import importlib, os, pytest
from backend import llm

def test_no_key_in_source():
    src = open(os.path.join(os.path.dirname(llm.__file__), "llm.py")).read()
    assert 'OPENAI_API_KEY = ""' in src and 'ANTHROPIC_API_KEY = ""' in src

def test_disabled_without_provider():
    assert llm.enabled() is False
    with pytest.raises(llm.LLMError):
        llm.chat("s", [{"role": "user", "content": "x"}])

def test_parse_json_tolerates_fences():
    assert llm.parse_json('```json\n{"a": 1}\n```') == {"a": 1}

def test_blank_timeout_env_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT", "")
    try:
        importlib.reload(llm)
        assert llm.TIMEOUT_SECONDS == 8.0
    finally:
        monkeypatch.undo()
        importlib.reload(llm)


def test_enabled_needs_a_key_for_the_chosen_provider(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setattr(llm, "OPENAI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    assert llm.enabled() is False
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    assert llm.enabled() is True


def test_enabled_needs_an_anthropic_key_too(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    assert llm.enabled() is False
    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-key")
    assert llm.enabled() is True


def test_provider_is_auto_detected_from_an_anthropic_key(monkeypatch):
    assert llm.LLM_PROVIDER == ""
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(llm, "OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-key")
    assert llm.provider() == "anthropic" and llm.enabled() is True


def test_provider_is_auto_detected_from_an_openai_key(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(llm, "ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    assert llm.provider() == "openai" and llm.enabled() is True


def test_env_example_matches_the_code():
    text = open(os.path.join(os.path.dirname(llm.__file__), "..", ".env.example")).read()
    assert "ANTHROPIC_API_KEY=" in text and "LLM_PROVIDER=\n" in text and "LLM_MODEL=\n" in text
    assert "whichever key is set" in text
