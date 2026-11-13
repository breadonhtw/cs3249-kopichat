# backend/content.py
"""Fixed copy for the consultation. Data only: later tasks import these strings and never invent their own."""

# Product name used in agent copy. Change here only when the naming decision is made.
PRODUCT_NAME = "Kopichat"

# Every consultation shares these answers to the overall question.
OVERALL_OPTIONS = ["Positively", "Negatively", "Mixed", "No noticeable effect"]

# Placeholder closing date for both fictional consultations. NUSSU has not set one.
CLOSING_DATE = "30 November 2026"

# The consultations, by id. `topic` is the short name a link carries (?topic=study); `themes` are the headings an
# approved account is filed under.
CONSULTATIONS: dict[str, dict] = {
    "campus-visitors-2026": {
        "id": "campus-visitors-2026",
        "topic": "visitors",
        "title": "Campus visitors and student experience",
        "why": "To understand how visitor presence on campus is affecting students' day-to-day experience.",
        "closing_date": CLOSING_DATE,
        "overall_question": "Overall, how has campus visitor presence affected your experience recently?",
        "overall_options": OVERALL_OPTIONS,
    },
    "study-spaces-2026": {
        "id": "study-spaces-2026",
        "topic": "study",
        "title": "Study spaces during reading week and exams",
        "why": "To understand what finding a place to study is like for students during reading week and exams.",
        "closing_date": CLOSING_DATE,
        "overall_question": "Overall, how has finding a place to study during reading week and exams affected you?",
        "overall_options": OVERALL_OPTIONS,
    },
}
DEFAULT_CONSULTATION_ID = "campus-visitors-2026"
# The consultation a link without ?topic= opens, and the one the demo walkthrough uses.
CONSULTATION = CONSULTATIONS[DEFAULT_CONSULTATION_ID]


def consultation(consultation_id: str | None) -> dict:
    """The consultation with this id; the default one for an id this app does not know."""
    return CONSULTATIONS.get(consultation_id or "", CONSULTATION)


def consultation_for_topic(topic: str | None) -> dict:
    """The consultation a link's ?topic= names, by short name or id; the default one when it names none."""
    wanted = (topic or "").strip().lower()
    for c in CONSULTATIONS.values():
        if wanted in (c["topic"], c["id"]):
            return c
    return CONSULTATION


# What NUSSU's reviewer view says about where the accounts came from. Both consultations are simulated, so this says
# so: there is no opening date on record, the closing date is a placeholder, and the link was never sent out.
REVIEW_CONTEXT = {
    "opens": None,
    "closes_note": "a placeholder: NUSSU has not set a closing date",
    "reach": ("Simulated consultation. The link was not sent out to students. Accounts named by a letter are fictional"
              " seeds written by the project team. Accounts with a KR reference were sent by study participants and"
              " testers the project team gave the link to directly."),
}

# Said on the consent screen of the chat and of the form, in the same words.
INVITATION = "Good, bad, no-effect and not-sure experiences are all welcome."

OPENING = "In your own words, what's been happening? A recent example helps most."

# Keyed by (dimension, missing_check). Check names match backend/schema.py CHECKS.
QUESTIONS: dict[tuple[str, str], str] = {
    ("q1_what", "behaviour"): "Tell me about the most recent time: where you were, and what happened.",
    ("q1_what", "place"): "Where were you?",
    ("q1_what", "time"): "Roughly when was that?",
    ("q1_what", "persons"): "Was anyone else involved in what happened? You can say no.",
    ("q1_what", "conditions"): "What was it like there at the time?",
    ("q1_what", "location"): "Where exactly, within that place?",
    ("q1_what", "activities"): "What were you and the others doing?",
    ("q2_often", "number"): "How many times has this happened to you, and over what period?",
    ("q2_often", "timeframe"): "Over what period?",
    ("q2_often", "context"): "Is it always around the same time or place?",
    ("q3_effect", "impact_type"): "What kind of effect was it: time, classes, money, or something else?",
    ("q3_effect", "consequence"): "How did that affect you that morning?",
    ("q3_effect", "degree"): "How much, for example how late or how long?",
    ("q4_basis", "experienced"): "Did this happen to you, or did you see it or hear about it?",
    ("q5_better", "present"): "Last one, and it's optional: what would a better experience look like? You can skip this.",
}

# Used when the time of the event is not known yet.
QUESTIONS_GENERIC: dict[tuple[str, str], str] = {
    ("q3_effect", "consequence"): "How did that affect you that time?",
}

WHY: dict[str, str] = {
    "q1_what": "So NUSSU can tell a specific event from a general impression. You can skip it.",
    "q2_often": "So NUSSU can tell a one-off from a pattern. You can skip it.",
    "q3_effect": "So NUSSU can tell whether this is an inconvenience or something that affects classes. You can skip it.",
    "q4_basis": "So NUSSU knows whether this is first-hand. You can skip it.",
    "q5_better": "So NUSSU hears what you would want changed. It is optional.",
}

SUFFICIENT_MESSAGE = "That's enough for the account. Check the summary before anything is sent."
SKIP_ACK = "Noted, skipping that."

ANONYMOUS_MESSAGE = "Your replies are read by an AI service and by NUSSU's consultation team. No name or student ID is collected, so none is stored with them. Nothing goes to NUSSU until you approve the summary. Shall we continue?"
OUT_OF_SCOPE_PERSON = f"{PRODUCT_NAME} collects experiences of campus services, not reports about named individuals. For a concern about a person, contact the Office of Student Affairs. Shall we continue without the name?"
OUT_OF_SCOPE_APPEAL = f"{PRODUCT_NAME} cannot handle individual appeals or casework. For that, contact your faculty office or the Office of Student Affairs. Shall we continue with your general experience?"
CRISIS_MESSAGE = "Thank you for telling me. If you are in distress, please contact Lifeline NUS (+65 65167777) now. The questions are paused; nothing has been sent."

INSTRUCTION_MESSAGE = "I can only record what you experienced, in your own words. Nothing is sent until you approve the summary."
STOP_MESSAGE = "Nothing has been sent. Delete what you typed?"
UNAVAILABLE_MESSAGE = "The assistant is unavailable right now. Your replies are kept. Send your message again in a moment."
NO_LLM_MESSAGE = "This app needs an LLM to run. Add an API key in .env, then restart the server."

UNCLEAR_PREFIX = "Did you mean"
NONE_OF_THESE = "None of these"

THEMES: dict[str, str] = {
    "transport": "Transport access and crowding: buses, stops, boarding, journey times.",
    "food": "Food-court access and congestion: queues, seating, availability.",
    "study": "Disruption of study and teaching: libraries, study spaces, teaching rooms.",
    "access": "Accessibility and physical obstruction: ramps, lifts, wheelchair spaces, blocked paths.",
    "privacy": "Privacy and personal boundaries: photography, intrusion, personal space.",
    "other": "Other: relevant but outside the preset themes.",
    "needs_review": "Needs review: ambiguous; a reviewer decides.",
}

# Themes of the study-spaces consultation. Keys differ from the visitors themes so a label is never ambiguous.
STUDY_THEMES: dict[str, str] = {
    "seats": "Finding a seat: full libraries and study rooms, time spent searching, seats held with belongings.",
    "hours": "Opening hours and access: closing times, overnight spaces, room booking, card access.",
    "conditions": "Conditions in the space: noise, temperature, power sockets, Wi-Fi, lighting.",
    "other": THEMES["other"],
    "needs_review": THEMES["needs_review"],
}

THEMES_BY_CONSULTATION: dict[str, dict[str, str]] = {
    "campus-visitors-2026": THEMES,
    "study-spaces-2026": STUDY_THEMES,
}
ALL_THEMES: dict[str, str] = {**STUDY_THEMES, **THEMES}


def themes_for(consultation_id: str | None) -> dict[str, str]:
    return THEMES_BY_CONSULTATION.get(consultation_id or "", THEMES)


# Summary fields in the order the storyboard shows them: (key, label).
SUMMARY_FIELDS: list[tuple[str, str]] = [
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

# Who sees an approved account's words. "nussu": the consultation team only. "board": also other students, as a slip
# on the receipt's noticeboard. Either way the account is counted and NUSSU reads it.
VISIBILITY = ("nussu", "board")
DEFAULT_VISIBILITY = "nussu"

# The matched form the user study compares the chat against: the same five schema questions as fixed fields, in a
# fixed order, with no follow-ups. (dimension, summary row it fills, label, hint)
FORM_FIELDS: list[tuple[str, str, str, str]] = [
    ("q1_what", "what", "What happened?", "In your own words. A recent example helps most."),
    ("q2_often", "often", "How often does it happen?", "For example how many times, and over what period."),
    ("q3_effect", "effect", "How did it affect you?", "You can say it had no effect."),
    ("q4_basis", "basis", "Did this happen to you, or did you see it or hear about it?", ""),
    ("q5_better", "suggestion", "What would a better experience look like?", "Optional."),
]
