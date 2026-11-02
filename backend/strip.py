"""The NUSSU reviewer's comic strip for one group, built from stored accounts only.

Every caption line is a stored field quoted as the student left it, with who said it and how many of the group said
anything for that panel. Nothing here is written by a model; illustrations come from `ART` and only
illustrate. The cause panel never has art: a picture would state a cause the accounts only suspect. No HTTP here.
"""
from . import content, store as store_mod

UNGROUPED = "ungrouped"
UNGROUPED_NAME = "Not grouped yet"

# Panels in the order of Feedback Schema V2. Each section quotes one summary field.
PANELS = [
    ("what", "What happened", [(None, "what")]),
    ("often", "How often", [(None, "often")]),
    ("effect", "Effect on them", [(None, "effect")]),
    ("read", "Their read on the cause, and what would help",
     [("Their read on the cause: their interpretation, not a finding", "cause"), ("What would help", "suggestion")]),
]
NO_ART = {"read"}


# Illustrations for the NUSSU reviewer's comic strip, by group name. Drawn with gpt-image-2 from the group's reference
# photos and checked by hand for invented detail and pseudo-text (UI design brief 11). "differing" art shows one
# account, named in `shows`; it is used only while that account is in the differing list. A group missing here is
# shown text only.
_MORNING = "/strips/morning-boarding"
ART = {
    "Morning boarding at Kent Ridge MRT": {
        "cover": {"src": f"{_MORNING}/cover.jpg", "alt": "Illustration: students waiting at a covered campus bus stop on a tree-lined road in the morning."},
        "what": {"src": f"{_MORNING}/what.jpg", "alt": "Illustration: a packed shuttle bus at the stop with its door open; two students on the kerb cannot get on."},
        "often": {"src": f"{_MORNING}/often.jpg", "alt": "Illustration: the full shuttle bus drives away from the stop while students left at the kerb watch it go."},
        "effect": {"src": f"{_MORNING}/effect.jpg", "alt": "Illustration: a student with a backpack slips into a tutorial room late while the class is under way."},
        "differing": {"src": f"{_MORNING}/differing.jpg", "shows": "C", "alt": "Illustration: inside a shuttle bus, a suitcase and a bag occupy the wheelchair space."},
    },
    # Account C's own picture is the morning strip's wheelchair-space panel; D's is the tour on the walkway. Each is
    # reused wherever that account appears, in its own group or kept visible in another.
    "Access obstruction": {
        "cover": {"src": "/strips/access-obstruction/cover.jpg", "alt": "Illustration: a shuttle bus waits at a covered stop beside modern campus buildings and a lawn."},
        "what": {"src": f"{_MORNING}/differing.jpg", "alt": "Illustration: inside a shuttle bus, a suitcase and a bag occupy the wheelchair space."},
        "effect": {"src": "/strips/access-obstruction/effect.jpg", "alt": "Illustration: one shuttle bus pulls away from the stop while the next is still far down the road; people wait under the shelter."},
        "differing": {"src": "/strips/no-effect/what.jpg", "shows": "D", "alt": "Illustration: a guide points out a building to a small group of visitors of mixed ages on a covered walkway."},
    },
    "No noticeable boarding effect": {
        "cover": {"src": "/strips/no-effect/cover.jpg", "alt": "Illustration: students walk along a covered walkway towards a bus stop where a few people wait, mid-morning."},
        "what": {"src": "/strips/no-effect/what.jpg", "alt": "Illustration: a guide points out a building to a small group of visitors of mixed ages on a covered walkway."},
        "effect": {"src": "/strips/no-effect/effect.jpg", "alt": "Illustration: students step straight onto a shuttle bus; inside there are free seats."},
        "differing": {"src": f"{_MORNING}/differing.jpg", "shows": "C", "alt": "Illustration: inside a shuttle bus, a suitcase and a bag occupy the wheelchair space."},
    },
    "Lunch queue at Frontier": {
        "cover": {"src": "/strips/lunch-queue/cover.jpg", "alt": "Illustration: a busy covered campus canteen at lunchtime, most tables taken."},
        "what": {"src": "/strips/lunch-queue/what.jpg", "alt": "Illustration: a long queue of students stretches back from one stall past the tables."},
    },
    "Study space at CLB": {
        "cover": {"src": "/strips/study-space/cover.jpg", "alt": "Illustration: students study at long tables with reading lamps in a library reading area."},
        "what": {"src": "/strips/study-space/what.jpg", "alt": "Illustration: two people photograph the library reading area with a phone and a camera while students keep working."},
        "often": {"src": "/strips/study-space/often.jpg", "alt": "Illustration: on another afternoon, a different person photographs the bookshelves while students study."},
    },
}


def _who(account: dict) -> str:
    return account.get("ref_code") or account["id"]


def _line(account: dict, key: str) -> dict:
    field = next((f for f in account["fields"] if f.get("key") == key), None) or {}
    text, status = (field.get("text") or "").strip(), field.get("status", "not_given")
    who = _who(account)
    if text and status in ("quoted", "edited", "explicit_none"):
        note = {"edited": "edited by the student before sending", "explicit_none": "said there was none"}.get(status)
        return {"who": who, "quote": text, "note": note}
    return {"who": who, "quote": None, "note": "skipped" if status == "skipped" else "not said"}


def _section(label: str | None, key: str, members: list[dict]) -> dict:
    said = [_line(m, key) for m in members]
    return {"label": label, "said": said, "count": {"said": sum(1 for l in said if l["quote"]), "of": len(members)}}


def groups(store: store_mod.Store, consultation_id: str) -> list[dict]:
    """Every group with accounts in it, then the ungrouped accounts as one entry when there are any."""
    out = [{**g, "has_art": g["name"] in ART} for g in store.groups(consultation_id)]
    loose = store.ungrouped(consultation_id)
    if loose:
        out.append({"id": UNGROUPED, "name": UNGROUPED_NAME, "theme": "needs_review", "pending": False,
                    "count": len(loose), "has_art": False})
    return out


def locate(store: store_mod.Store, ref_code: str) -> str | None:
    """The group id that holds this reference, UNGROUPED for an account no group holds, or None when it is not there."""
    account = store.account_by_ref(ref_code)
    if account is None or account["withdrawn"]:
        return None
    return account["group_id"] or UNGROUPED


def build(store: store_mod.Store, group_id: str, consultation_id: str = content.CONSULTATION["id"]) -> dict | None:
    """The strip for one group, or for the ungrouped accounts. None when the group does not exist."""
    if group_id == UNGROUPED:
        members = store.ungrouped(consultation_id)
        group = {"id": UNGROUPED, "name": UNGROUPED_NAME, "theme": "needs_review", "pending": False}
        exclude = None
    else:
        info = store.group(group_id)
        if info is None:
            return None
        members = store.group_members(group_id)
        group = {"id": group_id, "name": info["name"], "theme": info["theme"], "pending": info["pending"]}
        exclude = group_id
    art = ART.get(group["name"], {})

    panels = []
    for key, title, sections in PANELS:
        built = [_section(label, field, members) for label, field in sections]
        # A picture only where someone in the group said something: otherwise it would show what nobody reported.
        spoken = any(sec["count"]["said"] for sec in built)
        panels.append({"key": key, "title": title, "art": art.get(key) if spoken and key not in NO_ART else None,
                       "sections": built})

    # Accounts of the same theme that sit outside this group, so a count is never read as "everyone": the differing
    # experience and the no-effect account stay beside the complaint. Other themes have their own groups in the list,
    # so the panel is left out when the theme has nothing outside the group.
    differing = [d for d in store.differing(consultation_id, exclude or "__none__", group["theme"])
                 if d["id"] not in {m["id"] for m in members}]
    if differing:
        shown = art.get("differing")
        panels.append({
            "key": "differing", "title": "Outside this group",
            "art": shown if shown and shown.get("shows") in {d["id"] for d in differing} else None,
            "sections": [{"label": f"Other accounts in {theme_name(group['theme'])}, kept visible",
                          "said": [{"who": d.get("ref_code") or d["id"], "quote": d["excerpt"], "note": d["note"]}
                                   for d in differing],
                          "count": {"said": len(differing), "of": None}}],
        })
    return {"group": {**group, "count": len(members)}, "cover": art.get("cover"), "panels": panels}


def theme_name(key: str) -> str:
    """The theme's name without its definition, lower-cased for a sentence: "transport access and crowding"."""
    label = content.THEMES.get(key, content.THEMES["other"]).split(":", 1)[0].strip()
    return label[:1].lower() + label[1:]
