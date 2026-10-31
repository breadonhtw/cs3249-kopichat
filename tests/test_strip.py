import pytest
from backend import strip as T, store as S, policy as p, content


@pytest.fixture
def db(tmp_path):
    s = S.Store(str(tmp_path / "t.db")); s.init(); return s


MORNING = "Morning boarding at Kent Ridge MRT"


def _panel(strip, key):
    return next(x for x in strip["panels"] if x["key"] == key)


def _submit(db, sid="s1", fields=None, group=MORNING):
    st = p.new_state("campus-visitors-2026"); st["approved"] = True
    a = db.submit(sid, st, fields or [
        {"key": "what", "label": "What happened", "text": "Couldn't get onto the first A2", "status": "quoted"},
        {"key": "often", "label": "How often", "text": "3 times in the last 2 weeks", "status": "edited"},
        {"key": "effect", "label": "Effect on you", "text": "", "status": "skipped"},
    ])
    db.assign(a["id"], "transport" if group else "needs_review", group, group is None)
    return db.get(a["id"])


def test_groups_list_counts_members_and_marks_art(db):
    groups = T.groups(db, "campus-visitors-2026")
    morning = next(g for g in groups if g["name"] == MORNING)
    assert morning["count"] == 2 and morning["theme"] == "transport" and morning["has_art"] is True
    assert all(g["count"] >= 1 for g in groups)
    assert next(g for g in groups if g["name"] == "Lunch queue at Frontier")["has_art"] is False


def test_seed_strip_quotes_every_member_and_counts_who_said_it(db):
    gid = db.group_id_for(MORNING)
    s = T.build(db, gid)
    assert s["group"]["name"] == MORNING and s["group"]["count"] == 2 and s["group"]["pending"] is False
    assert [x["key"] for x in s["panels"]] == ["what", "often", "effect", "read", "differing"]
    what = _panel(s, "what")["sections"][0]
    assert what["count"] == {"said": 2, "of": 2}
    assert {l["who"]: l["quote"] for l in what["said"]} == {
        "A": "Couldn't board two A2 buses at Kent Ridge MRT, around 8.30 to 9am",
        "B": "The A2 was full at Kent Ridge MRT at about 9am"}
    often = _panel(s, "often")["sections"][0]
    assert often["count"] == {"said": 1, "of": 2}
    assert {l["who"]: (l["quote"], l["note"]) for l in often["said"]}["B"] == (None, "not said")


def test_the_read_panel_keeps_cause_and_suggestion_apart_and_has_no_art(db):
    s = T.build(db, db.group_id_for(MORNING))
    read = _panel(s, "read")
    assert read["art"] is None
    cause, helps = read["sections"]
    assert cause["label"].startswith("Their read on the cause")
    assert {l["who"]: l["quote"] for l in cause["said"]} == {"A": "I think the visitors are a factor", "B": "no idea why, just full"}
    assert helps["count"] == {"said": 0, "of": 2}


def test_differing_accounts_are_kept_with_their_notes(db):
    s = T.build(db, db.group_id_for(MORNING))
    diff = _panel(s, "differing")["sections"][0]
    assert {l["who"]: l["note"] for l in diff["said"]} == {
        "C": "a single account, kept visible", "D": "a student guide; no noticeable effect"}
    assert diff["count"] == {"said": 2, "of": None}


def test_a_live_account_is_named_by_its_reference_and_edits_and_skips_are_marked(db):
    a = _submit(db)
    s = T.build(db, db.group_id_for(MORNING))
    often = {l["who"]: l for l in _panel(s, "often")["sections"][0]["said"]}
    assert often[a["ref_code"]]["quote"] == "3 times in the last 2 weeks"
    assert often[a["ref_code"]]["note"] == "edited by the student before sending"
    effect = {l["who"]: l for l in _panel(s, "effect")["sections"][0]["said"]}
    assert effect[a["ref_code"]] == {"who": a["ref_code"], "quote": None, "note": "skipped"}
    assert s["group"]["count"] == 3


def test_art_comes_from_the_table_and_differing_art_needs_its_account(db):
    s = T.build(db, db.group_id_for(MORNING))
    assert s["cover"] == T.ART[MORNING]["cover"]
    assert _panel(s, "what")["art"]["src"].endswith(".jpg")
    assert _panel(s, "differing")["art"] is not None
    db.withdraw("C")
    assert _panel(T.build(db, db.group_id_for(MORNING)), "differing")["art"] is None


def test_a_group_without_art_is_text_only(db):
    s = T.build(db, db.group_id_for("Lunch queue at Frontier"))
    assert s["cover"] is None and all(x["art"] is None for x in s["panels"])


def test_withdrawn_members_leave_the_strip(db):
    db.withdraw("B")
    s = T.build(db, db.group_id_for(MORNING))
    assert s["group"]["count"] == 1
    assert [l["who"] for l in _panel(s, "what")["sections"][0]["said"]] == ["A"]


def test_ungrouped_accounts_have_their_own_strip(db):
    assert not any(g["id"] == T.UNGROUPED for g in T.groups(db, "campus-visitors-2026"))
    a = _submit(db, group=None)
    listed = next(g for g in T.groups(db, "campus-visitors-2026") if g["id"] == T.UNGROUPED)
    assert listed["count"] == 1 and listed["name"] == "Not grouped yet"
    s = T.build(db, T.UNGROUPED, "campus-visitors-2026")
    assert [l["who"] for l in _panel(s, "what")["sections"][0]["said"]] == [a["ref_code"]]
    assert s["cover"] is None


def test_unknown_group_is_none(db):
    assert T.build(db, "nope") is None


def test_locate_finds_the_group_that_holds_a_reference(db):
    a = _submit(db)
    assert T.locate(db, a["ref_code"]) == db.group_id_for(MORNING)
    loose = _submit(db, sid="s2", group=None)
    assert T.locate(db, loose["ref_code"]) == T.UNGROUPED


def test_locate_gives_nothing_for_unknown_or_withdrawn_references(db):
    assert T.locate(db, "KR-0000") is None
    a = _submit(db)
    db.withdraw(a["id"])
    assert T.locate(db, a["ref_code"]) is None
