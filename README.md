# Kopichat

Kopichat is a student-facing consultation chat for NUSSU, built for CS3249 Conversational User Interface. A student shares one real experience on a topic NUSSU has set, sees exactly what will be sent, and approves it before anything leaves the phone. It collects one account under Feedback Schema V2, with follow-up questions chosen by code rather than by the language model. Every account and count on screen is fictional seed data, plus the one live submission you make yourself.

The repository also holds the matched written form that the user study compares the chat against, at `/form`, and a script that exports what both collected as plain text for blind coding. See "User study" below.

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

Open `.env` and paste your SoCLaaS key after `OPENAI_API_KEY=` and set `LLM_MODEL=default`, or paste an Anthropic key after `ANTHROPIC_API_KEY=` and leave `LLM_MODEL` empty. For a personal OpenAI key, also set `OPENAI_BASE_URL=https://api.openai.com/v1` and set `LLM_MODEL` to one of your account's models. With `LLM_PROVIDER` empty the app uses whichever key is set (Anthropic first). Keys go in `.env` only, never in `backend/llm.py`.

Which model you use changes how well the chat handles unusual messages. The user study and the system tests ran on Anthropic's `claude-sonnet-5-5`. On SoCLaaS (which served `qwen3.6:35b` when tested on 23 November 2026), the full chat still works end to end, and the code's own guarantees still hold:
- a crisis message gets the fixed reply,
- an instruction aimed at the app cannot send the account,
- there are never more than five follow-ups,
- the summary only quotes the student.

But the routing that depends on the model's reading does not hold on SoCLaaS. Off-topic requests, vague replies and named individuals are treated as experiences and use up a follow-up. Some replies also take just over 8 seconds. On SoCLaaS, add `LLM_TIMEOUT=15` to `.env` so a slow reply is not shown as "The assistant is unavailable right now".

Then, still from the repository root, install the frontend:

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

There are two consultations. A plain link opens "Campus visitors and student experience"; `?topic=study` opens "Study spaces during reading week and exams" (`?topic=visitors` names the first one outright). The same parameter works on the chat (`/`), the form (`/form`) and the reviewer view (`/review`).

## No key?

Without a key for the chosen provider the app still opens and the consultation page, consent and the overall question all work, as do the chips ("Skip this question", "Why do you ask?", "Pause", and deleting a draft). Every free-text message gets one plain line in reply: this app needs an LLM to run, add an API key in `.env`, then restart the server. The follow-up questions do not advance without a key, because they depend on reading the student's words. After two such replies in a row the written fallback opens: five plain questions answered in one form, sent without the model, straight to the summary. An account sent that way is stored unclassified and shown as "Not grouped yet. A reviewer will place it."

## Demo walkthrough

Start from a fresh seed state: use "Restart demo" in the demo bar (laptop width, dev server only), or POST `/api/admin/reset`. A reload after a backend restart does not start over: a session that has already sent its account returns to its receipt.

1. Agree to the consent card.
2. Answer the overall question with "Negatively".
3. Send the five student lines, either by pressing "Line 1" to "Line 5" in the demo bar or by typing them. They are in `frontend/src/demoScript.ts` and match `tests/fixtures/storyboard.py`. Each press needs the previous reply to have arrived.
4. After line 2, press `s` (or the "System view" button) to open the system view and watch the scores and checks change turn by turn.
5. When the chat reaches the sufficient message, or sooner by choosing the "Check my summary" chip, read the summary.
6. Edit the "How often" row. Under the rows, "Who may see your words?" is set to NUSSU's consultation team only; choose "NUSSU's team and other students" to put the slip on other students' noticeboards. Then press Approve and send.
7. Watch the receipt: "Received" stamps, your slip is carried onto the noticeboard and pressed on, the count goes from 6 to 7, and the two other accounts in your group are carried over beside it. A tap anywhere skips to the end. Then read the reference code, the group label and what was sent.
8. Cut to NUSSU's side: press `n`, or use "See it on NUSSU's side" in the demo bar (laptop width, dev server only). The reviewer view opens in a new tab on the student's group, with their lines marked in teal and "New: KR-1234. Its lines are marked." at the top. Students never see this link.

"Restart demo" calls the reset endpoint, which restores the seed accounts, deletes every submission from the chat and the form, and clears all sessions, then reloads the consultation. It is the way to run the walkthrough twice in a row. With `KOPICHAT_STUDY=1` in `.env` the endpoint is refused.


## User study

The study compares the chat with a matched written form. Each participant uses one on each consultation.

| | Campus visitors | Study spaces |
|---|---|---|
| Chat | `/?topic=visitors&p=P01` | `/?topic=study&p=P01` |
| Form | `/form?topic=visitors&p=P01` | `/form?topic=study&p=P01` |

`p` is the participant's study code. It is stored with the submission, never shown on screen, and gives each participant their own session, so one phone can be handed from one participant to the next. Leave it out and the link still works.

The form shows the same consultation title and introduction, the same line that good, bad, no-effect and not-sure experiences are all welcome, the same notice before the first question, and the same overall question. Then it asks the five schema questions as five boxes on one page, in the schema's order, with no follow-ups and no language model, and ends with a review page where every answer can be edited before an explicit Submit. The notices differ only where the chat's sentence would be untrue of the form: the form does not say an AI reads the answers, and it has no summary and no noticeboard. What is typed stays in the browser tab until Submit; before that the server holds only the time the link was opened.

To run a session on participants' phones, build the frontend, set `KOPICHAT_STUDY=1` in `.env`, and start the backend so other devices on the same network can reach it:

```
npm --prefix frontend run build
.venv/bin/python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

Then open `http://<this laptop's address>:8000/form?topic=study&p=P01` on the phone (on macOS, `ipconfig getifaddr en0` prints the address). Start from a clean store before the first participant: POST `/api/admin/reset` once, before `KOPICHAT_STUDY` is set.

Both channels record the time from opening the link to the confirmed submission, on the server's clock. To export what was sent:

```
.venv/bin/python -m scripts.export_submissions
```

This writes `study-export/blind/<id>.txt` for each submission, plus `all_submissions.txt`, for the coders, and `study-export/key.csv` for the team only. A chat account and a form submission come out in one layout, under a random id (`S-` and five characters), with no channel label and no reference code: the overall view, what happened, how often, the effect, how the student knows and the suggestion always appear, with "(no answer)" for a question left empty. Three rows only the chat can fill (what the student saw, their read on the cause, a feeling in their words) appear only when they hold text. Wording is never changed, so a coder may still guess the channel from style. `key.csv` gives each id's channel, topic, participant code, reference, opening and submission times, seconds taken, rows edited at review and, for the chat, the visibility chosen. Seed accounts and withdrawn submissions are left out. The folder is git-ignored.

## Reviewer view

NUSSU's side is at http://localhost:5173/review (or http://localhost:8000/review from the built app); add `?topic=study` for the study-spaces consultation. It lists the consultation's groups, largest first, with the accounts no group holds yet as one more entry, and shows the chosen group as a comic strip: what happened, how often, the effect, their read on the cause and what would help, and the accounts that differ. Every caption line is a stored field quoted as the student left it, with who said it (a seed letter or a KR reference) and a count such as "2 of 3 said"; a skipped or missing field says so. Nothing on the page is written by a model.

Every seed group of the campus-visitors consultation has illustrations, in `frontend/public/strips/`; the study-spaces groups are text only. NUSSU reads every account, and a line from an account whose writer chose "NUSSU's consultation team only" is marked "private: for NUSSU only". They were drawn with gpt-image-2, from reference photos where there were any and matched to the morning-boarding cover, and checked by hand; the table that assigns them is `ART` in `backend/strip.py`. A panel shows a picture only when someone in the group said something for it, and a group missing from the table is shown as text only. The cause panel is never illustrated, because a picture would state a cause the accounts only suspect. The head of the page says what the consultation's period is and how students were reached (both simulated here, and said to be), how many accounts are fictional seeds, and what the counts count: every number is of accounts, one per approved chat submission, never of students, because no identity is collected. Withdrawn accounts are left out of every count; private ones are counted. The view has no sign-in: it is a demo, and a real reviewer view would need NUSSU's sign-in before it shows students' words.

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

The form writes no log; its submissions are in the database only. Each chat turn is written as one line of JSON to `backend/logs/<session>.jsonl`: answered turns, chip actions, the written fallback and model failures. A crisis disclosure is never written. A line includes the raw output of the language model for that turn, so the files can contain students' words verbatim. Choosing Delete (after "Stop and delete", or "Delete what I typed" after a crisis) removes the session's log file along with the draft; the logs of submitted or abandoned sessions stay. The folder is git-ignored. Delete it before sharing the project folder.

## How it works

Feedback Schema V2 has five dimensions: what happened (Q1), how often (Q2), the effect on the student (Q3), the basis for the account (Q4) and what would make it better (Q5). Each has a handful of named checks, and each is scored 0, 1 or 2 by fixed rules. Q1 scores 2 with the behaviour plus at least four of the other checks (place, location, persons, time, conditions, activities). Q2 scores 2 when the number, timeframe and context are all given. Q3 scores 2 with an impact type, a consequence and a degree. Q4 scores 2 when the student experienced or directly observed it, and 1 when only the mode is stated. Q5 scores 2 with a specific action linked to the problem plus an actor, scope or outcome.

The engine reads each message by extract-then-score: the language model only pulls verbatim spans out of the student's words, and the code checks that every span really occurs in the transcript, fills in the checks and computes the scores. Code then picks the next question in the order Q1, Q3, Q2, Q4, Q5, asking only for the first unmet check. No question is asked twice: when the answer to a question still leaves its check unmet, that dimension is left partial and the order moves on. It stops when Q1 to Q4 are closed, when nothing un-asked is left, or after five follow-ups, and asks Q5 once the earlier dimensions are sufficient. Questions are templated text; the model contributes only a short acknowledgement that reuses the student's own words. The summary is extractive, quoting the student rather than rewriting; a span already contained in another span of the same row is left out, so nothing is quoted twice. Submit is guarded: nothing is stored until the student approves the summary, and an account is classified into a theme and group, with the theme counts computed from stored accounts rather than written by the model. A group the model proposes is stored as pending and shown to the student as "New group, pending review", never by the model's name for it.

Before approving, the student chooses who may see their words. The default is NUSSU's consultation team only: the account is counted in every total, but its words are never put on another student's noticeboard or in the "Not everyone had the same experience" list. With "NUSSU's team and other students" the first line of "What happened" can appear there, without the reference code. The receipt says which was chosen. Each consultation has its own themes, groups and counts; the classification prompt is given only the themes of the account's own consultation.

## What is fictional

- The twelve seed accounts in `backend/seeds.json`, six for each consultation. Campus visitors: four on transport, one on food, one on study, in five groups. Study spaces: four on finding a seat, one on opening hours, one on conditions, in five groups. Every count on the receipt is the consultation's six plus the chat submissions made to it.
- The reference codes, which are random `KR-` numbers with no meaning outside this app.
- Both consultations, "Campus visitors and student experience" and "Study spaces during reading week and exams", and their placeholder closing date. NUSSU has not set them.

## Known limitations

- The V2 scores are not validated against human raters. They are a transparent rule set, not a measured one.
- There are two consultations, defined in `backend/content.py`. The follow-up questions and the extraction prompt are shared; only the title, introduction, overall question and themes differ.
- The form's submissions are stored and exported but are not classified, grouped or shown in the reviewer view.
- The visibility choice governs the noticeboard only. The reviewer view has no sign-in, so "NUSSU only" is a rule the app follows, not an access control.
- A session id is kept per browser tab. A participant who closes the tab mid-way and opens the link again starts over, and the clock starts again with them.
- Sessions are held in memory and are lost when the backend restarts. Submitted accounts are kept in `backend/kopichat.db`, and a reload after a restart returns a submitted session to its receipt, but a half-finished chat is not kept.
- The chat logs keep students' raw messages and the raw model output.
- The noticeboard on the receipt shows at most eight slips (the student's, two from the group, then differing accounts and other themes) and says how many more there are. Excerpts on slips are cut at three lines; the full text is under "What was sent".
- The unclear options offered when a message is ambiguous are written by the language model, so they can be imperfect. The student can always type their own answer instead.
- Routing off-topic requests, vague replies and named individuals depends on the model. It was reliable on `claude-sonnet-5-5` and unreliable on SoCLaaS's model (see Setup).
- Asked "are you a real person?", the chat offers options instead of saying directly that it is an AI. The consent notice says so before the chat starts.
