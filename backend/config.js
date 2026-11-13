const fs = require('node:fs');
const path = require('node:path');
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
function number(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid configuration: ' + name);
  return value;
}
const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Invalid GEMINI_MODEL');
module.exports = {
  apiKey: process.env.GEMINI_API_KEY?.trim() || '',
  model,
  timeoutMs: number('AI_TIMEOUT_MS', 30000, 100, 60000),
  sessionLimit: number('AI_SESSION_LIMIT', 6, 1, 20),
  minuteLimit: number('AI_GLOBAL_PER_MINUTE', 30, 1, 200),
  dayLimit: number('AI_GLOBAL_PER_DAY', 500, 1, 5000),
  origins: (process.env.FRONTEND_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean)
};
