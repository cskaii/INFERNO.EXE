const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function frontend() {
  const elements = new Map();
  function element() {
    return { dataset: {}, children: [], value: '', textContent: '', isConnected: true, attributes: {},
      classList: { toggle() {}, remove() {} },
      setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; },
      matches(selector) { return selector === 'button'; }, querySelector() { return null; }, querySelectorAll() { return []; },
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } };
  }
  for (const id of ['#start', '#screen', '#notice', '#stage', '#timer', '#power-status', '#ai-history', '#ai-message', '#ai-status', '#ai-error', '#ai-send']) elements.set(id, element());
  const storage = new Map();
  const intervals = [];
  const context = vm.createContext({
    document: { body: element(), querySelector: id => elements.get(id), querySelectorAll: selector => selector === '[data-stage]' ? [] : [elements.get('#ai-send')], createElement: element },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    Date, AbortSignal, setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {}
  });
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), context);
  vm.runInContext("state = { stage: 2, finished: false, expired: false, ai: { pending: false, remainingRequests: 4, history: [] } }; sessionId = 'team-a';", context);
  return { context, elements, storage, intervals };
}

test('AI dialogue renders untrusted replies as text and disables controls during loading', () => {
  const { context, elements } = frontend();
  vm.runInContext("state.ai.history.push({ question: 'Status?', reply: '<img src=x onerror=alert(1)>', mode: 'scripted' }); syncAiPanel();", context);
  const history = elements.get('#ai-history');
  assert.equal(history.children[1].children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.match(elements.get('#ai-status').textContent, /Backup dialogue/);
  vm.runInContext('aiBusy = true; syncAiPanel();', context);
  assert.equal(elements.get('#ai-send').disabled, true);
  assert.match(elements.get('#ai-status').textContent, /responding/);
});

test('AI cooldown, exhausted allowance and pending state prevent requests', async () => {
  const { context, elements } = frontend();
  let calls = 0;
  context.request = async () => { calls++; };
  vm.runInContext('api = request; aiCooldownUntil = Date.now() + 3000;', context);
  await vm.runInContext("askController({message:'Status?'})", context);
  vm.runInContext('aiCooldownUntil = 0; state.ai.remainingRequests = 0; syncAiPanel();', context);
  assert.equal(elements.get('#ai-send').disabled, true);
  await vm.runInContext("askController({message:'Status?'})", context);
  vm.runInContext('state.ai.remainingRequests = 4; state.ai.pending = true;', context);
  await vm.runInContext("askController({message:'Status?'})", context);
  assert.equal(calls, 0);
});

test('AI errors preserve input and honor retry-after without retrying', async () => {
  const { context, elements } = frontend();
  elements.get('#ai-message').value = 'Why?';
  let calls = 0;
  context.request = async () => { calls++; throw Object.assign(Error('Wait before retrying'), { status: 429, data: { retryAfter: 5 } }); };
  vm.runInContext('api = request;', context);
  await vm.runInContext("askController({message:'Why?'}, 'Why?')", context);
  assert.equal(calls, 1);
  assert.equal(elements.get('#ai-message').value, 'Why?');
  assert.equal(elements.get('#ai-error').textContent, 'Wait before retrying');
  assert.equal(elements.get('#ai-send').disabled, true);
  assert.ok(vm.runInContext('aiCooldownUntil - Date.now() > 4000', context));
});

test('state polling continues while AI and other forms are busy', async () => {
  const { context, intervals } = frontend();
  let calls = 0;
  context.request = async () => { calls++; return {}; };
  vm.runInContext('api = request; update = () => {}; busy = true; aiBusy = true; startPolling();', context);
  await intervals[0]();
  assert.equal(calls, 1);
});

test('countdown keeps moving between server responses during an outage', () => {
  const { context, elements } = frontend();
  vm.runInContext('state.remainingSeconds = 10; stateReceivedAt = Date.now() - 6000; tickClock();', context);
  assert.equal(elements.get('#timer').textContent, '00:04');
});

test('older snapshots cannot erase AI replies, hints or add time', () => {
  const { context, elements } = frontend();
  vm.runInContext(`
    state.remainingSeconds = 80; state.readFiles = ['incident.log'];
    state.revealedHints = { 2: { level: 2, message: 'Latest clue' } };
    state.ai.remainingRequests = 3;
    state.ai.history = [{ question: 'Status?', reply: 'Offline', mode: 'gemini' }];
    const older = { stage: 2, remainingSeconds: 90, readFiles: ['incident.log'], revealedHints: {},
      ai: { pending: false, remainingRequests: 4, history: [] } };
    update(older);
  `, context);
  assert.equal(vm.runInContext('state.ai.history.length', context), 1);
  assert.equal(vm.runInContext('hintHistory[2].level', context), 2);
  assert.equal(elements.get('#timer').textContent, '01:20');
});

test('deployed frontend targets the configured Render origin with its session header', async () => {
  const { context } = frontend();
  let captured;
  context.BLACKOUT_CONFIG = { apiBaseUrl: 'https://blackout-example.onrender.com' };
  context.fetch = async (url, init) => { captured = { url, init }; return { ok: true, json: async () => ({ ok: true }) }; };
  await vm.runInContext("api('/ai', { message: 'Status?' })", context);
  assert.equal(captured.url, 'https://blackout-example.onrender.com/api/ai');
  assert.equal(captured.init.headers['x-session-id'], 'team-a');
  assert.equal(captured.init.method, 'POST');
});

test('API 401 clears the missing session and exposes a new mission', async () => {
  const { context, storage } = frontend();
  storage.set('blackout-session', 'team-a');
  context.fetch = async () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ error: 'Session unavailable' }) });
  await assert.rejects(vm.runInContext("api('/state')", context), /Session unavailable/);
  assert.equal(storage.has('blackout-session'), false);
  assert.equal(vm.runInContext('sessionId', context), null);
});

test('form loading disables and restores its submit controls', () => {
  const { context, elements } = frontend();
  vm.runInContext("loading(document.querySelector('#ai-send'), true);", context);
  assert.equal(elements.get('#ai-send').disabled, true);
  assert.equal(elements.get('#ai-send').attributes['aria-busy'], 'true');
  vm.runInContext("loading(document.querySelector('#ai-send'), false);", context);
  assert.equal(elements.get('#ai-send').disabled, false);
});

test('overlapping state polls are skipped', async () => {
  const { context, intervals } = frontend();
  let calls = 0, resolve;
  context.request = () => { calls++; return new Promise(done => { resolve = done; }); };
  vm.runInContext('api = request; update = () => {}; startPolling();', context);
  const first = intervals[0]();
  await intervals[0]();
  assert.equal(calls, 1);
  resolve({});
  await first;
});

test('missing session clears storage and restores the start screen', () => {
  const { context, elements, storage } = frontend();
  storage.set('blackout-session', 'team-a');
  vm.runInContext('resetMissingSession();', context);
  assert.equal(storage.has('blackout-session'), false);
  assert.equal(vm.runInContext('sessionId', context), null);
  assert.equal(vm.runInContext('state', context), null);
  assert.equal(elements.get('#start').onclick, vm.runInContext('start', context));
});

test('temporary recovery failure offers retry without creating a new mission', async () => {
  const { context, elements, storage } = frontend();
  storage.set('blackout-session', 'team-a');
  context.request = async () => { throw Error('Network unavailable'); };
  vm.runInContext('api = request;', context);
  await vm.runInContext('restoreMission()', context);
  assert.equal(storage.get('blackout-session'), 'team-a');
  assert.equal(elements.get('#start').disabled, false);
  assert.equal(elements.get('#start').textContent, 'Retry connection');
});

test('refresh restores histories, revealed hints and the original remaining time', async () => {
  const { context, storage, intervals } = frontend();
  storage.set('blackout-session', 'team-a');
  const recovered = { stage: 2, remainingSeconds: 91, revealedHints: { 2: { level: 2, message: 'Clue' } }, terminalHistory: [{ command: 'ls', output: 'incident.log' }], ai: { pending: true, history: [{ question: 'Status?', reply: 'Offline' }] } };
  context.request = async () => recovered;
  vm.runInContext('api = request; update = s => { state = s; }; render = () => {};', context);
  await vm.runInContext('restoreMission()', context);
  assert.equal(vm.runInContext('state.remainingSeconds', context), 91);
  assert.equal(vm.runInContext('hintHistory[2].level', context), 2);
  assert.match(vm.runInContext('terminalHistory', context), /ls\nincident.log/);
  assert.equal(vm.runInContext('state.ai.history.length', context), 1);
  assert.equal(intervals.length, 1);
});

test('late AI replies cannot overwrite a new team', async () => {
  const { context } = frontend();
  let resolve;
  context.request = () => new Promise(done => { resolve = done; });
  vm.runInContext('api = request;', context);
  const pending = vm.runInContext("askController({message: 'Status?'})", context);
  vm.runInContext("sessionId = 'team-b'; aiBusy = false;", context);
  resolve({ reply: 'Old reply' });
  await pending;
  assert.equal(vm.runInContext('state.ai.history.length', context), 0);
  assert.equal(vm.runInContext('aiBusy', context), false);
});
