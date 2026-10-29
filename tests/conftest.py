import pytest


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    """Tests never call a real LLM, even if your .env has an API key."""
    monkeypatch.setenv("LLM_PROVIDER", "none")


@pytest.fixture(autouse=True)
def isolated_paths(monkeypatch, tmp_path):
    """No test writes a database or logs into the repo, even on the first import of backend.app."""
    monkeypatch.setenv("KOPICHAT_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("KOPICHAT_LOG_DIR", str(tmp_path / "logs"))
