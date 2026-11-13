const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function frontend() {
  const elements = new Map();
  function element() {
    return { dataset: {}, children: [], value: '', textContent: '', append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; } };
  }
  for (const id of ['#start', '#screen', '#notice', '#ai-history', '#ai-message', '#ai-status', '#ai-error', '#ai-send']) elements.set(id, element());
  const context = vm.createContext({
    document: { querySelector: id => elements.get(id), querySelectorAll: () => [elements.get('#ai-send')], createElement: element },
    sessionStorage: { getItem: () => null }, Date, setInterval, clearInterval
  });
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), context);
  vm.runInContext("state = { stage: 2, finished: false, expired: false, ai: { pending: false, remainingRequests: 4, history: [] } }; sessionId = 'team-a';", context);
  return { context, elements };
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
