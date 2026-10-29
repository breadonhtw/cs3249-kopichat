"""Per-turn log: one JSON line per turn, one file per session."""
import json
import os
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOG_DIR = REPO_ROOT / "backend" / "logs"


def _log_dir() -> Path:
    return Path(os.environ.get("KOPICHAT_LOG_DIR") or DEFAULT_LOG_DIR)


def _path(session_id: str) -> Path:
    # session_id can come from a request, so it never gets to name a path outside the log directory
    name = re.sub(r"[^A-Za-z0-9_-]", "_", session_id) or "_"
    return _log_dir() / f"{name}.jsonl"


def append(session_id: str, record: dict) -> None:
    """Append record as one JSON line to <log dir>/<session_id>.jsonl, creating the directory."""
    path = _path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def delete(session_id: str) -> None:
    """Remove the session's log file, if there is one."""
    _path(session_id).unlink(missing_ok=True)
