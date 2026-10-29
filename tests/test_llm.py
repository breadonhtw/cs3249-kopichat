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


def test_base_url_in_env_wins_over_the_soclaas_default(monkeypatch):
    monkeypatch.setattr(llm, "_clients", {})
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    assert str(llm._client("openai").base_url).startswith("https://api.openai.com/v1")


def test_base_url_falls_back_to_soclaas(monkeypatch):
    monkeypatch.setattr(llm, "_clients", {})
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    assert str(llm._client("openai").base_url).startswith("https://soclaas-api.comp.nus.edu.sg/v1")


def test_anthropic_call_sends_no_temperature(monkeypatch):
    # anthropic>=2 rejects temperature as an unknown argument.
    sent = {}

    class Messages:
        def create(self, **kwargs):
            sent.update(kwargs)
            return type("Resp", (), {"content": [type("Block", (), {"type": "text", "text": "{}"})()]})()

    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "_clients", {"anthropic": type("Client", (), {"messages": Messages()})()})
    assert llm.chat("system", [{"role": "user", "content": "hi"}]) == "{}"
    assert "temperature" not in sent


class _BadRequest(Exception):
    status_code = 400


def _fake_anthropic(monkeypatch, refuse_disabled):
    calls = []

    class Messages:
        def create(self, **kwargs):
            calls.append(kwargs.get("thinking"))
            if refuse_disabled and kwargs.get("thinking") == {"type": "disabled"}:
                raise _BadRequest('"thinking.type.disabled" is not supported for this model.')
            return type("Resp", (), {"content": [type("Block", (), {"type": "text", "text": "{}"})()]})()

    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(llm, "_clients", {"anthropic": type("Client", (), {"messages": Messages()})()})
    monkeypatch.setattr(llm, "_THINKING_OFF", {})
    return calls


def test_anthropic_call_turns_thinking_off(monkeypatch):
    # A model that thinks by default spends max_tokens on thinking and returns no text.
    calls = _fake_anthropic(monkeypatch, refuse_disabled=False)
    llm.chat("system", [{"role": "user", "content": "hi"}])
    assert calls == [{"type": "disabled"}]


def test_anthropic_falls_back_to_between_tools_and_remembers(monkeypatch):
    calls = _fake_anthropic(monkeypatch, refuse_disabled=True)
    assert llm.chat("system", [{"role": "user", "content": "hi"}]) == "{}"
    assert llm.chat("system", [{"role": "user", "content": "hi"}]) == "{}"
    assert calls == [{"type": "disabled"}, {"type": "between_tools"}, {"type": "between_tools"}]


def test_env_example_matches_the_code():
    text = open(os.path.join(os.path.dirname(llm.__file__), "..", ".env.example")).read()
    assert "ANTHROPIC_API_KEY=" in text and "LLM_PROVIDER=\n" in text and "LLM_MODEL=\n" in text
    assert "whichever key is set" in text
