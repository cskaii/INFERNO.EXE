let sessionId = null, state = null, ticker = null, busy = false;
let terminalHistory = '', wheelShift = 0;
const hintHistory = {};
let aiBusy = false, aiCooldownUntil = 0, pollBusy = false;
const screen = document.querySelector('#screen');
const notice = document.querySelector('#notice');
const names = ['Crack the Code', 'The Corrupted AI', 'Emergency Override'];
async function api(path, body) {
  const res = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'x-session-id': sessionId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}
function update(s) {
  // A delayed poll must not undo a submitted answer or a completed mission.
  if (state && (s.stage < state.stage || (state.finished && !s.finished) ||
      (state.expired && !s.expired) || s.readFiles.length < state.readFiles.length)) return;
  const endedBefore = state?.expired || state?.finished;
  state = s;
  syncAiPanel();
  document.querySelector('#stage').textContent = s.finished ? 'MISSION COMPLETE' : s.expired ? 'SYSTEM LOCKDOWN' : 'STAGE ' + s.stage + ' / 3 - ' + names[s.stage - 1];
  document.querySelector('#timer').textContent = String(Math.floor(s.remainingSeconds / 60)).padStart(2, '0') + ':' + String(s.remainingSeconds % 60).padStart(2, '0');
  document.body.classList.toggle('restored', s.finished);
  document.body.classList.toggle('urgent', !s.finished && s.remainingSeconds <= 60);
  document.querySelector('#power-status').textContent = s.finished ? 'POWER RESTORED' : s.expired ? 'SYSTEM LOCKED' : 'POWER OFFLINE';
  document.querySelectorAll('[data-stage]').forEach(item => {
    const stage = Number(item.dataset.stage);
    item.classList.toggle('active', !s.expired && !s.finished && stage === s.stage);
    item.classList.toggle('complete', s.finished || stage < s.stage);
    if (!s.finished && !s.expired && stage === s.stage) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  if (s.expired || s.finished) {
    clearInterval(ticker);
    if (!endedBefore) render();
  }
}
async function start() {
  if (busy) return;
  busy = true;
  clearInterval(ticker);
  try {
    const d = await api('/start', {});
    sessionId = d.sessionId;
    try { sessionStorage.setItem('blackout-session', sessionId); } catch {}
    aiBusy = false;
    aiCooldownUntil = 0;
    state = null;
    wheelShift = 0;
    for (const key of Object.keys(hintHistory)) delete hintHistory[key];
    terminalHistory = 'BLACKOUT RESPONSE CONSOLE\nWorkspace mounted. Type help for command syntax.';
    notice.textContent = '';
    update(d.state);
    render();
    startPolling();
  } catch (e) { notice.textContent = e.message; }
  finally { busy = false; }
}
function startPolling() {
    clearInterval(ticker);
    ticker = setInterval(async () => {
      syncAiPanel();
      if (busy || pollBusy) return;
      pollBusy = true;
      const currentSession = sessionId;
      try {
        const s = await api('/state');
        if (currentSession === sessionId) update(s);
      } catch (e) { notice.textContent = 'Connection interrupted. The mission clock continues. ' + e.message; }
      finally { pollBusy = false; }
    }, 1000);
}
async function answer(stage, value) {
  if (busy || state?.expired || state?.finished) return;
  busy = true;
  try {
    const d = await api('/answer', { stage, value });
    update(d.state);
    if (d.ok && !d.state.finished) render();
    notice.textContent = d.message;
  } catch (e) { notice.textContent = e.message; }
  finally { busy = false; }
}
function focusTitle() { screen.querySelector('h2')?.focus(); }
function render() {
  if (!state) return;
  notice.textContent = '';
  if (state.finished || state.expired) {
    screen.innerHTML = state.finished
      ? '<span class="eyebrow">INCIDENT CONTAINED</span><h2 id="screen-title" tabindex="-1">Power restored.</h2><p>You decoded the access phrase, traced the injected instruction to its source, and selected a safe recovery plan.</p><p class="lesson">A prompt injection hides instructions in untrusted content to manipulate an AI. Isolate its source, restore a verified pre-incident backup, and keep safety monitoring active.</p><p id="hint-count" class="muted"></p><button id="again">Start next team &rarr;</button>'
      : '<span class="eyebrow">RESPONSE WINDOW CLOSED</span><h2 id="screen-title" tabindex="-1">System lockdown.</h2><p>Time ran out before power could be restored. Try again with a fresh cipher key. Optional hints are available at every stage.</p><button id="again">Try again &rarr;</button>';
    if (state.finished) document.querySelector('#hint-count').textContent = 'Hints revealed: ' + state.hintsUsed + ' / 9';
    document.querySelector('#again').onclick = start;
    focusTitle();
    return;
  }
  if (state.stage === 1) {
    screen.innerHTML = '<span class="eyebrow">STAGE 01 // TARGET: 1 MINUTE</span><h2 id="screen-title" tabindex="-1">Crack the Code</h2><p>Decode the intercepted access phrase. The encoder settings survived on the backup panel; use them to calibrate the cipher wheel.</p><div class="cipher-message" id="cipher-message"></div><div class="backup-panel"><span class="eyebrow">BACKUP PANEL / ENCODER MEMORY</span><p>Encryption direction: FORWARD<br>Cipher key: count the cells marked FAILED. Cell numbers are identifiers, not the key.</p><div id="backup-cells" class="backup-cells" role="group" aria-label="Backup cell status"></div></div><div class="cipher-layout"><svg id="wheel" viewBox="0 0 300 300" role="img" aria-label="Adjustable Caesar wheel: outer ring is encrypted; inner ring is decoded"></svg><div class="wheel-controls"><label for="wheel-shift">Wheel offset</label><select id="wheel-shift" aria-describedby="wheel-feedback wheel-instructions"></select><p id="wheel-feedback" role="status" aria-live="polite"></p><p class="muted" id="wheel-instructions">Match each intercepted letter on the outer ring to the inner letter directly beneath it. Enter both decoded words below, then select Unlock system.</p><details class="wheel-table"><summary>View letter pairs as text</summary><p id="wheel-pairs"></p></details></div></div><form id="decode"><label for="answer">Decoded access phrase</label><div class="input-row"><input id="answer" maxlength="150" autocomplete="off" placeholder="Enter both decoded words" required><button>Unlock system &rarr;</button></div></form>';
    document.querySelector('#cipher-message').textContent = state.cipher.message;
    const cells = document.querySelector('#backup-cells');
    for (let i = 0; i < 8; i++) {
      const cell = document.createElement('span');
      const failed = i < state.cipher.failedCells;
      cell.className = failed ? 'cell failed' : 'cell online';
      cell.textContent = 'Cell ' + String(i + 1).padStart(2, '0') + ': ' + (failed ? 'FAILED' : 'Working');
      cells.append(cell);
    }
    const control = document.querySelector('#wheel-shift');
    for (let i = 0; i < 26; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = String(i).padStart(2, '0');
      control.append(option);
    }
    control.value = wheelShift;
    control.onchange = () => { wheelShift = Number(control.value); buildWheel(); };
    const turns = document.createElement('div');
    turns.className = 'wheel-turns';
    for (const [step, label, symbol] of [[-1, 'Decrease wheel offset', '\u2190'], [1, 'Increase wheel offset', '\u2192']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = symbol;
      button.setAttribute('aria-label', label);
      button.onclick = () => {
        wheelShift = (wheelShift + step + 26) % 26;
        control.value = wheelShift;
        buildWheel();
      };
      turns.append(button);
    }
    control.after(turns);
    buildWheel();
    document.querySelector('#decode').onsubmit = e => { e.preventDefault(); answer(1, document.querySelector('#answer').value); };
  } else if (state.stage === 2) {
    screen.innerHTML = '<span class="eyebrow">STAGE 02 // TARGET: 2 MINUTES</span><h2 id="screen-title" tabindex="-1">The Corrupted AI</h2><p>The display says ALL CLEAR, but the grid is offline. Trace what changed the assistant behaviour and identify the attack and its source. Locate the recovery inventory before leaving.</p><p class="muted">Use <code>help</code> for command syntax. File names are case-sensitive.</p><div class="terminal-bar"><span>analyst@blackout</span><span>INVESTIGATION CONSOLE</span></div><pre id="output" role="log" aria-live="polite" aria-label="Terminal output"></pre><form id="terminal"><label for="command">Terminal command</label><div class="input-row"><input id="command" maxlength="150" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter command" required><button>Execute</button></div></form><p id="evidence" class="muted"></p><form id="diagnosis"><h3>Submit your diagnosis</h3><div class="plan-grid"><div><label for="threat">Attack type</label><select id="threat" required><option value="">Select attack</option><option value="credential-theft">Credential theft</option><option value="data-poisoning">Training data poisoning</option><option value="prompt-injection">Prompt injection</option><option value="denial-of-service">Denial of service</option></select></div><div><label for="source">Source file</label><select id="source" required><option value="">Select source</option><option>status.txt</option><option>recovery.txt</option><option>update.txt</option><option>incident.log</option></select></div></div><button>Verify diagnosis &rarr;</button></form>';
    document.querySelector('#output').textContent = terminalHistory;
    mountAiPanel();
    updateEvidence();
    document.querySelector('#terminal').onsubmit = execute;
    document.querySelector('#diagnosis').onsubmit = e => {
      e.preventDefault();
      answer(2, document.querySelector('#threat').value + ':' + document.querySelector('#source').value);
    };
  } else if (state.stage === 3) {
    screen.innerHTML = '<span class="eyebrow">STAGE 03 // TARGET: 1 MINUTE</span><h2 id="screen-title" tabindex="-1">Emergency Override</h2><p>Build a recovery plan using the incident timeline and backup inventory. All three settings must be safe before power can return.</p><details class="evidence-card"><summary>Review collected terminal evidence</summary><pre id="collected-evidence"></pre></details><form id="recovery"><div class="plan-grid"><div><label for="containment">01 / Quarantine source</label><select id="containment" required><option value="">Select file</option><option>incident.log</option><option>update.txt</option><option>recovery.txt</option><option>status.txt</option></select></div><div><label for="snapshot">02 / Restore configuration</label><select id="snapshot" required><option value="">Select snapshot</option><option value="a">Snapshot A</option><option value="b">Snapshot B</option><option value="c">Snapshot C</option></select></div><div><label for="safety">03 / Final safety action</label><select id="safety" required><option value="">Select action</option><option value="clear-logs">Clear incident history</option><option value="keep-muted">Keep alerts muted</option><option value="enable-alerts">Re-enable safety alerts</option><option value="trust-imports">Trust all maintenance imports</option></select></div></div><button>Execute emergency override &rarr;</button></form>';
    document.querySelector('#collected-evidence').textContent = terminalHistory;
    document.querySelector('#recovery').onsubmit = e => {
      e.preventDefault();
      answer(3, document.querySelector('#containment').value + ':' + document.querySelector('#snapshot').value + ':' + document.querySelector('#safety').value);
    };
  }
  mountHints();
  focusTitle();
}
function mountHints() {
  const area = document.createElement('aside');
  area.className = 'hint-panel';
  area.setAttribute('aria-label', 'Optional mission hints');
  area.innerHTML = '<div class="hint-heading"><span class="eyebrow">ASSISTANCE CHANNEL</span><button id="hint-button" type="button"></button></div><p class="muted">Optional help, revealed one step at a time. The countdown continues; no extra time penalty.</p><p id="hint-text" role="status" aria-live="polite"></p>';
  screen.append(area);
  updateHintPanel();
  document.querySelector('#hint-button').onclick = async () => {
    if (busy || state.expired || state.finished) return;
    busy = true;
    const stage = state.stage;
    try {
      const d = await api('/hint', {});
      update(d.state);
      if (!state.expired && !state.finished && state.stage === stage) {
        if (d.ok) { hintHistory[stage] = d; updateHintPanel(); }
        else notice.textContent = d.message;
      }
    } catch (e) { notice.textContent = e.message; }
    finally { busy = false; }
  };
}
function updateHintPanel() {
  const hint = hintHistory[state.stage];
  const button = document.querySelector('#hint-button');
  const level = hint?.level || 0;
  button.disabled = level >= 3;
  button.textContent = level >= 3 ? 'All hints revealed' : level === 2 ? 'Show walkthrough (3/3)' : 'Reveal hint (' + (level + 1) + '/3)';
  document.querySelector('#hint-text').textContent = hint ? 'HINT ' + level + ' / 3: ' + hint.message : '';
}
function mountAiPanel() {
  const panel = document.createElement('aside');
  panel.className = 'ai-panel';
  panel.setAttribute('aria-labelledby', 'ai-title');
  panel.innerHTML = '<span class="eyebrow">CONTROLLER CHANNEL</span><h3 id="ai-title">Question the controller</h3><p class="muted">Its display contradicts the grid readings. Ask what it knows, then check its claims against the files. This conversation is optional.</p><div id="ai-history" role="log" aria-live="polite" aria-label="Controller conversation"></div><div id="ai-questions" class="ai-questions"></div><form id="ai-form"><label for="ai-message">Your question</label><div class="input-row"><input id="ai-message" maxlength="300" autocomplete="off" placeholder="Ask about the blackout" required><button id="ai-send">Send question</button></div></form><p id="ai-status" role="status"></p><p id="ai-error" role="alert"></p>';
  document.querySelector('#diagnosis').before(panel);
  for (const question of state.ai.questions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = question.text;
    button.onclick = () => askController({ questionId: question.id });
    panel.querySelector('#ai-questions').append(button);
  }
  panel.querySelector('#ai-form').onsubmit = e => {
    e.preventDefault();
    const input = document.querySelector('#ai-message');
    if (input.value.trim()) askController({ message: input.value.trim() }, input.value);
  };
  syncAiPanel();
}
function syncAiPanel() {
  const history = document.querySelector('#ai-history');
  if (!history || !state?.ai) return;
  const turns = state.ai.history;
  const signature = JSON.stringify(turns);
  if (history.dataset.signature !== signature) {
    history.replaceChildren();
    for (const turn of turns) {
      for (const [speaker, message] of [['YOUR TEAM', turn.question], ['CONTROLLER', turn.reply]]) {
        const row = document.createElement('div');
        row.className = speaker === 'CONTROLLER' ? 'ai-turn controller-turn' : 'ai-turn';
        const label = document.createElement('strong');
        label.textContent = speaker;
        const text = document.createElement('p');
        text.textContent = message;
        row.append(label, text);
        history.append(row);
      }
    }
    history.dataset.signature = signature;
    history.scrollTop = history.scrollHeight;
  }
  const waiting = aiBusy || state.ai.pending;
  const cooldown = Math.max(0, Math.ceil((aiCooldownUntil - Date.now()) / 1000));
  const locked = state.stage !== 2 || state.finished || state.expired;
  document.querySelectorAll('#ai-questions button, #ai-send').forEach(button => {
    button.disabled = locked || waiting || cooldown > 0 || state.ai.remainingRequests <= 0;
  });
  document.querySelector('#ai-message').disabled = locked;
  const fallback = turns.at(-1)?.mode === 'scripted';
  document.querySelector('#ai-status').textContent = (waiting ? 'Controller responding… ' : cooldown ? 'Next question in ' + cooldown + 's. ' : '') + state.ai.remainingRequests + ' questions remaining.' + (fallback ? ' Backup dialogue active; you can continue investigating.' : '');
}
async function askController(payload, originalInput) {
  if (aiBusy || state?.ai.pending || state?.stage !== 2 || state.expired || state.finished || Date.now() < aiCooldownUntil || !state.ai.remainingRequests) return;
  const currentSession = sessionId;
  aiBusy = true;
  aiCooldownUntil = Date.now() + 3000;
  document.querySelector('#ai-error').textContent = '';
  syncAiPanel();
  try {
    await api('/ai', payload);
    if (sessionId !== currentSession || state.stage !== 2 || state.finished || state.expired) return;
    // Read fresh state: terminal activity may have advanced while AI was responding.
    const fresh = await api('/state');
    if (sessionId !== currentSession || state.stage !== 2 || state.finished || state.expired) return;
    update(fresh);
    const input = document.querySelector('#ai-message');
    if (input && originalInput !== undefined && input.value === originalInput) input.value = '';
  } catch (e) {
    if (sessionId !== currentSession || state.stage !== 2 || state.finished || state.expired) return;
    if (e.data?.state) update(e.data.state);
    if (e.data?.retryAfter) aiCooldownUntil = Date.now() + e.data.retryAfter * 1000;
    if (e.status === 409) state.ai.pending = true;
    const error = document.querySelector('#ai-error');
    if (error) error.textContent = e.message;
  } finally {
    if (sessionId === currentSession) { aiBusy = false; syncAiPanel(); }
  }
}
function updateEvidence() {
  document.querySelector('#evidence').textContent = 'Files examined: ' + state.readFiles.length + ' / ' + (state.evidenceReady ? 'Incident trace and recovery inventory collected.' : 'Investigation in progress.');
}
async function execute(e) {
  e.preventDefault();
  if (busy || state.expired) return;
  busy = true;
  const input = document.querySelector('#command');
  const command = input.value;
  try {
    const d = await api('/terminal', { command });
    terminalHistory += '\n\nanalyst@blackout:~$ ' + command + '\n' + d.output;
    update(d.state);
    if (!state.expired) {
      const output = document.querySelector('#output');
      output.textContent = terminalHistory;
      output.scrollTop = output.scrollHeight;
      input.value = '';
      input.focus();
      updateEvidence();
    }
  } catch (e) { notice.textContent = e.message; }
  finally { busy = false; }
}
function buildWheel() {
  const svg = document.querySelector('#wheel');
  if (svg.querySelector('.inner-ring')) {
    updateWheel(svg);
    return;
  }
  svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const rotation = wheelShift * 360 / 26;
  const defs = document.createElementNS(ns, 'defs');
  [['wheel-metal', '#718b99', '#102330'], ['wheel-face', '#294956', '#081620'], ['wheel-hub', '#3b5b68', '#09131d']].forEach(([id, light, dark]) => {
    const gradient = document.createElementNS(ns, 'linearGradient');
    Object.entries({ id, x1: '0%', y1: '0%', x2: '80%', y2: '100%' }).forEach(([key, value]) => gradient.setAttribute(key, value));
    [['0%', light], ['45%', dark], ['85%', dark], ['100%', light]].forEach(([offset, color]) => {
      const stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      gradient.append(stop);
    });
    defs.append(gradient);
  });
  svg.append(defs);
  [[139, 154, 'wheel-depth'], [139, 150, 'wheel-rim'], [132, 150, 'wheel-face'], [103, 153, 'wheel-recess'], [101, 150, 'wheel-inner-face'], [66, 152, 'wheel-recess'], [64, 150, 'wheel-hub']].forEach(([radius, cy, className]) => {
    const circle = document.createElementNS(ns, 'circle');
    Object.entries({ cx: 150, cy, r: radius, class: className }).forEach(([key, value]) => circle.setAttribute(key, value));
    svg.append(circle);
  });
  for (let i = 0; i < 52; i++) {
    const angle = (i * 360 / 52 - 90) * Math.PI / 180;
    const tick = document.createElementNS(ns, 'line');
    const inner = i % 2 ? 133 : 130;
    Object.entries({ x1: 150 + inner * Math.cos(angle), y1: 150 + inner * Math.sin(angle), x2: 150 + 137 * Math.cos(angle), y2: 150 + 137 * Math.sin(angle), class: 'wheel-tick' }).forEach(([key, value]) => tick.setAttribute(key, value));
    svg.append(tick);
  }
  const innerRing = document.createElementNS(ns, 'g');
  innerRing.setAttribute('class', 'inner-ring');
  innerRing.style.transform = 'rotate(' + rotation + 'deg)';
  svg.dataset.rotation = rotation;
  svg.dataset.offset = wheelShift;
  // The spoke marks the inner A position, making changes in alignment visible.
  const marker = document.createElementNS(ns, 'line');
  Object.entries({ x1: 150, y1: 48, x2: 150, y2: 57, class: 'wheel-marker' }).forEach(([key, value]) => marker.setAttribute(key, value));
  innerRing.append(marker);
  const pairs = [];
  for (let i = 0; i < 26; i++) {
    const angle = (i * 360 / 26 - 90) * Math.PI / 180;
    const decoded = String.fromCharCode(65 + (i - wheelShift + 26) % 26);
    pairs.push(String.fromCharCode(65 + i) + ' = ' + decoded);
    [119, 84].forEach((radius, ring) => {
      const text = document.createElementNS(ns, 'text');
      const x = 150 + radius * Math.cos(angle);
      const y = 150 + radius * Math.sin(angle);
      text.setAttribute('x', x);
      text.setAttribute('y', y);
      text.setAttribute('class', ring ? 'decoded' : 'encoded');
      text.textContent = String.fromCharCode(65 + i);
      if (ring) {
        text.style.transformOrigin = x + 'px ' + y + 'px';
        text.style.transform = 'rotate(' + (-rotation) + 'deg)';
        innerRing.append(text);
      } else svg.append(text);
    });
  }
  svg.append(innerRing);
  const label = document.createElementNS(ns, 'text');
  label.setAttribute('class', 'wheel-offset-label');
  label.setAttribute('x', 150); label.setAttribute('y', 150);
  label.textContent = 'OFFSET ' + String(wheelShift).padStart(2, '0');
  svg.append(label);
  updateWheel(svg);
}
function updateWheel(svg) {
  const previous = Number(svg.dataset.offset);
  // Take the short route, including the wrap between offsets 25 and 0.
  const delta = ((wheelShift - previous + 39) % 26) - 13;
  const rotation = Number(svg.dataset.rotation) + delta * 360 / 26;
  svg.dataset.rotation = rotation;
  svg.dataset.offset = wheelShift;
  svg.querySelector('.inner-ring').style.transform = 'rotate(' + rotation + 'deg)';
  svg.querySelectorAll('.inner-ring text').forEach(text => {
    text.style.transform = 'rotate(' + (-rotation) + 'deg)';
  });
  svg.querySelector('.wheel-offset-label').textContent = 'OFFSET ' + String(wheelShift).padStart(2, '0');
  const pairs = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i) + ' = ' + String.fromCharCode(65 + (i - wheelShift + 26) % 26));
  svg.setAttribute('aria-label', 'Caesar wheel at offset ' + wheelShift + '. Outer ring is encrypted; inner ring is decoded.');
  document.querySelector('#wheel-pairs').textContent = pairs.join(' / ');
  const intercepted = state.cipher.message.match(/[A-Z]/)[0];
  const mapped = String.fromCharCode(65 + (intercepted.charCodeAt(0) - 65 - wheelShift + 26) % 26);
  document.querySelector('#wheel-feedback').textContent = 'Offset ' + String(wheelShift).padStart(2, '0') +
    ' selected. First letter: ' + intercepted + ' maps to ' + mapped + '. Decode the remaining letters and enter the phrase below.';
}
document.querySelector('#start').onclick = start;
async function restoreMission() {
  try { sessionId = sessionStorage.getItem('blackout-session'); } catch {}
  if (!sessionId) return;
  const button = document.querySelector('#start');
  button.disabled = true;
  try {
    const recovered = await api('/state');
    Object.assign(hintHistory, recovered.revealedHints);
    terminalHistory = 'BLACKOUT RESPONSE CONSOLE\nWorkspace mounted. Type help for command syntax.' + recovered.terminalHistory.map(turn => '\n\nanalyst@blackout:~$ ' + turn.command + '\n' + turn.output).join('');
    update(recovered);
    render();
    if (!recovered.finished && !recovered.expired) startPolling();
  } catch (e) {
    if (e.status === 401) {
      try { sessionStorage.removeItem('blackout-session'); } catch {}
      sessionId = null;
      notice.textContent = 'Previous mission unavailable. Begin a new mission.';
    } else {
      notice.textContent = 'Could not reconnect. Reload to retry your existing mission.';
      return;
    }
  }
  button.disabled = false;
}
restoreMission();

