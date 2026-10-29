"""The storyboard conversation: five student lines and the scripted LLM output after each.

EXTRACTIONS[i] is the raw dict a fake LLM returns after STUDENT[i]. Each is cumulative over the
transcript so far, and every span is a verbatim substring of the STUDENT lines up to that point
(extract.validate_extraction drops anything else).
"""

STUDENT = [
    "The buses are always packed, damn frustrating. I was late again.",
    "Kent Ridge MRT yesterday, around 8.45am. Couldn't get onto the first A2. There was a group with a guide, but honestly mornings are crowded anyway, idk how much was because of them.",
    "Waited for the next one and got to my tutorial about 15 min late.",
    "Maybe 3 times this month, always around that 8.45 slot.",
    "Maybe tours could avoid the morning rush.",
]

WHY_LINE = "why do you need that?"

_NONE = {"explicit_none": [], "not_applicable": [], "unclear_options": []}

_E0 = {
    "checks": {
        "q1_what": {"conditions": "packed"},
        "q2_often": {"own_recurrence": "late again"},
        "q3_effect": {"impact_type": "late"},
        "q4_basis": {"experienced": "I was late"},
    },
    "feeling": "damn frustrating",
    "route": "continue",
    "ack": "Packed buses, and late again.",
    **_NONE,
}

_E1 = {
    "checks": {
        "q1_what": {
            "behaviour": "Couldn't get onto the first A2",
            "place": "Kent Ridge MRT",
            "time": "yesterday, around 8.45am",
            "persons": "a group with a guide",
            "conditions": "mornings are crowded",
        },
        "q2_often": {"own_recurrence": "late again", "context": "8.45am", "most_recent": "yesterday"},
        "q3_effect": {"impact_type": "late"},
        "q4_basis": {"experienced": "I was late", "observed_vantage": "There was a group with a guide"},
    },
    "interpretation": {"cause": "idk how much was because of them", "uncertain": True},
    "resolved_dates": {"time": "2026-10-27"},
    "feeling": "damn frustrating",
    "route": "continue",
    "ack": "You couldn't get onto the first A2.",
    **_NONE,
}

_E2 = {
    **_E1,
    "checks": {
        **_E1["checks"],
        "q3_effect": {
            "impact_type": "late",
            "consequence": "got to my tutorial about 15 min late",
            "degree": "about 15 min",
        },
    },
    "ack": "You said late again.",
}

_E3 = {
    **_E2,
    "checks": {
        **_E2["checks"],
        "q2_often": {
            "own_recurrence": "late again",
            "number": "3 times",
            "timeframe": "this month",
            "context": "8.45 slot",
            "most_recent": "yesterday",
        },
    },
    "ack": "",
}

_E4 = {
    **_E3,
    "checks": {
        **_E3["checks"],
        "q5_better": {
            "present": "tours could avoid the morning rush",
            "specific_action": "tours could avoid the morning rush",
            "linked": "tours could avoid the morning rush",
            "scope": "morning",
        },
    },
    "ack": "",
}

EXTRACTIONS = [_E0, _E1, _E2, _E3, _E4]
