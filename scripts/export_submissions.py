"""Export every submission (chat and form) as plain text for blind coding.

    .venv/bin/python -m scripts.export_submissions            # writes to study-export/
    .venv/bin/python -m scripts.export_submissions --out DIR

Writes DIR/blind/<id>.txt (one per submission) and DIR/blind/all_submissions.txt for the coders, and DIR/key.csv
(id, channel, topic, participant code, reference, timing) for the team only. Seed accounts and withdrawn submissions
are left out. Reads the database the app uses (KOPICHAT_DB, else backend/kopichat.db); it never calls a model.
"""
import argparse
import os
from pathlib import Path

from backend import export, store

REPO_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=str(REPO_ROOT / "study-export"), help="folder to write into")
    parser.add_argument("--db", default=os.environ.get("KOPICHAT_DB") or str(REPO_ROOT / "backend" / "kopichat.db"))
    args = parser.parse_args()

    db = store.Store(args.db)
    db.init()
    submissions = export.collect(db)
    out = Path(args.out)
    blind = out / "blind"
    blind.mkdir(parents=True, exist_ok=True)
    for old in blind.glob("*.txt"):
        old.unlink()  # a withdrawn submission must not linger from an earlier export
    texts = [export.render(s["blind_id"], s["consultation_id"], s["rows"]) for s in submissions]
    for s, text in zip(submissions, texts):
        (blind / f"{s['blind_id']}.txt").write_text(text, encoding="utf-8")
    (blind / "all_submissions.txt").write_text(("\n" + "-" * 40 + "\n\n").join(texts), encoding="utf-8")
    (out / "key.csv").write_text(export.key_csv(submissions), encoding="utf-8")
    chat = sum(1 for s in submissions if s["channel"] == "chat")
    print(f"{len(submissions)} submissions ({chat} chat, {len(submissions) - chat} form) written to {out}")
    print("Give the coders the blind/ folder only. key.csv says which id is which channel.")


if __name__ == "__main__":
    main()
