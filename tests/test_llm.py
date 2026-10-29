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
