# backend/content.py
"""Fixed copy for the consultation. Data only: later tasks import these strings and never invent their own."""

# Product name used in agent copy. Change here only when the naming decision is made.
PRODUCT_NAME = "Kopichat"

CONSULTATION = {
    "id": "campus-visitors-2026",
    "title": "Campus visitors and student experience",
    "why": "To understand how visitor presence on campus is affecting students' day-to-day experience.",
    "closing_date": "12 November 2026",
    "overall_options": ["Positively", "No noticeable effect", "Negatively", "Mixed", "Not sure"],
}

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
