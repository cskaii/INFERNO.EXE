// Deliberately simulated. NEVER pass user commands to a real shell.
const files = {
  'incident.log': '02:14 Untrusted note injected into AI context. Investigate the suspicious instruction.',
  'recovery.txt': 'Recovery protocol: identify malicious instruction, then QUARANTINE it.',
  'readme.txt': 'Try ls, pwd, help, cat incident.log, or cat recovery.txt.'
};
function run(command) {
  const c = String(command || '').trim().replace(/\s+/g, ' ');
  if (c === 'help') return 'Available commands: help, ls, pwd, cat incident.log, cat recovery.txt, cat readme.txt';
  if (c === 'ls') return Object.keys(files).join('   ');
  if (c === 'pwd') return '/home/analyst';
  if (c.startsWith('cat ')) return files[c.slice(4)] || 'cat: file not found';
  return 'Command not recognised. Type help.';
}
module.exports = { run };
