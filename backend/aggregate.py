"""Classification and the aggregate shown to the student after approval.

`classify` asks the LLM to propose a theme and group; code validates it. `build` computes every
number from the store. No number the student sees is ever generated. No HTTP here.
"""
from . import content, llm, prompts, store as store_mod

CLASSIFY_MAX_TOKENS = 200
GROUP_NAME_MAX = 60
NEW_GROUP_PREFIX = "new: "
PENDING_GROUP_NAME = "New group, pending review"  # a model-written group name never reaches the student
CLOSING_LINE = "This is what NUSSU reads before it decides what to raise."
BOARD_MAX = 8  # other accounts sent for the receipt's noticeboard; the screen shows fewer
_NO_GROUP = "__none__"  # sentinel: excludes no group in store.differing


def _fallback() -> dict:
    return {"theme": "needs_review", "group": None, "needs_review": True}


def classify(account: dict, group_names: list[str]) -> dict:
    """Propose {theme, group, needs_review} for an approved account. Never raises."""
    if not llm.enabled():
        return _fallback()
    messages = [{"role": "user", "content": prompts.classify_turn(account, group_names)}]
    try:
        raw = llm.chat_json(prompts.CLASSIFY_SYSTEM, messages, max_tokens=CLASSIFY_MAX_TOKENS)
    except llm.LLMError:
        return _fallback()
    theme = raw.get("theme")
    if not isinstance(theme, str) or theme not in content.THEMES:
        return _fallback()
    return {"theme": theme, "group": _valid_group(raw.get("group"), group_names),
            "needs_review": bool(raw.get("needs_review"))}


def _valid_group(group, group_names: list[str]) -> str | None:
    if not isinstance(group, str):
        return None
    if group in group_names:
        return group
    if group.startswith(NEW_GROUP_PREFIX) and group[len(NEW_GROUP_PREFIX):].strip():
        return group[:GROUP_NAME_MAX]
    return None


def build(store: store_mod.Store, account_id: str) -> dict:
    """The provisional aggregate for one stored account, computed from the store only."""
    account = store.get(account_id)
    counts = store.counts(account["consultation_id"])
    group_id = account["group_id"]
    if group_id:
        members = store.group_members(group_id)
        info = store.group(group_id) or {"name": None, "pending": False}
        others = [{"id": m["id"], "excerpt": m["excerpt"]} for m in members if m["id"] != account_id]
        said = sum(1 for m in members if _often_score(m) == 2)
        group = {"name": PENDING_GROUP_NAME if info["pending"] else info["name"], "pending": info["pending"],
                 "count": len(members), "others": others}
        coverage = {"said": said, "of": len(members)}
    else:
        group = {"name": None, "pending": False, "count": 1, "others": []}
        coverage = {"said": 1 if _often_score(account) == 2 else 0, "of": 1}
    differing = [d for d in store.differing(account["consultation_id"], group_id or _NO_GROUP)
                 if d["id"] != account_id]
    # The rest of the board: accounts in neither the student's group nor the differing list.
    shown = {account_id, *(o["id"] for o in group["others"]), *(d["id"] for d in differing)}
    board = [{"id": b["id"], "excerpt": b["excerpt"], "theme": b["theme"]}
             for b in store.accounts(account["consultation_id"]) if b["id"] not in shown][:BOARD_MAX]
    return {
        "provisional": True,
        "theme": account["theme"],
        "needs_review": account["needs_review"] or account["theme"] == "needs_review",
        "group": group,
        "contributors": counts["contributors"],
        "seeds": counts["seeds"],
        "differing": [{"id": d["id"], "excerpt": d["excerpt"], "note": d["note"], "theme": d["theme"]} for d in differing],
        "board": board,
        "coverage": {"how_often": coverage},
        "closing_line": CLOSING_LINE,
    }


def _often_score(account: dict) -> int:
    return (account.get("scores", {}).get("q2_often") or {}).get("score", 0)
