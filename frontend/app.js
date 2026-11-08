let sessionId = null, state = null, ticker = null, busy = false;
let terminalHistory = '', wheelShift = 0;
const hintHistory = {};
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
  if (!res.ok) throw Error(data.error || 'Request failed');
  return data;
}
function update(s) {
  // A delayed poll must not undo a submitted answer or a completed mission.
  if (state && (s.stage < state.stage || (state.finished && !s.finished) ||
      (state.expired && !s.expired) || s.readFiles.length < state.readFiles.length)) return;
  const endedBefore = state?.expired || state?.finished;
  state = s;
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
    state = null;
    wheelShift = 0;
    for (const key of Object.keys(hintHistory)) delete hintHistory[key];
    terminalHistory = 'BLACKOUT RESPONSE CONSOLE\nWorkspace mounted. Type help for command syntax.';
    notice.textContent = '';
    update(d.state);
    render();
    ticker = setInterval(async () => {
      if (busy) return;
      const currentSession = sessionId;
      try {
        const s = await api('/state');
        if (currentSession === sessionId) update(s);
      } catch (e) { notice.textContent = 'Connection interrupted. The mission clock continues. ' + e.message; }
    }, 1000);
  } catch (e) { notice.textContent = e.message; }
  finally { busy = false; }
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
    screen.innerHTML = '<span class="eyebrow">STAGE 01 // TARGET: 1 MINUTE</span><h2 id="screen-title" tabindex="-1">Crack the Code</h2><p>Decode the intercepted access phrase. The encoder settings survived on the backup panel; use them to calibrate the cipher wheel.</p><div class="cipher-message" id="cipher-message"></div><div class="backup-panel"><span class="eyebrow">BACKUP PANEL / ENCODER MEMORY</span><p>Direction: FORWARD &nbsp;|&nbsp; Key: number of FAILED cells</p><div id="backup-cells" class="backup-cells" role="group" aria-label="Backup cell status"></div></div><div class="cipher-layout"><svg id="wheel" viewBox="0 0 300 300" role="img" aria-label="Adjustable Caesar wheel: outer ring is encrypted; inner ring is decoded"></svg><div class="wheel-controls"><label for="wheel-shift">Wheel offset</label><select id="wheel-shift" aria-describedby="wheel-feedback wheel-instructions"></select><p id="wheel-feedback" role="status" aria-live="polite"></p><p class="muted" id="wheel-instructions">Match each intercepted letter on the outer ring to the inner letter directly beneath it. Enter both decoded words below, then select Unlock system.</p><details class="wheel-table"><summary>View letter pairs as text</summary><p id="wheel-pairs"></p></details></div></div><form id="decode"><label for="answer">Decoded access phrase</label><div class="input-row"><input id="answer" maxlength="150" autocomplete="off" placeholder="Enter both decoded words" required><button>Unlock system &rarr;</button></div></form>';
    document.querySelector('#cipher-message').textContent = state.cipher.message;
    const cells = document.querySelector('#backup-cells');
    for (let i = 0; i < 8; i++) {
      const cell = document.createElement('span');
      const failed = i < state.cipher.failedCells;
      cell.className = failed ? 'cell failed' : 'cell online';
      cell.textContent = String(i + 1).padStart(2, '0') + ' / ' + (failed ? 'FAILED' : 'ONLINE');
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
    control.oninput = control.onchange = () => { wheelShift = Number(control.value); buildWheel(); };
    buildWheel();
    document.querySelector('#decode').onsubmit = e => { e.preventDefault(); answer(1, document.querySelector('#answer').value); };
  } else if (state.stage === 2) {
    screen.innerHTML = '<span class="eyebrow">STAGE 02 // TARGET: 2 MINUTES</span><h2 id="screen-title" tabindex="-1">The Corrupted AI</h2><p>The display says ALL CLEAR, but the grid is offline. Trace what changed the assistant behaviour and identify the attack and its source. Locate the recovery inventory before leaving.</p><p class="muted">Use <code>help</code> for command syntax. File names are case-sensitive.</p><div class="terminal-bar"><span>analyst@blackout</span><span>INVESTIGATION CONSOLE</span></div><pre id="output" role="log" aria-live="polite" aria-label="Terminal output"></pre><form id="terminal"><label for="command">Terminal command</label><div class="input-row"><input id="command" maxlength="150" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter command" required><button>Execute</button></div></form><p id="evidence" class="muted"></p><form id="diagnosis"><h3>Submit your diagnosis</h3><div class="plan-grid"><div><label for="threat">Attack type</label><select id="threat" required><option value="">Select attack</option><option value="credential-theft">Credential theft</option><option value="data-poisoning">Training data poisoning</option><option value="prompt-injection">Prompt injection</option><option value="denial-of-service">Denial of service</option></select></div><div><label for="source">Source file</label><select id="source" required><option value="">Select source</option><option>status.txt</option><option>recovery.txt</option><option>update.txt</option><option>incident.log</option></select></div></div><button>Verify diagnosis &rarr;</button></form>';
    document.querySelector('#output').textContent = terminalHistory;
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
  svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const rotation = wheelShift * 360 / 26;
  [136, 102, 65].forEach(radius => {
    const circle = document.createElementNS(ns, 'circle');
    Object.entries({ cx: 150, cy: 150, r: radius }).forEach(([key, value]) => circle.setAttribute(key, value));
    svg.append(circle);
  });
  const innerRing = document.createElementNS(ns, 'g');
  innerRing.setAttribute('class', 'inner-ring');
  innerRing.setAttribute('transform', 'rotate(' + rotation + ' 150 150)');
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
        text.setAttribute('transform', 'rotate(' + (-rotation) + ' ' + x + ' ' + y + ')');
        innerRing.append(text);
      } else svg.append(text);
    });
  }
  svg.append(innerRing);
  const label = document.createElementNS(ns, 'text');
  label.setAttribute('x', 150); label.setAttribute('y', 150);
  label.textContent = 'OFFSET ' + String(wheelShift).padStart(2, '0');
  svg.append(label);
  svg.setAttribute('aria-label', 'Caesar wheel at offset ' + wheelShift + '. Outer ring is encrypted; inner ring is decoded.');
  document.querySelector('#wheel-pairs').textContent = pairs.join(' / ');
  const intercepted = state.cipher.message.match(/[A-Z]/)[0];
  const mapped = String.fromCharCode(65 + (intercepted.charCodeAt(0) - 65 - wheelShift + 26) % 26);
  document.querySelector('#wheel-feedback').textContent = 'Offset ' + String(wheelShift).padStart(2, '0') +
    ' selected. First letter: ' + intercepted + ' maps to ' + mapped + '. Decode the remaining letters and enter the phrase below.';
}
document.querySelector('#start').onclick = start;
