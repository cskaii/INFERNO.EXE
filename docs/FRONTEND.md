# Frontend developer handoff - The Blackout

You own the frontend functionality, HTML and CSS. The backend is implemented in backend/.
Build on frontend/index.html, frontend/app.js and frontend/style.css; you do not need to rebuild the working game from scratch.

## 1. Existing features to preserve

- Start screen, incident brief and three-stage navigation.
- Five-minute countdown and stage progress indicators.
- Stage 1: encrypted phrase, backup-cell clue, adjustable Caesar wheel and answer form.
- Stage 2: simulated terminal, output history, evidence status and diagnosis form.
- Stage 3: collected evidence review and recovery form.
- Three optional progressive hints per stage.
- Success, timeout and next-team restart screens.
- Backend API calls and basic error messages.

These features are implemented, but still need browser and visitor testing after your changes.

## 2. Your remaining tasks

### AI panel in Stage 2

- [ ] Add a controller conversation panel alongside the terminal.
- [ ] Create suggested-question buttons from state.ai.questions, using each item's id and text.
- [ ] Optionally allow custom questions, limited to 300 characters.
- [ ] Send questions to POST /api/ai, then display the player's question and returned reply.
- [ ] Render dialogue with textContent or text nodes. Never insert model output with innerHTML.
- [ ] Show a responding indicator and disable AI controls while a request is pending.
- [ ] Keep the countdown updating and terminal/hints usable while waiting for AI.
- [ ] Show a small scripted-mode notice when mode is scripted; this is a playable fallback, not an error.
- [ ] Display state.ai.remainingRequests and respect the three-second request cooldown.
- [ ] Handle errors with the actions described below.
- [ ] Stop accepting questions after expiry or after leaving Stage 2.
- [ ] Ignore late responses from an older session or stage; they must not replace the current screen.

Do not make talking to the AI mandatory: the backend unlocks Stage 3 using collected evidence and the diagnosis.
The AI is supporting dialogue. It does not check puzzle answers or decide whether a player wins.

### Refresh recovery

- [ ] Save sessionId in sessionStorage after a successful start.
- [ ] On reload, call GET /api/state with the saved ID before starting a new session.
- [ ] Restore the stage, countdown, terminal transcript, revealed hint and AI conversation.
- [ ] If state.ai.pending is true after refresh, poll state until the in-flight request completes.
- [ ] Show the timeout screen for expired:true and success screen for finished:true.
- [ ] On 401, clear the saved ID and offer a new mission.
- [ ] On next-team restart, replace the saved ID and clear all old UI state.
- [ ] Do not turn a temporary connection error into a new mission.

Do not save the countdown as a new deadline in the browser. The server keeps the original deadline.
Refreshing must not grant more time.

### Loading and error behaviour

- [ ] Visibly disable the relevant submit button while its request is processing.
- [ ] Re-enable controls in a finally block, unless the stage or mission has ended.
- [ ] Keep errors next to the relevant form and announce important status changes.
- [ ] Preserve input when a request fails so players can retry.
- [ ] Continue polling game state during AI requests; use a separate AI loading flag from other actions.
- [ ] Avoid overlapping state polls and ignore stale responses.
- [ ] Do not automatically retry AI requests: they may consume another request allowance.

### CSS and usability

- [ ] Finalise the Blackout visual theme across all screens.
- [ ] Make the simulated terminal resemble a Linux terminal with a clear prompt and readable history.
- [ ] Keep command entry keyboard-friendly: Enter executes and focus returns to the input.
- [ ] Keep the enlarged wheel and backup-cell labels readable. Cell numbers identify cells; count FAILED cells for the key.
- [ ] Make wheel controls, AI panel, terminal and forms fit the event's screen sizes.
- [ ] Provide labels, keyboard navigation, visible focus and readable colour contrast.
- [ ] Respect reduced-motion preferences and avoid flashing effects.
- [ ] Use visual and text indicators for progress/errors, not colour alone.

## 3. Run the project

Requires Node.js 22+.

~~~bash
npm ci
npm start
~~~

Open http://localhost:3000. Express serves both frontend and backend, so relative /api URLs work.
Use npm run dev for automatic server restarts; restarting clears in-memory sessions.

You do not need the Gemini key to develop the panel. The endpoint returns scripted replies when no key is configured.
The backend owner manages .env and hosting secrets. Never put the key into frontend files, browser storage or browser requests.
Mocked backend tests do not establish that a live Gemini key/model has been verified.

## 4. API contract

All paths below are relative to the backend origin.
Send Content-Type: application/json for POST requests.
After starting, include x-session-id: SESSION_ID on every session request.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | /api/health | No session required | { "ok": true } |
| POST | /api/start | {} (no session required) | { "sessionId": "...", "state": {...} } |
| GET | /api/state | Session header | The state object directly, not { state: ... } |
| POST | /api/answer | { "stage": 1, "value": "decoded words" } | { "ok": true/false, "message": "...", "state": {...} } |
| POST | /api/terminal | { "command": "ls" } | { "output": "...", "state": {...} } |
| POST | /api/hint | {} | { "ok": true/false, "message": "...", "state": {...}, ... } |
| POST | /api/ai | { "questionId": "alarm-status" } OR { "message": "Why are the alarms silent?" } | { "reply": "...", "mode": "gemini" or "scripted", "fallbackReason": null or a reason, "state": {...} } |

Terminal and AI endpoints only work in active Stage 2.
Terminal commands and answer values must be non-empty strings up to 150 characters.
Custom AI messages must contain 1-300 characters.
If both questionId and message are sent, a valid questionId takes precedence; unknown question IDs are rejected.

Suggested AI IDs:
- grid-status
- alarm-status
- last-change

Use the labels returned in state.ai.questions rather than duplicating their text.

### Example AI request

This is a connection example; adapt it to your panel and error handling.

~~~js
const response = await fetch('/api/ai', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': sessionId
  },
  body: JSON.stringify({ questionId: 'alarm-status' })
});
const data = await response.json();
if (!response.ok) throw new Error(data.error);
replyElement.textContent = data.reply;
// Apply data.state only if this response belongs to the current session/stage.
// Add dialogue to the panel and display a fallback notice if mode === 'scripted'.
~~~

Fallback reasons: not_configured, provider_error, unavailable_response, timeout.
The backend normally switches to fallback after an eight-second AI timeout.
Fallback replies still count toward the question allowance.
state.ai.configured means a key is present, not that Google has verified it.

### State fields

| Field | Frontend use |
| --- | --- |
| stage | Render Stage 1, 2 or 3; check finished/expired before rendering a playable screen |
| remainingSeconds | Authoritative countdown; poll /api/state about once per second |
| finished / expired | Show success or timeout and disable mission controls |
| cipher.message | Display the encrypted phrase |
| cipher.failedCells | Build the eight-cell backup clue |
| readFiles / evidenceReady | Show investigation progress |
| hintsUsed | Display total hints on completion |
| revealedHints | Stage number mapped to the latest revealed { level, total, message } |
| terminalHistory | Last 50 { command, output } entries, available for refresh and evidence review |
| ai.questions | Suggested { id, text } question buttons |
| ai.remainingRequests | Remaining session question allowance |
| ai.pending | Whether the controller is already processing a request |
| ai.history | Conversation entries: { question, reply, mode, fallbackReason } |
| ai.configured | Key presence only; do not display it as a verified connection |

Hints return level and total when revealed successfully.
After level 2, label the final hint as a walkthrough so players know it contains the solution.
After level 3, disable further hint requests for that stage.

### Existing answer form wiring (developer reference)

Keep answer values consistent with the existing implementation:
- Stage 1: send the player's decoded words. Do not embed the correct phrase in frontend code.
- Stage 2: combine attack option and source option with a colon, e.g. attack-id:filename.
  The existing attack IDs are credential-theft, data-poisoning, prompt-injection and denial-of-service.
- Stage 3: combine containment filename, lowercase snapshot ID and safety action with colons.
  Snapshot IDs are a/b/c. Safety IDs are clear-logs, keep-muted, enable-alerts and trust-imports.

The backend checks the combination. Do not validate correct answers or advance stages locally.
Incorrect puzzle answers return HTTP 200 with ok:false. Display message and remain on the current stage.

### HTTP errors

Errors contain { "error": "..." }, sometimes with state or retryAfter.

| Status | Frontend action |
| --- | --- |
| 400 | Explain invalid input and preserve it for correction |
| 401 | Session missing/unknown: clear saved ID and offer a new mission |
| 403 | Apply returned state if present; handle expiry/stage lock. A disallowed origin needs configuration by the backend owner |
| 409 | AI already pending: wait/poll state instead of sending again |
| 429 | Respect retryAfter / Retry-After when supplied; otherwise explain the question allowance may be exhausted |
| 413 | Request too large: shorten input |
| 503 | Explain unavailability; allow continued investigation or a deliberate retry |
| Network failure | Show connection issue; preserve session and retry state polling without resetting the mission |

Defaults: six AI questions per session, one in flight, three seconds between requests.
Shared server limits also apply. Read remainingRequests from state rather than hard-coding it.

## 5. Working with the backend owner

- Agree on any API changes before changing payloads.
- Work mainly in frontend/; the backend owner works in backend/.
- Keep IDs used by JavaScript aligned with the HTML, even when classes/styles change.
- Use separate Git branches and avoid committing secrets or node_modules.
- For separate hosting, obtain the backend base URL and give the backend owner the exact frontend origin for FRONTEND_ORIGIN.
- Do not attempt to fix CORS using no-cors. The server must allow the frontend origin.
- There is no requirement to add accounts, a database or a leaderboard.

Sessions and transcripts live in server memory and disappear after restart.
The current deployment must use one Node process / one hosting instance.
Ask the backend owner about persistence before depending on long-term saved progress.

## 6. Acceptance checklist before handoff

- [ ] Complete all three stages with correct answers.
- [ ] Wrong answers stay on the current stage and show useful feedback.
- [ ] Terminal output preserves commands/history and scrolls to new output.
- [ ] Each stage reveals hints progressively and caps at three.
- [ ] Wheel changes offset visibly and still maps letters correctly.
- [ ] AI suggested questions and custom input work; replies appear as plain text.
- [ ] AI fallback is clearly indicated and does not block puzzle completion.
- [ ] Duplicate clicks, pending replies, cooldowns and exhausted allowance are handled.
- [ ] The timer continues during AI loading and connection failures.
- [ ] A late reply cannot reopen a stage or overwrite a new team's screen.
- [ ] Refresh restores progress, histories and latest revealed hint without adding time.
- [ ] Expiry and success screens disable gameplay and allow the next team to start cleanly.
- [ ] Two browser sessions/teams do not see each other's history or progress.
- [ ] Keyboard-only use and event screen sizes are tested.
- [ ] Beginner visitors can complete the whole experience within five minutes with optional hints.

Use npm test for backend regression checks. It does not replace browser testing or visitor playtesting.
