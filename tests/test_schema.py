# tests/test_schema.py
import pytest
from backend import schema as s

def checks(dim, *met):
    return {k: ("x" if k in met else None) for k in s.CHECKS[dim]}

@pytest.mark.parametrize("met,expected", [
    ((), 0), (("place",), 0), (("place","time"), 1),
    (("behaviour",), 1), (("behaviour","place","time","conditions"), 1),
    (("behaviour","place","time","conditions","persons"), 2),
    (("behaviour","place","location","persons","time","conditions","activities"), 2),
])
def test_q1(met, expected):
    assert s.score("q1_what", checks("q1_what", *met)) == expected

@pytest.mark.parametrize("met,expected", [
    ((), 0), (("own_recurrence","most_recent"), 0), (("context",), 1),
    (("number","timeframe"), 1), (("number","timeframe","context"), 2),
])
def test_q2(met, expected):
    assert s.score("q2_often", checks("q2_often", *met)) == expected

@pytest.mark.parametrize("met,expected", [
    ((), 0), (("impact_type",), 1), (("impact_type","consequence"), 1),
    (("impact_type","degree"), 1), (("impact_type","consequence","degree"), 2),
])
def test_q3(met, expected):
    assert s.score("q3_effect", checks("q3_effect", *met)) == expected

@pytest.mark.parametrize("met,expected", [
    ((), 0), (("mode_stated",), 1), (("mode_stated","source_identified","source_context"), 1),
    (("experienced",), 2), (("observed_vantage",), 2),
])
def test_q4(met, expected):
    assert s.score("q4_basis", checks("q4_basis", *met)) == expected

@pytest.mark.parametrize("met,expected", [
    ((), 0), (("present",), 1), (("present","specific_action"), 1),
    (("present","specific_action","linked"), 1), (("present","specific_action","linked","scope"), 2),
])
def test_q5(met, expected):
    assert s.score("q5_better", checks("q5_better", *met)) == expected

def test_missing_required_order():
    assert s.missing_required("q2_often", checks("q2_often", "context")) == ["number", "timeframe"]
    assert s.missing_required("q1_what", checks("q1_what")) == ["behaviour"]
    assert s.missing_required("q1_what", checks("q1_what", "behaviour","place","time","conditions")) == ["persons"]

def test_closed_and_sufficient():
    dims = s.new_dims()
    assert not s.is_sufficient({"dims": dims})
    for d in ["q1_what","q2_often","q3_effect"]:
        dims[d]["score"] = 2; dims[d]["state"] = "provided"
    dims["q4_basis"]["state"] = "declined"
    assert s.is_closed(dims["q4_basis"]) and s.is_sufficient({"dims": dims})
    dims["q3_effect"] = {"score": 0, "state": "explicit_none", "checks": checks("q3_effect")}
    assert s.is_sufficient({"dims": dims})
