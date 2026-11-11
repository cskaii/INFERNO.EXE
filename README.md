# The Blackout

A three-stage cybersecurity escape room for an open house. Players restore a power system compromised by a malicious instruction targeting its AI controller.

## Run
Requires Node.js 22+ and npm. Run these commands from the The-Blackout folder containing package.json.

~~~bash
npm install
npm start
~~~

Open http://localhost:3000. Use npm run dev for automatic server restarts. Use npm test for the automated checks.

## Five-minute event format
One server-enforced countdown starts when the team clicks Begin mission. Stage timings are targets, not separate timers. Four minutes of puzzle targets leave one minute for reading, hints and transitions.

| Stage | Target | Challenge |
| --- | --- | --- |
| 1 - Crack the Code | 1 minute | Infer the shift from the backup-panel clue, adjust the Caesar wheel, then decode two words. |
| 2 - The Corrupted AI | 2 minutes | Investigate simulated Linux files, distinguish useful evidence from decoys, and identify both the attack and source. |
| 3 - Emergency Override | 1 minute | Choose a containment target, a valid pre-incident snapshot, and a final safety action. |

Each stage has an optional hint button. First comes a nudge, then a specific clue, then a clearly labelled walkthrough. Hints have no additional time penalty; the shared countdown continues. They do not auto-submit answers or unlock stages. The completed mission shows how many hints were revealed.

Wrong answers allow retries without extra time penalties or revealing which component was correct. Players can review the full collected terminal transcript in Stage 3. Both end screens allow a fresh mission for the next team, resetting hints and selecting a new random Caesar offset (3-7; the same key can recur).

The pacing is designed for a short event but has not been validated with visitor playtesting. Before the open house, trial it with beginners and check they can finish within five minutes using hints when needed.

## Facilitator walkthrough (spoilers)
1. Count FAILED cells on the panel. That number is the encoder's forward offset. Set the wheel to that offset and map each outer letter to its inner letter. The message decodes to RESTORE GRID. The offset varies by session.
2. Run help or ls. Read incident.log, follow the Job-17 import to update.txt, and read recovery.txt. All three are required; status.txt and readme.txt are optional. Submit Prompt injection and update.txt. The imported file contains an instruction to override safety rules and conceal the incident.
3. Quarantine update.txt. Restore Snapshot B: its 02:10 timestamp precedes the 02:14 event and its integrity check passes. Snapshot A is newer but post-incident; Snapshot C fails integrity. Re-enable safety alerts.

Explain afterwards that instructions hidden in untrusted content can manipulate an AI. External files should be treated as evidence rather than trusted instructions.

## Structure
- frontend/index.html - mission brief, countdown and three-stage progress.
- frontend/style.css - dark cyber operations theme, puzzle controls and hint panels.
- frontend/app.js - adjustable Caesar wheel, terminal transcript, diagnosis and recovery forms, optional hints.
- backend/server.js - Express server and static frontend hosting.
- backend/routes/game.js - start, state, answer, hint and terminal API endpoints.
- backend/services/gameEngine.js - cipher generation, stage validation, staged hints and five-minute deadline.
- backend/services/virtualLinux.js - safe simulated filesystem and commands.
- backend/middleware/ - session checks and input validation.
- test/backend.test.js - backend mission flow, AI, session recovery, limits and error handling checks.

## Development notes
- The original terminal incident remains scripted. The new Stage 2 AI endpoint supports Gemini when configured and falls back to scripted dialogue. The frontend AI panel still needs to be connected.
- The terminal never executes real operating-system commands.
- Sessions are stored in memory and reset when the server restarts.
- Answers and hint walkthroughs are kept on the server rather than embedded in the frontend.

## Backend and Gemini integration

See [Frontend tasks and API reference](docs/FRONTEND.md) for the API contract, frontend integration,
session recovery and frontend testing instructions.

Paste your private replacement Gemini key into .env beside package.json as GEMINI_API_KEY=...
Real .env files are ignored by Git. On Render, use its Environment settings instead.
The backend works with scripted controller replies until the key is configured.
