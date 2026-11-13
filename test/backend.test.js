const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Duplex } = require('node:stream');
const { createApp } = require('../backend/server');
const game = require('../backend/services/gameEngine');
const { createAiService } = require('../backend/services/aiService');
const { createLimiter } = require('../backend/middleware/rateLimit');
const { run } = require('../backend/services/virtualLinux');
function request(app, route, body, id, extra = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(chunk, encoding, done) { done(); } });
    const req = new http.IncomingMessage(socket);
    req.method = extra.method || (body === undefined ? 'GET' : 'POST');
    req.url = '/api' + route;
    req.headers = { host: 'localhost', 'content-type': 'application/json', ...(id ? { 'x-session-id': id } : {}), ...extra.headers };
    const payload = extra.raw ?? (body === undefined ? null : JSON.stringify(body));
    if (payload !== null) req.headers['content-length'] = String(Buffer.byteLength(payload));
    const res = new http.ServerResponse(req);
    res.end = function(chunk) {
      try { resolve({ status: this.statusCode, headers: this.getHeaders(), data: chunk ? JSON.parse(String(chunk)) : null }); }
      catch (error) { reject(error); }
      return this;
    };
    app.handle(req, res);
    if (payload !== null) req.push(payload);
    req.push(null);
  });
}
async function session(app, stage = 1) {
  const { data } = await request(app, '/start', {});
  const s = game.getSession(data.sessionId);
  s.stage = stage;
  return { id: data.sessionId, s };
}
test('full existing mission works and evidence is required', async () => {
  const app = createApp();
  const { id, s } = await session(app);
  assert.equal(game.publicState(s).remainingSeconds, 300);
  assert.equal((await request(app, '/answer', { stage: 3, value: 'update.txt:b:enable-alerts' }, id)).data.ok, false);
  assert.equal((await request(app, '/answer', { stage: 1, value: s.passphrase }, id)).data.state.stage, 2);
  assert.equal((await request(app, '/answer', { stage: 2, value: 'prompt-injection:update.txt' }, id)).data.ok, false);
  for (const file of ['incident.log', 'update.txt', 'recovery.txt']) await request(app, '/terminal', { command: 'cat ' + file }, id);
  assert.equal((await request(app, '/answer', { stage: 2, value: 'prompt-injection:status.txt' }, id)).data.ok, false);
  assert.equal((await request(app, '/answer', { stage: 2, value: 'prompt-injection:update.txt' }, id)).data.state.stage, 3);
  assert.equal((await request(app, '/answer', { stage: 3, value: 'update.txt:a:enable-alerts' }, id)).data.ok, false);
  assert.equal((await request(app, '/answer', { stage: 3, value: 'update.txt:b:enable-alerts' }, id)).data.state.finished, true);
  assert.equal((await request(app, '/terminal', { command: 'ls' }, id)).status, 403);
});
test('session recovery returns only that team history and revealed hints', async () => {
  const app = createApp({ ai: createAiService({ apiKey: '' }) });
  const a = await session(app, 2), b = await session(app, 2);
  await request(app, '/terminal', { command: 'ls' }, a.id);
  await request(app, '/hint', {}, a.id);
  await request(app, '/ai', { questionId: 'alarm-status' }, a.id);
  const recovered = (await request(app, '/state', undefined, a.id)).data;
  assert.equal(recovered.terminalHistory[0].command, 'ls');
  assert.equal(recovered.revealedHints['2'].level, 1);
  assert.equal(recovered.ai.history.length, 1);
  const other = (await request(app, '/state', undefined, b.id)).data;
  assert.equal(other.terminalHistory.length, 0);
  assert.equal(other.ai.history.length, 0);
});
test('AI needs a valid session, active Stage 2 and valid input', async () => {
  const app = createApp();
  assert.equal((await request(app, '/ai', { message: 'hi' })).status, 401);
  const { id, s } = await session(app);
  assert.equal((await request(app, '/ai', { message: 'hi' }, id)).status, 403);
  s.stage = 2;
  for (const body of [{}, { message: ' ' }, { message: 4 }, { message: 'x'.repeat(301) }, { questionId: 'unknown' }]) {
    assert.equal((await request(app, '/ai', body, id)).status, 400);
  }
  s.startedAt -= game.DURATION_MS;
  assert.equal((await request(app, '/ai', { message: 'hi' }, id)).status, 403);
});
test('missing key provides playable scripted reply without network calls', async () => {
  const ai = createAiService({ apiKey: '' }, () => { throw Error('Must not call network'); });
  const reply = await ai.respond('Why?', [], 'alarm-status');
  assert.equal(reply.mode, 'scripted');
  assert.equal(reply.fallbackReason, 'not_configured');
  assert.match(reply.reply, /02:14/);
});
test('Gemini request sends key only in header, bounded history and returns text', async () => {
  let captured;
  const ai = createAiService({ apiKey: 'test-key', model: 'gemini-2.5-flash', timeoutMs: 100 }, async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ALL CLEAR conflicts with 0 V.' }] } }] }) };
  });
  const result = await ai.respond('Status?', Array.from({ length: 10 }, () => ({ question: 'Q', reply: 'A' })));
  assert.equal(result.mode, 'gemini');
  assert.equal(result.reply, 'ALL CLEAR conflicts with 0 V.');
  assert.equal(captured.init.headers['x-goog-api-key'], 'test-key');
  assert.ok(!captured.url.includes('test-key'));
  assert.equal(captured.body.contents.length, 9);
  assert.ok(!JSON.stringify(result).includes('test-key'));
});
test('provider failures, blocked responses and empty replies fall back safely', async () => {
  for (const mock of [
    async () => ({ ok: false, status: 401 }),
    async () => { throw Error('private-provider-error'); },
    async () => ({ ok: true, json: async () => ({ candidates: [] }) }),
    async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) })
  ]) {
    const ai = createAiService({ apiKey: 'test-key', model: 'test', timeoutMs: 100 }, mock);
    const reply = await ai.respond('hi', []);
    assert.equal(reply.mode, 'scripted');
    assert.ok(!JSON.stringify(reply).includes('private-provider-error'));
  }
});
test('Gemini 3 uses supported thinking settings without the legacy budget', async () => {
  let body;
  const ai = createAiService({ apiKey: 'test-key', model: 'gemini-3.8-flash', timeoutMs: 100 }, async (url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Grid offline.' }] } }] }) };
  });
  assert.equal((await ai.respond('Status?', [])).mode, 'gemini');
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, undefined);
  assert.equal(body.generationConfig.temperature, undefined);
});

test('Flash Lite uses the minimal settings verified by the connection probe', async () => {
  let body;
  const ai = createAiService({ apiKey: 'test-key', model: 'gemini-3.1-flash-lite', timeoutMs: 100 }, async (url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Grid offline.' }] } }] }) };
  });
  assert.equal((await ai.respond('Status?', [])).mode, 'gemini');
  assert.deepEqual(body.generationConfig, { maxOutputTokens: 256 });
});

test('slow provider is aborted and produces fallback', async () => {
  const ai = createAiService({ apiKey: 'test', model: 'test', timeoutMs: 10 }, (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
  }));
  const result = await ai.respond('hi', []);
  assert.equal(result.fallbackReason, 'timeout');
});
test('AI cooldown and per-session question cap are enforced', async () => {
  const app = createApp({ ai: createAiService({ apiKey: '' }) });
  const { id, s } = await session(app, 2);
  assert.equal((await request(app, '/ai', { message: 'Status?' }, id)).status, 200);
  assert.equal((await request(app, '/ai', { message: 'Again?' }, id)).status, 429);
  s.aiLastAt = 0;
  s.aiRequests = 6;
  assert.equal((await request(app, '/ai', { message: 'Again?' }, id)).status, 429);
});
test('concurrent requests are blocked and late replies cannot progress the game', async () => {
  let finish;
  const app = createApp({ ai: { respond: () => new Promise(resolve => { finish = resolve; }) } });
  const { id, s } = await session(app, 2);
  const pending = request(app, '/ai', { message: 'Status?' }, id);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await request(app, '/ai', { message: 'Again?' }, id)).status, 409);
  s.startedAt -= game.DURATION_MS;
  finish({ reply: 'Late', mode: 'gemini', fallbackReason: null });
  assert.equal((await pending).status, 403);
  assert.equal(s.aiHistory.length, 0);
  assert.equal(s.aiPending, false);
});
test('completed mission timer freezes and expired missions reject answers', () => {
  const s = game.getSession(game.createSession());
  s.stage = 3;
  assert.equal(game.answer(s, 3, 'update.txt:b:enable-alerts').ok, true);
  const before = game.publicState(s).remainingSeconds;
  s.startedAt -= 600000; s.finishedAt -= 600000;
  assert.equal(game.publicState(s).remainingSeconds, before);
  assert.equal(game.publicState(s).expired, false);
  const expired = game.getSession(game.createSession());
  expired.startedAt -= game.DURATION_MS;
  assert.equal(game.answer(expired, 1, 'restore grid').ok, false);
  assert.equal(game.hint(expired).ok, false);
});
test('JSON errors, length limits, CORS and health endpoint', async () => {
  const app = createApp({ origins: ['https://frontend.example'] });
  assert.equal((await request(app, '/health')).status, 200);
  assert.equal((await request(app, '/start', {}, undefined, { raw: '{broken' })).status, 400);
  assert.equal((await request(app, '/start', {}, undefined, { raw: JSON.stringify({ text: 'x'.repeat(9000) }) })).status, 413);
  const { id } = await session(app);
  assert.equal((await request(app, '/answer', { stage: 1, value: '' }, id)).status, 400);
  assert.equal((await request(app, '/state', undefined, id, { headers: { origin: 'https://unapproved.example' } })).status, 403);
  const preflight = await request(app, '/ai', undefined, undefined, { method: 'OPTIONS', headers: { origin: 'https://frontend.example' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'https://frontend.example');
  assert.equal(preflight.headers['access-control-expose-headers'], 'Retry-After');
  assert.equal(preflight.headers['cache-control'], 'no-store');
  const allowed = await request(app, '/state', undefined, id, { headers: { origin: 'https://frontend.example' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://frontend.example');
});
test('limiter blocks excess requests and resets after its window', () => {
  const limiter = createLimiter(1, 1000, () => 'all');
  const original = Date.now;
  let clock = 1000, nextCount = 0, status;
  Date.now = () => clock;
  const res = { set() {}, status(value) { status = value; return this; }, json() {} };
  try {
    limiter({}, res, () => nextCount++);
    limiter({}, res, () => nextCount++);
    assert.equal(status, 429);
    clock += 1001;
    limiter({}, res, () => nextCount++);
    assert.equal(nextCount, 2);
  } finally { Date.now = original; }
});
test('cipher roundtrips, sessions expire from storage and shell is simulated', () => {
  for (let shift = 3; shift <= 7; shift++) assert.equal(game.encrypt(game.encrypt('RESTORE GRID', shift), 26 - shift), 'RESTORE GRID');
  const id = game.createSession();
  game.getSession(id).startedAt -= 31 * 60 * 1000;
  game.cleanupSessions();
  assert.equal(game.getSession(id), undefined);
  assert.match(run('cat ../../package.json'), /not found/);
  assert.match(run('ls; whoami'), /not recognised/);
});

test('new teams get different phrases with matching ciphers, hints and validation', () => {
  let previous;
  for (let i = 0; i < 30; i++) {
    const s = game.getSession(game.createSession());
    assert.notEqual(s.passphrase, previous);
    const initial = game.publicState(s);
    assert.equal(game.encrypt(initial.cipher.message, 26 - initial.cipher.failedCells), s.passphrase);
    assert.equal(Object.hasOwn(initial, 'passphrase'), false);
    assert.equal(game.answer(s, 1, previous || 'RESTORE GRID').ok, false);
    game.hint(s);
    assert.ok(game.hint(s).message.includes(s.passphrase[0] + '.'));
    assert.ok(game.hint(s).message.includes(s.passphrase));
    assert.equal(game.answer(s, 1, '  ' + s.passphrase.toLowerCase().replace(' ', '   ') + '  ').ok, true);
    assert.equal(s.stage, 2);
    previous = s.passphrase;
  }
});
