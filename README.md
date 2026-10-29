# Kopichat

Kopichat is a student-facing consultation chat for NUSSU, built for CS3249 Conversational User Interface. A student shares one real experience on a topic NUSSU has set, sees exactly what will be sent, and approves it before anything leaves the phone. It collects one account under Feedback Schema V2, with follow-up questions chosen by code rather than by the language model. Every account and count on screen is fictional seed data, plus the one live submission you make yourself.

## Requirements

- Python 3.12
- Node 22
- An API key for an OpenAI-compatible endpoint (the NUS SoCLaaS key) or an Anthropic key. The app starts without one, with limits described under "No key?".

## Setup

From the repository root:

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and paste your SoCLaaS key after `OPENAI_API_KEY=` and set `LLM_MODEL=default`, or paste an Anthropic key after `ANTHROPIC_API_KEY=` and leave `LLM_MODEL` empty. For a personal OpenAI key, also set `OPENAI_BASE_URL=https://api.openai.com/v1` and set `LLM_MODEL` to one of your account's models. With `LLM_PROVIDER` empty the app uses whichever key is set (Anthropic first). Keys go in `.env` only, never in `backend/llm.py`. Then, still from the repository root, install the frontend:

```
npm --prefix frontend run setup
```

## Run

Use two terminals, both from the repository root.

Terminal 1, the backend:

```
.venv/bin/python -m uvicorn backend.app:app --reload --port 8000
```

Terminal 2, the frontend:

```
npm --prefix frontend run start
```

Open http://localhost:5173. The frontend dev server forwards `/api` requests to the backend on port 8000.

To run from one server instead, build the frontend and let the backend serve it:

```
npm --prefix frontend run build
```

Then start the backend as above and open http://localhost:8000. The backend serves `frontend/dist` when that folder exists, so build before you start it. The demo bar described below is a development feature and is not part of the built app.

## No key?

Without a key for the chosen provider the app still opens and the consultation page, consent and the overall question all work, as do the chips ("Skip this question", "Why do you ask?", "Pause", and deleting a draft). Every free-text message gets one plain line in reply: this app needs an LLM to run, add an API key in `.env`, then restart the server. The follow-up questions do not advance without a key, because they depend on reading the student's words. After two such replies in a row the written fallback opens: five plain questions answered in one form, sent without the model, straight to the summary. An account sent that way is stored unclassified and shown as "Not grouped yet. A reviewer will place it."

## Demo walkthrough

Start from a fresh seed state: use "Restart demo" in the demo bar (laptop width, dev server only), or POST `/api/admin/reset`. A reload after a backend restart does not start over: a session that has already sent its account returns to its receipt.

1. Agree to the consent card.
2. Answer the overall question with "Negatively".
3. Send the five student lines, either by pressing "Line 1" to "Line 5" in the demo bar or by typing them. They are in `frontend/src/demoScript.ts` and match `tests/fixtures/storyboard.py`. Each press needs the previous reply to have arrived.
4. After line 2, press `s` (or the "System view" button) to open the system view and watch the scores and checks change turn by turn.
5. When the chat reaches the sufficient message, or sooner by choosing the "Check my summary" chip, read the summary.
6. Edit the "How often" row, then press Approve and send.
7. Read the receipt: the reference code, the live count, and the ledger of your account against the group's.

"Restart demo" calls the reset endpoint, which restores the six seed accounts and clears all sessions, then reloads the consultation. It is the way to run the walkthrough twice in a row.


## Tests

From the repository root:

```
.venv/bin/python -m pytest -v
npm --prefix frontend test
npm --prefix frontend run build
```

The backend suite never calls a real model, even if `.env` holds a key. `npm run build` also type-checks the frontend.

`scripts/judge_ack.py` asks a judge model whether each logged acknowledgement reuses the student's words; it makes real calls and is never run by the test suite (`.venv/bin/python -m scripts.judge_ack`, or `--dry-run` to print the prompts only). The judge runs on `LLM_JUDGE_PROVIDER` (default `anthropic`) with `LLM_JUDGE_MODEL`, which defaults to that provider's default model. That is the extractor's own model when the chat also runs on Anthropic's default, so set `LLM_JUDGE_MODEL` to a different model for an independent judge.

## Logs

Each chat turn is written as one line of JSON to `backend/logs/<session>.jsonl`: answered turns, chip actions, the written fallback and model failures. A crisis disclosure is never written. A line includes the raw output of the language model for that turn, so the files can contain students' words verbatim. Choosing Delete (after "Stop and delete", or "Delete what I typed" after a crisis) removes the session's log file along with the draft; the logs of submitted or abandoned sessions stay. The folder is git-ignored. Delete it before sharing the project folder.

## How it works

Feedback Schema V2 has five dimensions: what happened (Q1), how often (Q2), the effect on the student (Q3), the basis for the account (Q4) and what would make it better (Q5). Each has a handful of named checks, and each is scored 0, 1 or 2 by fixed rules. Q1 scores 2 with the behaviour plus at least four of the other checks (place, location, persons, time, conditions, activities). Q2 scores 2 when the number, timeframe and context are all given. Q3 scores 2 with an impact type, a consequence and a degree. Q4 scores 2 when the student experienced or directly observed it, and 1 when only the mode is stated. Q5 scores 2 with a specific action linked to the problem plus an actor, scope or outcome.

The engine reads each message by extract-then-score: the language model only pulls verbatim spans out of the student's words, and the code checks that every span really occurs in the transcript, fills in the checks and computes the scores. Code then picks the next question in the order Q1, Q3, Q2, Q4, Q5, asking only for the first unmet check. No question is asked twice: when the answer to a question still leaves its check unmet, that dimension is left partial and the order moves on. It stops when Q1 to Q4 are closed, when nothing un-asked is left, or after five follow-ups, and asks Q5 once the earlier dimensions are sufficient. Questions are templated text; the model contributes only a short acknowledgement that reuses the student's own words. The summary is extractive, quoting the student rather than rewriting; a span already contained in another span of the same row is left out, so nothing is quoted twice. Submit is guarded: nothing is stored until the student approves the summary, and an account is classified into a theme and group, with the theme counts computed from stored accounts rather than written by the model. A group the model proposes is stored as pending and shown to the student as "New group, pending review", never by the model's name for it.

## What is fictional

- The six seed accounts in `backend/seeds.json` (four on transport, one on food, one on study), with their five groups. Every count on the receipt is these six plus your own submission.
- The reference codes, which are random `KR-` numbers with no meaning outside this app.
- The consultation itself, "Campus visitors and student experience", and its placeholder closing date. NUSSU has not set it.

## Known limitations

- The V2 scores are not validated against human raters. They are a transparent rule set, not a measured one.
- There is one consultation, defined in `backend/content.py`.
- Sessions are held in memory and are lost when the backend restarts. Submitted accounts are kept in `backend/kopichat.db`, and a reload after a restart returns a submitted session to its receipt, but a half-finished chat is not kept.
- The chat logs keep students' raw messages and the raw model output.
- The ledger on the receipt shows only the student's own group and the rows that differ from the group's first account, not every account.
- The unclear options offered when a message is ambiguous are written by the language model, so they can be imperfect. The student can always type their own answer instead.
