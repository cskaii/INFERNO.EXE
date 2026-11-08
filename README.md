# Inferno.exe — Working full-stack starter

A four-stage InfoSec escape room prototype. **Frontend:** HTML/CSS/vanilla JavaScript. **Middleware:** Express request validation and session checks. **Backend:** Node.js + Express routes, puzzle engine, and safe virtual Linux simulation.

## Requirements
Node.js 18+ and npm. Internet is needed once to install Express; the game itself does not call any AI API.

## Run
```bash
npm install
npm start
```
Visit **http://localhost:3000**. For automatic server restarts during development, use `npm run dev`.

## Structure
```
frontend/
  index.html        Browser UI
  style.css         Theme
  app.js            Frontend API calls and stage screens
backend/
  server.js         Express server and static frontend hosting
  middleware/
    session.js      Session authentication for game API
    validation.js   Input validation
  routes/
    game.js         /api/start, /api/state, /api/answer, /api/terminal
  services/
    gameEngine.js   Puzzle answers, stages, timer, in-memory sessions
    virtualLinux.js Safe simulated command interpreter
```

## How to play
1. Decrypt the Caesar cipher (shift 3).
2. In the terminal, run `help`, `ls`, and `cat incident.log`.
3. Recognize the injected AI instruction as untrusted.
4. Find the recovery action in `recovery.txt` (or use the evidence from earlier).

## Notes for club developers
- This is a playable **prototype**, not a production-ready deployment.
- The AI stage is scripted, not connected to a live model. This is deliberate for offline reliability.
- The terminal is a virtual filesystem and **never executes OS commands**.
- Game sessions live in memory; restarting the server clears them.
- Timer is server-enforced; no database, leaderboard, or facilitator admin panel yet.
- The frontend is **vanilla JavaScript**, not React, to minimize setup and make the starter runnable with only Express. You can migrate it to React later.
- For an event with multiple machines, add persistent sessions, a session cleanup strategy, accessibility testing, and deployment/security hardening.
