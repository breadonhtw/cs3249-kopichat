import pytest
from backend import store as S, policy as p

CID = "campus-visitors-2026"


@pytest.fixture
def db(tmp_path):
    s = S.Store(str(tmp_path / "t.db")); s.init(); return s


def approved_state():
    st = p.new_state(CID); st["approved"] = True
    st["dims"]["q2_often"].update(score=2, state="provided"); return st


def test_seeds_loaded(db):
    c = db.counts(CID)
    assert c["contributors"] == 6 and c["seeds"] == 6 and c["by_theme"]["transport"] == 4
    assert c["by_group"]["Morning boarding at Kent Ridge MRT"] == 2


def test_seeds_have_nine_rows_and_short_excerpts(db):
    for g in ("Morning boarding at Kent Ridge MRT", "Access obstruction", "No noticeable boarding effect",
              "Lunch queue at Frontier", "Study space at CLB"):
        for m in db.group_members_by_name(g):
            assert len(m["excerpt"]) <= 60
            assert len(m["fields"]) == 9
            assert db.group_id_for(g) == m["group_id"]


def test_submit_requires_approval(db):
    st = p.new_state(CID)
    with pytest.raises(S.NotApproved):
        db.submit("s1", st, [])
    assert db.counts(CID)["contributors"] == 6


def test_submit_rejects_truthy_but_not_true(db):
    st = p.new_state(CID); st["approved"] = "yes"
    with pytest.raises(S.NotApproved):
        db.submit("s1", st, [])
    assert db.counts(CID)["contributors"] == 6


def test_submit_is_idempotent_per_session(db):
    a = db.submit("s1", approved_state(), []); b = db.submit("s1", approved_state(), [])
    assert a["id"] == b["id"] and a["ref_code"].startswith("KR-") and db.counts(CID)["contributors"] == 7


def test_submit_shape(db):
    st = approved_state(); st["overall"] = "fine"
    rows = p.build_summary(st)
    a = db.submit("s1", st, rows)
    assert a["consultation_id"] == CID and a["theme"] is None and a["group_id"] is None and a["is_seed"] is False
    assert len(a["ref_code"]) == 7 and a["ref_code"][3:].isdigit()
    assert a["scores"]["q2_often"] == {"score": 2, "state": "provided"}
    assert a["fields"] == rows and a["overall"] == "fine"


def test_ref_codes_unique(db):
    codes = {db.submit(f"s{i}", approved_state(), [])["ref_code"] for i in range(30)}
    assert len(codes) == 30


def test_assign_and_differing(db):
    a = db.submit("s1", approved_state(), [])
    db.assign(a["id"], "transport", "Morning boarding at Kent Ridge MRT", False)
    c = db.counts(CID)
    assert c["by_group"]["Morning boarding at Kent Ridge MRT"] == 3 and c["by_theme"]["transport"] == 5
    gid = next(m for m in db.group_members_by_name("Morning boarding at Kent Ridge MRT"))["group_id"]
    ex = {d["id"] for d in db.differing(CID, gid)}
    assert {"C", "D"} <= ex


def test_differing_notes_and_explicit_none(db):
    gid = db.group_id_for("Morning boarding at Kent Ridge MRT")
    notes = {d["id"]: d["note"] for d in db.differing(CID, gid)}
    assert notes["C"] == "a single account, kept visible"
    assert notes["D"] == "a student guide; no noticeable effect"
    st = approved_state()
    rows = [{"key": "effect", "label": "Effect on you", "text": "none", "status": "explicit_none"}]
    a = db.submit("s9", st, rows)
    db.assign(a["id"], "food", "Lunch queue at Frontier", False)
    got = {d["id"]: d for d in db.differing(CID, gid)}
    assert got[a["id"]]["note"] == "no effect reported"
    db.withdraw(a["id"])
    assert a["id"] not in {d["id"] for d in db.differing(CID, gid)}


def test_withdraw_decrements(db):
    a = db.submit("s1", approved_state(), []); db.withdraw(a["id"])
    assert db.counts(CID)["contributors"] == 6


def test_withdraw_leaves_listings_and_theme_counts(db):
    a = db.submit("s1", approved_state(), [])
    db.assign(a["id"], "transport", "Morning boarding at Kent Ridge MRT", False)
    db.withdraw(a["id"])
    c = db.counts(CID)
    assert c["by_group"]["Morning boarding at Kent Ridge MRT"] == 2 and c["by_theme"]["transport"] == 4
    assert a["id"] not in {m["id"] for m in db.group_members_by_name("Morning boarding at Kent Ridge MRT")}


def test_assign_creates_new_group(db):
    a = db.submit("s1", approved_state(), [])
    db.assign(a["id"], "housing", "Hall laundry", True)
    assert db.group_id_for("Hall laundry") is not None
    assert db.counts(CID)["by_group"]["Hall laundry"] == 1
    assert db.group_id_for("Nope") is None


def test_set_contact_is_separate(db):
    a = db.submit("s1", approved_state(), [])
    db.set_contact(a["id"], "x@u.nus.edu")
    with db._conn() as c:
        assert c.execute("SELECT contact FROM contacts WHERE account_id=?", (a["id"],)).fetchone()[0] == "x@u.nus.edu"
    assert "contact" not in db.submit("s1", approved_state(), [])


def test_init_does_not_reseed_and_reset_does(db):
    a = db.submit("s1", approved_state(), []); db.init()
    assert db.counts(CID)["contributors"] == 7
    db.reset()
    assert db.counts(CID)["contributors"] == 6
    assert db.submit("s1", approved_state(), [])["id"] != a["id"]
