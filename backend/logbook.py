"""Per-turn log: one JSON line per turn, one file per session."""
import json
import os
import re
from pathlib import Path

DEFAULT_LOG_DIR = Path(__file__).parent / "logs"


def _log_dir() -> Path:
    return Path(os.environ.get("KOPICHAT_LOG_DIR") or DEFAULT_LOG_DIR)


def append(session_id: str, record: dict) -> None:
    """Append record as one JSON line to <log dir>/<session_id>.jsonl, creating the directory."""
    # session_id can come from a request, so it never gets to name a path outside the log directory
    name = re.sub(r"[^A-Za-z0-9_-]", "_", session_id) or "_"
    directory = _log_dir()
    directory.mkdir(parents=True, exist_ok=True)
    with open(directory / f"{name}.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
