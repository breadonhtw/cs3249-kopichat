# Lumen CUI starter

A counselling pre-consultation starter for exploring wellbeing questions, voluntary disclosure and staff handover.

Replies and handovers follow local scripts. Records stay in memory until you refresh or restart the session. Use fictional answers.

## Start the project

Use an editor, a browser and **Node 18.13–18.x, 20.x, or 22+**. For a new installation, choose **Node 24 LTS** with npm from [nodejs.org](https://nodejs.org/en/download), then reopen your terminal. Validated on macOS.

Extract the ZIP. Open the folder containing `package.json` in your editor, then open its terminal. Check your installation:

```sh
node -v
npm -v
```

Run these commands in order:

| Command | Purpose | Success looks like |
| --- | --- | --- |
| `npm run setup` | Install the versions in the lockfile | `Installed` |
| `npm run doctor` | Check your environment and compile the frontend | `Environment checks passed` |
| `npm start` | Start the local preview | Lumen opens in your browser |

Setup installs the locked dependencies and applies a LocatorJS path compatibility fix. It needs internet access; the installed prototype runs offline. Use the printed address, usually `http://127.0.0.1:5173/`; the port adjusts when occupied.

Keep the terminal running while you work. Save a source file to update the preview; press `Ctrl+C` to stop. **Next time, run `npm start`.**

On Windows, use Command Prompt. In PowerShell, use `npm.cmd` if it blocks `npm.ps1`, for example `npm.cmd run setup`.

## Try the conversation

### Normal session

1. Click **Start pre-consultation**.
2. Choose a wellbeing option and click **Continue**, or select **Use my own words** and send a message.
3. Answer the concerns and day-to-day impact questions. **Skip this question** is available for each question.
4. Review your responses and click **Confirm and finish**.

Inspect records in **Simulation → Submitted data**. Unsent text stays as a draft; skipped questions are marked as unanswered. **Restart demo** resets the current scenario's session.

### Simulated handover

1. Open **Simulation** and select **Risk**. This starts a fresh session and closes the panel.
2. Reopen **Simulation**, set **Notification result** to **Failed**, then close the panel.
3. Start the conversation and answer or skip the wellbeing question.
4. Send a fictional answer to the concerns question. The Risk preset triggers the failed support request.
5. In **Simulation**, select **Delivered**, close the panel, then click **Try again**. The request keeps its ID and answers.
6. Wait for **Simulated request delivered**. Open **Simulation**, click **Simulate staff joining**, then close the panel to see the handover.

Skipping concerns continues to the impact question. Selecting **Normal** returns to a fresh normal session.

## How the project works

| Tool | Role in this project |
| --- | --- |
| Node / npm | Run local tools and install dependencies |
| React / TypeScript | Define interface components and interaction code |
| CSS | Set colours, spacing and layout |
| assistant-ui | Manage chat messages and the message input |
| Radix | Provide tabs, radio groups and the Simulation dialog |
| Vite | Serve the preview and update it when you save |

Actions travel through:

```text
User action → action handler → mock service → updated interface
```

Components display controls, `usePreconsultation.ts` handles actions and drafts, and `mock/service.ts` updates the conversation stage and submitted records.

## Find and change code

Choose **text**, **appearance**, or **behaviour**, then use the file map or search for visible wording in your editor.

Hold **Option** on macOS or **Alt** on Windows and click a component. LocatorJS opens its source location; choose your editor when prompted. Trace behaviour through the control's event handler.

For example, the concerns skip button follows this path:

```text
DisclosureQuestion.tsx: onSkip
→ usePreconsultation.ts: skipQuestion()
→ mock/service.ts: respond() handles the skip action
```

### Make a first change

Open [theme.css](src/styles/theme.css), change `--page` to `#eef3ff`, and save. The page background updates. Undo and save to restore the colour.

### File map

| Change | Start here |
| --- | --- |
| Questions, options and welcome text | [fixtures.ts](src/mock/fixtures.ts) |
| Shared colours and dimensions | [theme.css](src/styles/theme.css) |
| Layout, bubbles and shared buttons | [app.css](src/styles/app.css) |
| Header | [Header.tsx](src/components/Header.tsx) |
| Messages and input | [Chat.tsx](src/components/Chat.tsx) |
| Wellbeing choices and answer modes | [WellbeingQuestion.tsx](src/components/WellbeingQuestion.tsx) · [CSS](src/components/WellbeingQuestion.css) |
| Disclosure notice and skip button | [DisclosureQuestion.tsx](src/components/DisclosureQuestion.tsx) |
| Review and completion | [ReviewCard.tsx](src/components/ReviewCard.tsx) |
| Handover status and retry | [HandoverCard.tsx](src/components/HandoverCard.tsx) |
| Component shown at each stage | [ScenarioControls.tsx](src/components/ScenarioControls.tsx) |
| Actions and drafts | [usePreconsultation.ts](src/usePreconsultation.ts) |
| Flow rules and submitted records | [service.ts](src/mock/service.ts) |
| Simulation controls | [SimulationControls.tsx](src/components/SimulationControls.tsx) · [CSS](src/components/SimulationControls.css) |

### Working with an AI coding tool

Open this folder in your AI coding tool. Ask it to read this README, identify relevant files and explain its plan. Reuse existing UI libraries, keep flow rules in the mock service, and preserve event handlers during visual changes. Review the edited files and the tool's explanation.

## Check your changes

Save, restart the demo, and try the affected interaction. Compare visible answers with **Simulation → Submitted data**. Also try skipping or retrying where relevant.

In a second terminal in the project folder, run:

```sh
npm test
npm run build
```

`npm test` checks flow rules, startup scripts and source-path handling. `npm run build` checks TypeScript and creates production files. Judge the interaction against your design goal in the browser.

## Troubleshooting

| Situation | Next step |
| --- | --- |
| `node` or `npm` command error | Install Node with npm, reopen the terminal, then run `node -v` and `npm -v`. |
| `package.json` path error | Open a terminal in the extracted folder containing `package.json`. |
| Setup or environment check fails | Follow the printed commands, then rerun `npm run doctor`. |
| Browser shows a source error after editing | Undo the last edit, save, and try again. |
| Locator needs an editor | Choose your editor in its dialog, or open a file from the map above. |

To restore the baseline, extract the original ZIP into a new folder and run setup there. Keep your working folder. For help, share the terminal error and doctor output with your tutor.
