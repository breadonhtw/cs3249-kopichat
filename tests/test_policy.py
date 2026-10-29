import pytest

from backend import content, policy as p, schema as s


def ex(checks=None, **kw):
    base = {"checks": {}, "explicit_none": [], "not_applicable": [], "interpretation": {"cause": None, "uncertain": False},
            "resolved_dates": {}, "ack": "", "route": "continue", "unclear_options": []}
    base.update(kw); base["checks"] = checks or {}; return base


def test_order_q1_first_then_q3_q2():
    st = p.new_state("c")
    assert p.next_target(st) == ("q1_what", "behaviour")
    st = p.apply_extraction(st, ex({"q1_what": {"behaviour": "a", "place": "b", "time": "c", "conditions": "d", "persons": "e"},
                                    "q4_basis": {"experienced": "f"}, "q3_effect": {"impact_type": "g"}, "q2_often": {"context": "h"}}))
    assert st["dims"]["q1_what"]["score"] == 2 and p.next_target(st) == ("q3_effect", "consequence")


def test_never_reasks_a_met_check():
    st = p.apply_extraction(p.new_state("c"), ex({"q1_what": {"behaviour": "a", "place": "b", "time": "c"}}))
    assert p.next_target(st) == ("q1_what", "persons")


def test_q5_once_after_sufficient_and_budget():
    st = p.new_state("c")
    for d in ["q1_what", "q2_often", "q3_effect", "q4_basis"]:
        st["dims"][d].update(score=2, state="provided")
    st["follow_ups_used"] = 3
    assert p.next_target(st) == ("q5_better", "present")
    st["dims"]["q5_better"]["state"] = "declined"
    assert p.next_target(st) is None
    st["dims"]["q5_better"]["state"] = "not_asked"; st["follow_ups_used"] = 5
    assert p.next_target(st) is None


def test_explicit_none_closes_q3_and_summary_quotes_it():
    st = p.apply_extraction(p.new_state("c"), ex({"q3_effect": {"impact_type": "no effect on me"}}, explicit_none=["q3_effect"]))
    st["transcript"] = ["no effect on me honestly"]
    assert s.is_closed(st["dims"]["q3_effect"]) and st["dims"]["q3_effect"]["score"] == 0
    row = next(r for r in p.build_summary(st) if r["key"] == "effect")
    assert row["status"] == "explicit_none" and "no effect on me" in row["text"]


def test_explicit_none_without_a_span_does_not_close_the_dimension():
    st = p.apply_extraction(p.new_state("c"), ex(explicit_none=["q2_often"]))
    assert st["dims"]["q2_often"]["state"] == "not_asked"
    assert not s.is_closed(st["dims"]["q2_often"])
    for d, checks in [("q1_what", {"behaviour": "a", "place": "b", "time": "c", "persons": "d", "conditions": "e"}),
                      ("q3_effect", {"impact_type": "x", "consequence": "y", "degree": "z"}),
                      ("q4_basis", {"experienced": "w"})]:
        st = p.apply_extraction(st, ex({d: checks}))
    assert p.next_target(st) == ("q2_often", "number")


def test_summary_is_extractive_and_marks_gaps():
    st = p.apply_extraction(p.new_state("c"), ex({"q1_what": {"behaviour": "Couldn't get onto the first A2", "place": "Kent Ridge MRT", "time": "yesterday, around 8.45am"}},
                                                resolved_dates={"time": "2026-10-27"}))
    rows = {r["key"]: r for r in p.build_summary(st)}
    assert "Couldn't get onto the first A2" in rows["what"]["text"] and "[2026-10-27]" in rows["what"]["text"]
    assert rows["often"]["status"] == "not_given" and rows["cause"]["status"] == "not_given"


def test_span_overwrites_and_provided_state():
    st = p.apply_extraction(p.new_state("c"), ex({"q1_what": {"behaviour": "old"}}))
    assert st["dims"]["q1_what"]["state"] == "provided"
    st = p.apply_extraction(st, ex({"q1_what": {"behaviour": "new", "place": None}}))
    assert st["dims"]["q1_what"]["checks"]["behaviour"] == "new"
    assert st["dims"]["q1_what"]["checks"]["place"] is None


def test_declined_stays_declined_unless_student_answers_it():
    st = p.new_state("c")
    st["dims"]["q2_often"]["state"] = "declined"
    st = p.apply_extraction(st, ex({"q1_what": {"behaviour": "a"}}))
    assert st["dims"]["q2_often"]["state"] == "declined"
    st = p.apply_extraction(st, ex({"q2_often": {"number": "twice"}}))
    assert st["dims"]["q2_often"]["state"] == "provided"


def test_not_applicable_needs_a_span_and_interpretation_and_dates_are_stored():
    st = p.apply_extraction(p.new_state("c"), ex({"q4_basis": {"mode_stated": "heard from a friend"}},
                                                 not_applicable=["q4_basis"],
                                                 interpretation={"cause": "too many tour groups", "uncertain": True},
                                                 resolved_dates={"time": "2026-10-27"}))
    assert st["dims"]["q4_basis"]["state"] == "not_applicable"
    assert st["interpretation"] == {"cause": "too many tour groups", "uncertain": True}
    st = p.apply_extraction(st, ex(resolved_dates={"most_recent": "2026-10"}))
    assert st["resolved_dates"] == {"time": "2026-10-27", "most_recent": "2026-10"}
    assert st["interpretation"]["cause"] == "too many tour groups"


def test_budget_spent_returns_none_even_when_open():
    st = p.new_state("c"); st["follow_ups_used"] = p.MAX_FOLLOWUPS
    assert p.next_target(st) is None


def test_compose_question_generic_when_no_time_span():
    st = p.new_state("c")
    assert p.compose_question(("q3_effect", "consequence"), st).endswith("that time?")
    st = p.apply_extraction(st, ex({"q1_what": {"time": "8.45am"}}))
    assert p.compose_question(("q3_effect", "consequence"), st).endswith("that morning?")
    assert p.compose_question(("q1_what", "place")) == "Where were you?"


def test_summary_rows_order_basis_cause_edits_and_skips():
    st = p.new_state("c")
    st["overall"] = "Negatively"
    st = p.apply_extraction(st, ex({"q4_basis": {"experienced": "it happened to me"}, "q5_better": {"present": "more buses"}},
                                   interpretation={"cause": "tour groups", "uncertain": True}))
    st["dims"]["q2_often"]["state"] = "declined"
    st["edits"]["what"] = "my edit"
    rows = p.build_summary(st)
    assert [r["key"] for r in rows] == [k for k, _ in content.SUMMARY_FIELDS]
    by = {r["key"]: r for r in rows}
    assert by["overall"] == {"key": "overall", "label": "Overall view", "text": "Negatively", "status": "quoted"}
    assert by["basis"]["text"] == "Experienced it yourself"
    assert by["cause"]["text"] == "tour groups (uncertain)"
    assert by["suggestion"]["text"] == "more buses" and by["often"]["status"] == "skipped"
    assert by["what"] == {"key": "what", "label": "What happened", "text": "my edit", "status": "edited"}
    assert by["feeling"]["status"] == "not_given"
    st["overall"] = None
    assert next(r for r in p.build_summary(st) if r["key"] == "overall")["status"] == "skipped"
    assert next(r for r in p.build_summary(st) if r["key"] == "overall")["text"] == "Skipped"


def test_new_state_shape():
    st = p.new_state("c")
    assert p.new_state("campus-visitors-2026")["consultation_id"] == "campus-visitors-2026"
    assert set(st) == {"consultation_id", "dims", "overall", "phase", "follow_ups_used", "last_target", "pending_question", "interpretation",
                       "resolved_dates", "edits", "approved", "transcript", "last_action", "stopped"}
    assert st["phase"] == "consent" and st["approved"] is False and st["stopped"] is None and st["follow_ups_used"] == 0


@pytest.mark.parametrize("key", ["explicit_none", "not_applicable"])
def test_ended_dimension_stays_ended_when_other_dimensions_are_extracted(key):
    st = p.apply_extraction(p.new_state("c"), ex({"q3_effect": {"impact_type": "no effect on me"}}, **{key: ["q3_effect"]}))
    assert st["dims"]["q3_effect"]["state"] == key
    st = p.apply_extraction(st, ex({"q1_what": {"behaviour": "a", "place": "b"}}))
    q3 = st["dims"]["q3_effect"]
    assert q3["state"] == key and q3["score"] == 0 and s.is_closed(q3)
    assert p.next_target(st)[0] != "q3_effect"
    # a fresh q3 span from the student re-opens it
    st = p.apply_extraction(st, ex({"q3_effect": {"consequence": "late for class"}}))
    assert st["dims"]["q3_effect"]["state"] == "provided"


def test_declined_reopens_only_with_a_new_span_for_it():
    st = p.new_state("c")
    st["dims"]["q3_effect"]["checks"]["impact_type"] = "time"
    st["dims"]["q3_effect"]["state"] = "declined"
    st = p.apply_extraction(st, ex({"q1_what": {"behaviour": "a"}}))
    assert st["dims"]["q3_effect"]["state"] == "declined"
    st = p.apply_extraction(st, ex({"q3_effect": {"degree": "20 min"}}))
    assert st["dims"]["q3_effect"]["state"] == "provided"
