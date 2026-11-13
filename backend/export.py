"""Plain-text export of what students sent, for blind coding in the user study.

A chat account and a form submission come out in one layout, under a random id, with no channel label. The key that
says which id came from which channel is a separate file, kept from the coders. Wording is never changed. No HTTP,
no LLM.
"""
import csv
import io

from . import content, store as store_mod

NO_ANSWER = "(no answer)"
# Rows both channels ask for: always printed, so a skipped question reads the same from either.
COMMON_ROWS = ("overall", "what", "often", "effect", "basis", "suggestion")
_ANSWERED = ("quoted", "edited", "explicit_none")
KEY_COLUMNS = ("blind_id", "channel", "topic", "participant", "ref_code", "opened_at", "submitted_at", "duration_s",
               "edited_rows", "visibility")


def render(blind_id: str, consultation_id: str, rows: list[dict]) -> str:
    """One submission as plain text. The six common rows always appear; a row only the chat can fill (what the
    student saw, their read on the cause, a feeling in their words) appears only when it holds text."""
    by_key = {r.get("key"): r for r in rows}
    lines = [f"Submission {blind_id}", f"Consultation: {content.consultation(consultation_id)['title']}"]
    for key, label in content.SUMMARY_FIELDS:
        row = by_key.get(key) or {}
        text = (row.get("text") or "").strip() if row.get("status") in _ANSWERED else ""
        if not text and key not in COMMON_ROWS:
            continue
        lines += ["", label, text or NO_ANSWER]
    return "\n".join(lines) + "\n"


def _edited(rows: list[dict]) -> str:
    return " ".join(r["key"] for r in rows if r.get("status") == "edited")


def collect(store: store_mod.Store) -> list[dict]:
    """Every submission still in the study, from both channels, ordered by its random id (so not by channel or time)."""
    out = []
    for a in store.submitted():
        out.append({"blind_id": a["blind_id"], "channel": "chat", "consultation_id": a["consultation_id"],
                    "participant": a["participant"], "ref_code": a["ref_code"], "opened_at": a["opened_at"],
                    "submitted_at": a["created_at"], "duration_s": a["duration_s"], "rows": a["fields"],
                    "visibility": a["visibility"]})
    for f in store.form_submitted():
        out.append({"blind_id": f["blind_id"], "channel": "form", "consultation_id": f["consultation_id"],
                    "participant": f["participant"], "ref_code": f["ref_code"], "opened_at": f["opened_at"],
                    "submitted_at": f["created_at"], "duration_s": f["duration_s"], "rows": f["fields"],
                    "visibility": ""})
    # An account stored before export ids existed has none; it is named by its reference instead.
    for s in out:
        s["blind_id"] = s["blind_id"] or f"S-{s['ref_code']}"
    return sorted(out, key=lambda s: s["blind_id"])


def key_csv(submissions: list[dict]) -> str:
    """The key: which id is which channel, topic and participant, with the timing. Not for the coders."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(KEY_COLUMNS)
    for s in submissions:
        writer.writerow([s["blind_id"], s["channel"], content.consultation(s["consultation_id"])["topic"],
                         s["participant"] or "", s["ref_code"], s["opened_at"] or "", s["submitted_at"],
                         "" if s["duration_s"] is None else s["duration_s"], _edited(s["rows"]), s["visibility"]])
    return buf.getvalue()
