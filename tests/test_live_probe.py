"""The pure parts of scripts/live_probe.py, plus one API-level check of the unavailable path.
The probe itself makes real model calls and never runs here."""
import pytest
from fastapi.testclient import TestClient

from backend import llm
from tests.fixtures.storyboard import EXTRACTIONS, STUDENT


@pytest.fixture
def client(monkeypatch, tmp_path):
    from backend import app as a
    a.STORE = a.store.Store(str(tmp_path / "t.db")); a.STORE.init(); a.SESSIONS.clear()
    return TestClient(a.app)


def test_every_scenario_has_name_topic_turns_expect():
    from scripts import live_probe as lp
    names = [s["name"] for s in lp.SCENARIOS]
    assert len(names) == len(set(names)) == 14
    assert all(s["topic"] in ("visitors", "study") and s["turns"] for s in lp.SCENARIOS)


def test_check_turn_flags_wrong_route_and_counter_over_five():
    from scripts import live_probe as lp
    exp = {"routes": {0: ["unclear"]}}
    assert lp.check_turn(exp, 0, {"phase": "chat", "state": {"follow_ups_used": 2}, "options": []}, "continue")
    assert lp.check_turn({}, 0, {"phase": "chat", "state": {"follow_ups_used": 6}, "options": []}, "continue")
    assert lp.check_turn({}, 0, {"phase": "chat", "state": {"follow_ups_used": 2}, "options": []}, "continue") == []


def test_summary_is_extractive_reports_invented_span():
    from scripts import live_probe as lp
    rows = [{"key": "what", "label": "What happened", "text": "packed bus; a fire", "status": "quoted"},
            {"key": "often", "label": "How often", "text": "my own edit", "status": "edited"}]
    assert lp.summary_is_extractive(rows, ["the packed bus at 8.45"]) == ["a fire"]


def test_main_refuses_under_pytest():
    from scripts import live_probe as lp
    assert lp.main(["--runs", "1"]) != 0


def test_write_report_makes_md_and_jsonl(tmp_path):
    from scripts import live_probe as lp
    lp.write_report([{"name": "x", "run": 1, "passed": True, "turns": [], "summary_failures": []}], tmp_path)
    assert (tmp_path / "results.md").read_text().count("| x | 1 |") == 1
    assert (tmp_path / "results.jsonl").exists()


def test_probe_unavailable_keeps_counter(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    outs = [EXTRACTIONS[0], llm.LLMError("timeout"), EXTRACTIONS[1]]

    def chat_json(*a, **k):
        r = outs.pop(0)
        if isinstance(r, Exception):
            raise r
        return r
    monkeypatch.setattr(llm, "chat_json", chat_json)
    client.post("/api/session", json={"session_id": "u"})
    client.post("/api/consent", json={"session_id": "u", "agreed": True})
    client.post("/api/overall", json={"session_id": "u", "value": "Negatively"})
    t1 = client.post("/api/turn", json={"session_id": "u", "message": STUDENT[0]}).json()
    used = t1["state"]["follow_ups_used"]
    t2 = client.post("/api/turn", json={"session_id": "u", "message": STUDENT[1]}).json()
    assert t2["unavailable"] is True and t2["state"]["follow_ups_used"] == used and t2["phase"] == "chat"
    t3 = client.post("/api/turn", json={"session_id": "u", "message": STUDENT[1]}).json()
    assert t3["unavailable"] is False and t3["state"]["follow_ups_used"] == used + 1
