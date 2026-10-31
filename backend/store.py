"""SQLite store for submitted accounts. The only place an account is ever written.

No HTTP, no LLM. `Store.submit` is the guard: nothing is written unless the student
has approved (`state["approved"] is True`).
"""
import json
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

SEEDS_PATH = Path(__file__).with_name("seeds.json")
EXCERPT_LEN = 60
_JSON_COLS = ("fields", "scores", "transcript", "interpretation")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    pending INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    ref_code TEXT UNIQUE,
    session_id TEXT UNIQUE,
    consultation_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    overall TEXT,
    fields TEXT NOT NULL,
    scores TEXT NOT NULL,
    transcript TEXT NOT NULL,
    interpretation TEXT NOT NULL,
    theme TEXT,
    group_id TEXT,
    needs_review INTEGER NOT NULL DEFAULT 0,
    is_seed INTEGER NOT NULL DEFAULT 0,
    withdrawn INTEGER NOT NULL DEFAULT 0,
    excerpt TEXT NOT NULL DEFAULT '',
    standalone INTEGER NOT NULL DEFAULT 0,
    note TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
    account_id TEXT PRIMARY KEY,
    contact TEXT NOT NULL
);
"""


class NotApproved(Exception):
    """Raised when a submit is attempted before the student approved the summary."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path: str):
        self.path = path

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    # --- lifecycle -------------------------------------------------------

    def init(self) -> None:
        with self._conn() as c:
            c.executescript(_SCHEMA)
            # a database made before groups had a pending flag gets the column
            if "pending" not in {r["name"] for r in c.execute("PRAGMA table_info(groups)")}:
                c.execute("ALTER TABLE groups ADD COLUMN pending INTEGER NOT NULL DEFAULT 0")
            if c.execute("SELECT COUNT(*) FROM accounts").fetchone()[0] == 0:
                self._load_seeds(c)

    def reset(self) -> None:
        with self._conn() as c:
            c.executescript("DROP TABLE IF EXISTS contacts; DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS groups;")
        self.init()

    def _load_seeds(self, c: sqlite3.Connection) -> None:
        doc = json.loads(SEEDS_PATH.read_text(encoding="utf-8"))
        for g in doc["groups"]:
            self._group_id(c, g["theme"], g["name"])
        for a in doc["accounts"]:
            gid = self._group_id(c, a["theme"], a["group"]) if a.get("group") else None
            c.execute(
                "INSERT INTO accounts (id, ref_code, session_id, consultation_id, created_at, overall, fields, scores,"
                " transcript, interpretation, theme, group_id, needs_review, is_seed, withdrawn, excerpt, standalone, note)"
                " VALUES (?, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?, ?)",
                (a["id"], a["consultation_id"], _now(), json.dumps(a["fields"]), json.dumps(a["scores"]),
                 json.dumps(a.get("transcript", [])), json.dumps(a.get("interpretation", {"cause": None, "uncertain": False})),
                 a["theme"], gid, a["excerpt"][:EXCERPT_LEN], int(bool(a.get("standalone"))), a.get("note")))

    # --- helpers ---------------------------------------------------------

    @staticmethod
    def _group_id(c: sqlite3.Connection, theme: str, name: str, pending: bool = False) -> str:
        """The id of the group with this name, creating it if needed. A group created from a model's
        proposal is pending until a reviewer names it; an existing group keeps its own flag."""
        row = c.execute("SELECT id FROM groups WHERE name = ?", (name,)).fetchone()
        if row:
            return row["id"]
        gid = uuid.uuid4().hex
        c.execute("INSERT INTO groups (id, theme, name, pending) VALUES (?, ?, ?, ?)", (gid, theme, name, int(pending)))
        return gid

    @staticmethod
    def _account(row: sqlite3.Row) -> dict:
        d = dict(row)
        for col in _JSON_COLS:
            d[col] = json.loads(d[col])
        for col in ("needs_review", "is_seed", "withdrawn", "standalone"):
            d[col] = bool(d[col])
        return d

    @staticmethod
    def _new_ref_code(c: sqlite3.Connection) -> str:
        for _ in range(200):
            code = f"KR-{secrets.randbelow(10000):04d}"
            if not c.execute("SELECT 1 FROM accounts WHERE ref_code = ?", (code,)).fetchone():
                return code
        raise RuntimeError("no free reference codes")

    @staticmethod
    def _require(c: sqlite3.Connection, account_id: str) -> None:
        if not c.execute("SELECT 1 FROM accounts WHERE id = ?", (account_id,)).fetchone():
            raise KeyError(account_id)

    # --- writes ----------------------------------------------------------

    def submit(self, session_id: str, state: dict, summary: list[dict]) -> dict:
        """Store the approved account. Idempotent per session_id."""
        if state.get("approved") is not True:
            raise NotApproved("the student has not approved the summary")
        what = next((r.get("text") or "" for r in summary if r.get("key") == "what"), "")
        with self._conn() as c:
            c.execute("BEGIN IMMEDIATE")
            existing = c.execute("SELECT * FROM accounts WHERE session_id = ?", (session_id,)).fetchone()
            if existing:
                return self._account(existing)
            account_id = uuid.uuid4().hex
            c.execute(
                "INSERT INTO accounts (id, ref_code, session_id, consultation_id, created_at, overall, fields, scores,"
                " transcript, interpretation, theme, group_id, needs_review, is_seed, withdrawn, excerpt)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 0, ?)",
                (account_id, self._new_ref_code(c), session_id, state["consultation_id"], _now(), state.get("overall"),
                 json.dumps(summary),
                 json.dumps({d: {"score": v["score"], "state": v["state"]} for d, v in state["dims"].items()}),
                 json.dumps(state.get("transcript", [])), json.dumps(state.get("interpretation", {})),
                 what[:EXCERPT_LEN]))
            return self._account(c.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone())

    def assign(self, account_id: str, theme: str, group_name: str | None, needs_review: bool,
               new_group: bool = False) -> None:
        """File the account. new_group marks a group the model proposed; it is created pending."""
        with self._conn() as c:
            self._require(c, account_id)
            gid = self._group_id(c, theme, group_name, pending=new_group) if group_name else None
            c.execute("UPDATE accounts SET theme = ?, group_id = ?, needs_review = ? WHERE id = ?",
                      (theme, gid, int(bool(needs_review)), account_id))

    def withdraw(self, account_id: str) -> None:
        with self._conn() as c:
            self._require(c, account_id)
            c.execute("UPDATE accounts SET withdrawn = 1 WHERE id = ?", (account_id,))

    def set_contact(self, account_id: str, contact: str) -> None:
        with self._conn() as c:
            self._require(c, account_id)
            c.execute("INSERT OR REPLACE INTO contacts (account_id, contact) VALUES (?, ?)", (account_id, contact))

    def clear_contact(self, account_id: str) -> None:
        with self._conn() as c:
            self._require(c, account_id)
            c.execute("DELETE FROM contacts WHERE account_id = ?", (account_id,))

    # --- reads (withdrawn accounts never appear) ---------------------------

    def get(self, account_id: str) -> dict:
        with self._conn() as c:
            row = c.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not row:
            raise KeyError(account_id)
        return self._account(row)

    def account_by_ref(self, ref_code: str) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM accounts WHERE ref_code = ?", (ref_code,)).fetchone()
        return self._account(row) if row else None

    def account_for_session(self, session_id: str) -> dict | None:
        """The account this session submitted, withdrawn or not, or None."""
        with self._conn() as c:
            row = c.execute("SELECT * FROM accounts WHERE session_id = ?", (session_id,)).fetchone()
        return self._account(row) if row else None

    def group(self, group_id: str) -> dict | None:
        """{name, theme, pending} for a group id, or None."""
        with self._conn() as c:
            row = c.execute("SELECT name, theme, pending FROM groups WHERE id = ?", (group_id,)).fetchone()
        return {"name": row["name"], "theme": row["theme"], "pending": bool(row["pending"])} if row else None

    def group_id_for(self, name: str) -> str | None:
        with self._conn() as c:
            row = c.execute("SELECT id FROM groups WHERE name = ?", (name,)).fetchone()
        return row["id"] if row else None

    def group_members(self, group_id: str) -> list[dict]:
        with self._conn() as c:
            rows = c.execute("SELECT * FROM accounts WHERE group_id = ? AND withdrawn = 0 ORDER BY created_at, id",
                             (group_id,)).fetchall()
        return [self._account(r) for r in rows]

    def group_members_by_name(self, name: str) -> list[dict]:
        gid = self.group_id_for(name)
        return self.group_members(gid) if gid else []

    def counts(self, consultation_id: str) -> dict:
        with self._conn() as c:
            where = "consultation_id = ? AND withdrawn = 0"
            contributors, seeds = c.execute(
                f"SELECT COUNT(*), COALESCE(SUM(is_seed), 0) FROM accounts WHERE {where}", (consultation_id,)).fetchone()
            by_theme = {r["theme"]: r["n"] for r in c.execute(
                f"SELECT theme, COUNT(*) AS n FROM accounts WHERE {where} AND theme IS NOT NULL GROUP BY theme",
                (consultation_id,))}
            by_group = {r["name"]: r["n"] for r in c.execute(
                "SELECT g.name AS name, COUNT(*) AS n FROM accounts a JOIN groups g ON g.id = a.group_id"
                " WHERE a.consultation_id = ? AND a.withdrawn = 0 GROUP BY g.name", (consultation_id,))}
        return {"contributors": contributors, "seeds": seeds, "by_theme": by_theme, "by_group": by_group}

    def groups(self, consultation_id: str) -> list[dict]:
        """Groups with at least one account still in the consultation, largest first."""
        with self._conn() as c:
            rows = c.execute(
                "SELECT g.id, g.name, g.theme, g.pending, COUNT(*) AS n FROM groups g JOIN accounts a ON a.group_id = g.id"
                " WHERE a.consultation_id = ? AND a.withdrawn = 0 GROUP BY g.id ORDER BY n DESC, g.name",
                (consultation_id,)).fetchall()
        return [{"id": r["id"], "name": r["name"], "theme": r["theme"], "pending": bool(r["pending"]), "count": r["n"]}
                for r in rows]

    def ungrouped(self, consultation_id: str) -> list[dict]:
        """Accounts no group holds yet, oldest first: what a reviewer still has to place."""
        with self._conn() as c:
            rows = c.execute("SELECT * FROM accounts WHERE consultation_id = ? AND withdrawn = 0 AND group_id IS NULL"
                             " ORDER BY created_at, id", (consultation_id,)).fetchall()
        return [self._account(r) for r in rows]

    def accounts(self, consultation_id: str) -> list[dict]:
        """Every account still in the consultation, oldest first: id, excerpt and theme only."""
        with self._conn() as c:
            rows = c.execute("SELECT id, excerpt, theme FROM accounts WHERE consultation_id = ? AND withdrawn = 0"
                             " ORDER BY created_at, id", (consultation_id,)).fetchall()
        return [dict(r) for r in rows]

    def differing(self, consultation_id: str, exclude_group_id: str | None) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM accounts WHERE consultation_id = ? AND withdrawn = 0 AND group_id IS NOT ?"
                " ORDER BY created_at, id", (consultation_id, exclude_group_id)).fetchall()
        out = []
        for r in rows:
            a = self._account(r)
            effect = next((f for f in a["fields"] if f.get("key") == "effect"), None)
            if a["standalone"] or (effect and effect.get("status") == "explicit_none"):
                out.append({"id": a["id"], "excerpt": a["excerpt"], "note": a["note"] or "no effect reported",
                            "theme": a["theme"], "ref_code": a["ref_code"]})
        return out
