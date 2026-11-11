const crypto = require('node:crypto');
const config = require('../config');
const { QUESTIONS } = require('./aiService');
const sessions = new Map();
const DURATION_MS = 5 * 60 * 1000;
const REQUIRED_FILES = ['incident.log', 'update.txt', 'recovery.txt'];
function encrypt(text, shift) {
  return text.replace(/[A-Z]/g, letter => String.fromCharCode(65 + (letter.charCodeAt(0) - 65 + shift) % 26));
}
function createSession() {
  cleanupSessions();
  if (sessions.size >= 1000) throw new Error('Session capacity reached');
  const id = crypto.randomUUID();
  sessions.set(id, {
    stage: 1, shift: crypto.randomInt(3, 8), startedAt: Date.now(),
    finished: false, readFiles: [], hints: { 1: 0, 2: 0, 3: 0 },
    hintMessages: {}, terminalHistory: [], aiHistory: [], aiRequests: 0, aiPending: false, aiLastAt: 0
  });
  return id;
}
function getSession(id) { return sessions.get(id); }
function publicState(s) {
  const elapsed = (s.finishedAt ?? Date.now()) - s.startedAt;
  return {
    stage: s.stage,
    remainingSeconds: Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000)),
    finished: s.finished,
    expired: !s.finished && elapsed >= DURATION_MS,
    readFiles: [...s.readFiles],
    evidenceReady: REQUIRED_FILES.every(file => s.readFiles.includes(file)),
    cipher: { message: encrypt('RESTORE GRID', s.shift), failedCells: s.shift },
    hintsUsed: Object.values(s.hints).reduce((sum, count) => sum + count, 0),
    revealedHints: { ...s.hintMessages },
    terminalHistory: s.terminalHistory.map(turn => ({ ...turn })),
    ai: {
      configured: Boolean(config.apiKey), questions: QUESTIONS,
      remainingRequests: Math.max(0, config.sessionLimit - s.aiRequests),
      pending: s.aiPending, history: s.aiHistory.map(turn => ({ ...turn }))
    }
  };
}
function valid(s) { return Boolean(s && !s.finished && Date.now() - s.startedAt < DURATION_MS); }
function answer(s, stage, value) {
  const result = (ok, message) => ({ ok, message, state: publicState(s) });
  if (!valid(s)) return result(false, 'Mission ended. Start a new mission to try again.');
  if (s.stage !== stage) return result(false, 'Complete the current stage first.');
  if (stage === 2 && !publicState(s).evidenceReady) {
    return result(false, 'Evidence incomplete. Trace the controller event, inspect its source and locate the recovery inventory.');
  }
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const correct = stage === 1 ? normalized === 'restore grid'
    : stage === 2 ? normalized === 'prompt-injection:update.txt'
    : stage === 3 ? normalized === 'update.txt:b:enable-alerts' : false;
  if (!correct) return result(false, 'That combination does not match the evidence. Recheck the clues or request a hint.');
  if (stage === 3) {
    s.finished = true;
    s.finishedAt = Date.now();
  } else s.stage++;
  return result(true, s.finished ? 'Power restored. Mission complete!' : 'Verified. Next stage unlocked.');
}
function hint(s) {
  if (!valid(s)) return { ok: false, message: 'Mission ended.', state: publicState(s) };
  const shift = s.shift;
  const hints = {
    1: [
      'The dark cells on the backup panel give the key. Encryption moved forward; decoding must reverse it.',
      'There are ' + shift + ' failed cells. Set the wheel to ' + shift + ' and read each outer letter as the inner letter. ' + encrypt('R', shift) + ' becomes R.',
      'Walkthrough: set the wheel to ' + shift + ', then decode both words. The password is RESTORE GRID.'
    ],
    2: [
      'Use ls, then cat incident.log. Follow the import entry rather than the harmless power-status report.',
      'Read update.txt and recovery.txt. Ask which file tells the assistant to ignore rules rather than simply report measurements.',
      'Walkthrough: read incident.log, update.txt and recovery.txt. Submit Prompt injection with update.txt as the source.'
    ],
    3: [
      'Stop the source of the attack before restoring. Compare backup times and integrity checks with the incident time.',
      'The incident began at 02:14. The latest backup was taken afterwards; the oldest failed its integrity check. Choose the remaining backup and restore monitoring.',
      'Walkthrough: quarantine update.txt, restore Snapshot B, and re-enable safety alerts.'
    ]
  };
  const index = Math.min(s.hints[s.stage], 2);
  s.hints[s.stage] = Math.min(index + 1, 3);
  s.hintMessages[s.stage] = { level: index + 1, total: 3, message: hints[s.stage][index] };
  return { ok: true, level: index + 1, total: 3, message: hints[s.stage][index], state: publicState(s) };
}
function cleanupSessions() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of sessions) if (session.startedAt < cutoff) sessions.delete(id);
}
setInterval(cleanupSessions, 60 * 1000).unref();
module.exports = { createSession, getSession, publicState, valid, answer, hint, encrypt, DURATION_MS, cleanupSessions };
