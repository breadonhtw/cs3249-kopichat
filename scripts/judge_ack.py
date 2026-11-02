"""LLM-as-judge for the one piece of LLM-written text the student sees: the acknowledgement.

Reads every *.jsonl under KOPICHAT_LOG_DIR (default backend/logs), and for each turn whose
extraction.ack is non-empty asks a judge model one question: does the acknowledgement reuse the
student's words and name no cause and no feeling? Reasoning comes first, the verdict last.

    .venv/bin/python -m scripts.judge_ack              # judge every logged ack
    .venv/bin/python -m scripts.judge_ack --dry-run    # print the prompts, call nothing

Environment: LLM_JUDGE_PROVIDER (default "anthropic"), LLM_JUDGE_MODEL (default: that provider's
default model; set a different model from the one that wrote the acks). Never run under pytest.
"""
import argparse
import csv
import json
import os
import re
import sys
from contextlib import contextmanager
from pathlib import Path

if __package__ in (None, ""):  # run as a plain file: make `backend` importable
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import llm, logbook  # noqa: E402

CRITERION = "PASS: the acknowledgement reuses words from the student's latest message, addresses the student as you, and names no cause and no feeling. FAIL: otherwise."

JUDGE_SYSTEM = (
    "You are a strict reviewer of one short acknowledgement that a feedback chatbot showed a student. "
    "You judge it against a single criterion. Write one sentence of reasoning first. "
    "Then end with a final line that is exactly 'VERDICT: PASS' or 'VERDICT: FAIL'."
)

_VERDICT = re.compile(r"^\s*VERDICT:\s*(PASS|FAIL)\s*$", re.IGNORECASE | re.MULTILINE)


def build_prompt(student_message: str, ack: str) -> str:
    """The judge's user prompt for one turn."""
    return (
        f"Criterion:\n{CRITERION}\n\n"
        f"The student's last message:\n{student_message}\n\n"
        f"The acknowledgement shown to the student:\n{ack}\n\n"
        "Write one sentence of reasoning, then a final line 'VERDICT: PASS' or 'VERDICT: FAIL'."
    )


def parse_verdict(reply: str) -> tuple[str, str]:
    """(verdict, reasoning). verdict is PASS, FAIL, or UNPARSED when no line is a verdict."""
    matches = list(_VERDICT.finditer(reply))
    if not matches:
        return "UNPARSED", " ".join(reply.split())
    last = matches[-1]
    return last.group(1).upper(), " ".join(reply[:last.start()].split())


def load_turns(log_dir: Path) -> list[dict]:
    """One entry per logged turn that has a non-empty ack: session, turn (1-based line number), student, ack."""
    turns = []
    for path in sorted(Path(log_dir).glob("*.jsonl")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            ack = ((record.get("extraction") or {}).get("ack") or "").strip()
            if not ack:
                continue
            transcript = record.get("transcript") or []
            student = record.get("message") or (transcript[-1] if transcript else "")
            turns.append({"session": path.stem, "turn": number, "student": student, "ack": ack})
    return turns


@contextmanager
def judge_env(provider: str, model: str):
    """Point backend.llm at the judge for the duration of the calls, then put the environment back."""
    saved = {k: os.environ.get(k) for k in ("LLM_PROVIDER", "LLM_MODEL")}
    os.environ["LLM_PROVIDER"] = provider
    os.environ["LLM_MODEL"] = model  # "" falls back to the provider's default model
    try:
        yield
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def judge_turn(prompt: str) -> tuple[str, str]:
    """Call the judge (backend.llm must already point at it). Returns (verdict, reasoning)."""
    try:
        reply = llm.chat(JUDGE_SYSTEM, [{"role": "user", "content": prompt}], max_tokens=300)
    except llm.LLMError as e:
        return "ERROR", str(e)
    return parse_verdict(reply)


def pass_rate(verdicts: list[str]) -> tuple[int, int]:
    """(passes, judged) where judged counts only turns the judge actually ruled on."""
    ruled = [v for v in verdicts if v in ("PASS", "FAIL")]
    return ruled.count("PASS"), len(ruled)


def _clip(text: str, width: int) -> str:
    return text if len(text) <= width else text[: width - 1] + "…"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Judge logged acknowledgements against one criterion.")
    parser.add_argument("--dry-run", action="store_true", help="print the judge prompts; call no LLM, write no file")
    args = parser.parse_args(argv)

    if os.environ.get("PYTEST_CURRENT_TEST"):
        print("judge_ack.main() makes real LLM calls and must not run under pytest.", file=sys.stderr)
        return 2

    log_dir = Path(os.environ.get("KOPICHAT_LOG_DIR") or logbook.DEFAULT_LOG_DIR)
    turns = load_turns(log_dir) if log_dir.is_dir() else []
    if not turns:
        print(f"No acknowledgements to judge: no *.jsonl turns with an ack under {log_dir}.\n"
              "Run a few conversations against the real LLM first.", file=sys.stderr)
        return 1

    if args.dry_run:
        for t in turns:
            print(f"--- {t['session']} turn {t['turn']} ---\n{build_prompt(t['student'], t['ack'])}\n")
        print(f"{len(turns)} prompts (dry run: nothing sent).")
        return 0

    provider = (os.environ.get("LLM_JUDGE_PROVIDER") or "anthropic").strip().lower()
    model = os.environ.get("LLM_JUDGE_MODEL") or ""
    with judge_env(provider, model):
        if not llm.enabled():
            print(f"The judge provider {provider!r} has no API key (or is unknown). Set the key for it, "
                  "or choose another with LLM_JUDGE_PROVIDER.", file=sys.stderr)
            return 1
        print(f"Judge: {llm.describe()}  (set LLM_JUDGE_MODEL to a model other than the one that wrote the acks)")
        results = []
        for t in turns:
            verdict, reasoning = judge_turn(build_prompt(t["student"], t["ack"]))
            results.append({**t, "verdict": verdict, "reasoning": reasoning})

    print(f"\n{'session':<10} {'turn':>4}  {'verdict':<8} reasoning")
    for r in results:
        print(f"{r['session'][:8]:<10} {r['turn']:>4}  {r['verdict']:<8} {_clip(r['reasoning'], 90)}")
    passes, judged = pass_rate([r["verdict"] for r in results])
    rate = f"{passes}/{judged} = {passes / judged:.0%}" if judged else "n/a (nothing judged)"
    print(f"\nPass rate: {rate}   ({len(results) - judged} not ruled on)")

    out = log_dir / "judge_ack.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["session", "turn", "student", "ack", "verdict", "reasoning"])
        writer.writeheader()
        writer.writerows(results)
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
