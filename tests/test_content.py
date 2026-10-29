# tests/test_content.py
from backend import content as c, schema as s


def _strings(value):
    """Yield every string nested in a constant (values and dict keys)."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from _strings(k)
            yield from _strings(v)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _strings(item)


def _module_strings():
    out = []
    for name in dir(c):
        if name.isupper():
            out.extend(_strings(getattr(c, name)))
    return out


def test_every_required_check_has_a_question():
    required = {("q1_what","behaviour"),("q2_often","number"),("q2_often","timeframe"),("q2_often","context"),
                ("q3_effect","consequence"),("q3_effect","degree"),("q3_effect","impact_type"),
                ("q4_basis","experienced"),("q5_better","present")}
    assert required <= set(c.QUESTIONS)
    for k in ["place","time","persons","conditions","location","activities"]:
        assert ("q1_what", k) in c.QUESTIONS


def test_question_keys_are_schema_checks():
    for dimension, check in c.QUESTIONS:
        assert dimension in s.CHECKS and check in s.CHECKS[dimension]


def test_verbatim_question_templates():
    assert c.QUESTIONS[("q1_what", "behaviour")] == "Tell me about the most recent time: where you were, and what happened."
    assert c.QUESTIONS[("q3_effect", "consequence")] == "How did that affect you that morning?"
    assert c.QUESTIONS[("q3_effect", "degree")] == "How much, for example how late or how long?"
    assert c.QUESTIONS[("q2_often", "number")] == "How many times has this happened to you, and over what period?"
    assert c.QUESTIONS[("q2_often", "timeframe")] == "Over what period?"
    assert c.QUESTIONS[("q2_often", "context")] == "Is it always around the same time or place?"
    assert c.QUESTIONS[("q4_basis", "experienced")] == "Did this happen to you, or did you see it or hear about it?"
    assert c.QUESTIONS[("q5_better", "present")] == "Last one, and it's optional: what would a better experience look like? You can skip this."
    assert c.QUESTIONS[("q1_what", "place")] == "Where were you?"
    assert c.QUESTIONS[("q1_what", "time")] == "Roughly when was that?"
    assert c.QUESTIONS[("q1_what", "persons")] == "Who else was there?"
    assert c.QUESTIONS[("q1_what", "conditions")] == "What was it like there at the time?"
    assert c.QUESTIONS[("q1_what", "location")] == "Where exactly, within that place?"
    assert c.QUESTIONS[("q1_what", "activities")] == "What were you and the others doing?"


def test_generic_consequence_question():
    assert c.QUESTIONS_GENERIC[("q3_effect", "consequence")] == "How did that affect you that time?"


def test_copy_house_rules():
    texts = list(c.QUESTIONS.values()) + list(c.WHY.values()) + [c.SUFFICIENT_MESSAGE, c.SKIP_ACK, c.STOP_MESSAGE]
    for t in texts:
        assert "·" not in t and "→" not in t and t.count("?") <= 1 and not t.isupper()


def test_house_rules_hold_for_every_string():
    forbidden_words = {"sounds", "sorry", "frustrating"}
    for t in _module_strings():
        assert "·" not in t and "→" not in t, t
        assert t.count("?") <= 1, t
        assert not t.isupper(), t
        words = {w.strip(".,:;!?'\"()").lower() for w in t.split()}
        assert not (words & forbidden_words), t


def test_themes_and_fields():
    assert {"other", "needs_review"} <= set(c.THEMES) and len(c.THEMES) == 7
    assert [f[0] for f in c.SUMMARY_FIELDS][:2] == ["overall", "what"] and len(c.SUMMARY_FIELDS) == 9


def test_theme_definitions_verbatim():
    assert c.THEMES["transport"] == "Transport access and crowding: buses, stops, boarding, journey times."
    assert c.THEMES["food"] == "Food-court access and congestion: queues, seating, availability."
    assert c.THEMES["study"] == "Disruption of study and teaching: libraries, study spaces, teaching rooms."
    assert c.THEMES["access"] == "Accessibility and physical obstruction: ramps, lifts, wheelchair spaces, blocked paths."
    assert c.THEMES["privacy"] == "Privacy and personal boundaries: photography, intrusion, personal space."
    assert c.THEMES["other"] == "Other: relevant but outside the preset themes."
    assert c.THEMES["needs_review"] == "Needs review: ambiguous; a reviewer decides."


def test_consultation_shape():
    assert set(c.CONSULTATION) >= {"id", "title", "why", "closing_date", "overall_options"}
    assert c.CONSULTATION["id"] == "campus-visitors-2026"
    assert c.CONSULTATION["title"] == "Campus visitors and student experience"
    assert c.CONSULTATION["why"] == "To understand how visitor presence on campus is affecting students' day-to-day experience."
    assert c.CONSULTATION["closing_date"] == "[closing date]"
    assert c.CONSULTATION["overall_options"] == ["Positively", "No noticeable effect", "Negatively", "Mixed", "Not sure"]


def test_why_covers_every_dimension():
    assert set(c.WHY) == set(s.DIMENSIONS)
    assert c.WHY["q1_what"] == "So NUSSU can tell a specific event from a general impression. You can skip it."
    assert c.WHY["q2_often"] == "So NUSSU can tell a one-off from a pattern. You can skip it."
    assert c.WHY["q3_effect"] == "So NUSSU can tell whether this is an inconvenience or something that affects classes. You can skip it."
    assert c.WHY["q4_basis"] == "So NUSSU knows whether this is first-hand. You can skip it."
    assert c.WHY["q5_better"] == "So NUSSU hears what you would want changed. It is optional."


def test_opening_and_fixed_messages_verbatim():
    assert c.OPENING == "In your own words, what's been happening? A recent example helps most."
    assert c.ANONYMOUS_MESSAGE == "Your replies are read by an AI service and by NUSSU's consultation team. No name or student ID is collected, so none is stored with them. Nothing goes to NUSSU until you approve the summary. Shall we continue?"
    assert c.OUT_OF_SCOPE_PERSON == "Kopichat collects experiences of campus services, not reports about named individuals. For a concern about a person, contact the Office of Student Affairs. Shall we continue without the name?"
    assert c.OUT_OF_SCOPE_APPEAL == "Kopichat cannot handle individual appeals or casework. For that, contact your faculty office or the Office of Student Affairs. Shall we continue with your general experience?"


def test_product_name_drives_out_of_scope_copy():
    assert c.PRODUCT_NAME == "Kopichat"
    assert c.OUT_OF_SCOPE_PERSON.startswith(c.PRODUCT_NAME + " ")
    assert c.OUT_OF_SCOPE_APPEAL.startswith(c.PRODUCT_NAME + " ")


def test_no_nusid_in_copy():
    assert not any("NUSID" in t for t in _module_strings())
    assert c.CRISIS_MESSAGE == "Thank you for telling me. If you are in distress, please contact [care line] now. The questions are paused; nothing has been sent."
    assert c.UNAVAILABLE_MESSAGE == "The assistant is unavailable right now. Your replies are kept. Send your message again in a moment."
    assert c.NO_LLM_MESSAGE == "This app needs an LLM to run. Add an API key in .env, then restart the server."
    assert c.SUFFICIENT_MESSAGE == "That's enough for the account. Check the summary before anything is sent."
    assert c.SKIP_ACK == "Noted, skipping that."
    assert c.STOP_MESSAGE == "Nothing has been sent. Delete what you typed?"
    assert c.UNCLEAR_PREFIX == "Did you mean"
    assert c.NONE_OF_THESE == "None of these"


def test_summary_field_labels_verbatim():
    assert c.SUMMARY_FIELDS == [
        ("overall", "Overall view"),
        ("what", "What happened"),
        ("often", "How often"),
        ("effect", "Effect on you"),
        ("saw", "What you saw"),
        ("cause", "Your read on the cause (your interpretation, not a finding)"),
        ("basis", "How you know"),
        ("suggestion", "Suggestion"),
        ("feeling", "Feeling, in your words"),
    ]
