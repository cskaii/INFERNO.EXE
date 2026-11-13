// Run locally with npm run ai:check. Never print the key or provider error body.
const config = require('./config');
const { createAiService } = require('./services/aiService');
async function main() {
  console.log('API key:', config.apiKey ? 'configured' : 'missing');
  console.log('Model:', config.model);
  console.log('Timeout:', config.timeoutMs / 1000, 'seconds');
  if (!config.apiKey) {
    console.log('Set GEMINI_API_KEY in .env beside package.json, then restart the server.');
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--probe')) {
    // Minimal requests isolate model/connection failures from the game's prompt.
    for (const model of [...new Set([config.model, 'gemini-3.1-flash-lite'])]) {
      const started = Date.now();
      console.log('\nProbing:', model);
      try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }], generationConfig: { maxOutputTokens: 256 } }),
          signal: AbortSignal.timeout(15000)
        });
        console.log('HTTP status:', response.status);
        const data = await response.json();
        if (data.error) console.log('Provider error:', String(data.error.message || data.error.status).split(config.apiKey).join('[REDACTED]').replace(/AIza[\w-]+/g, '[REDACTED]').slice(0, 1500));
        else console.log('Finish reason:', data.candidates?.[0]?.finishReason || 'none', '| Text received:', Boolean(data.candidates?.[0]?.content?.parts?.some(part => part.text && !part.thought)));
      } catch (error) {
        console.log('Probe error:', error.name === 'TimeoutError' ? 'TIMEOUT' : error.cause?.code || error.name);
      }
      console.log('Elapsed:', ((Date.now() - started) / 1000).toFixed(1), 'seconds');
    }
    return;
  }
  if (process.argv.includes('--models')) {
    let pageToken = '';
    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url, {
        headers: { 'x-goog-api-key': config.apiKey },
        signal: AbortSignal.timeout(config.timeoutMs)
      });
      if (!response.ok) {
        console.log('Model listing HTTP status:', response.status);
        process.exitCode = 1;
        return;
      }
      const data = await response.json();
      for (const model of data.models || []) {
        if (model.supportedGenerationMethods?.includes('generateContent')) {
          console.log(model.name.replace(/^models\//, ''));
        }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return;
  }
  const checkedFetch = async (...args) => {
    try {
      const response = await fetch(...args);
      console.log('Google HTTP status:', response.status);
      if (!response.ok) {
        const details = await response.clone().json().catch(() => null);
        if (details?.error) {
          const redact = value => String(value || '').split(config.apiKey).join('[REDACTED]').replace(/AIza[\w-]+/g, '[REDACTED]');
          console.log('Google error status:', redact(details.error.status));
          console.log('Google error message:', redact(details.error.message).slice(0, 2000));
        }
      }
      const advice = {
        400: 'Check the API key and whether this model supports the request settings.',
        401: 'Check your API key in Google AI Studio.',
        403: 'Check API key restrictions and project access in Google AI Studio.',
        404: 'Check GEMINI_MODEL: this model may be unavailable for your API.',
        429: 'Google quota or rate limit reached. Check your project quota and retry later.'
      };
      if (!response.ok) console.log(advice[response.status] || 'Google is unavailable. Retry later.');
      return response;
    } catch (error) {
      const code = args[1]?.signal?.aborted ? 'REQUEST_TIMEOUT' : error.cause?.code || error.code || error.name;
      console.log('Connection error:', code);
      if (code === 'REQUEST_TIMEOUT') console.log('Gemini did not respond before AI_TIMEOUT_MS. Retry once; check Google availability if this persists.');
      else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') console.log('DNS lookup failed. Run: Resolve-DnsName generativelanguage.googleapis.com');
      else console.log('Check connectivity, proxy/firewall settings and the configured timeout.');
      throw error;
    }
  };
  const result = await createAiService(config, checkedFetch).respond('Why are the alarms silent?', [], 'alarm-status');
  console.log('Response mode:', result.mode);
  if (result.mode === 'gemini') console.log('Gemini is responding. Restart npm start to load the same configuration.');
  else { console.log('Fallback reason:', result.fallbackReason); process.exitCode = 1; }
}
main().catch(() => { console.error('Diagnostic failed. Check the local configuration.'); process.exitCode = 1; });
