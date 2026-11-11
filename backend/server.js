const config = require('./config');
const express = require('express');
const path = require('node:path');
const { createGameRouter } = require('./routes/game');
function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.RENDER === 'true') app.set('trust proxy', 1);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin && origin !== req.protocol + '://' + req.get('host')) {
      if (!(options.origins ?? config.origins).includes(origin)) return res.status(403).json({ error: 'Frontend origin is not allowed.' });
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.vary('Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', createGameRouter(options.ai));
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 400 || error.status === 413 ? error.status : 500;
    res.status(status).json({ error: status === 400 ? 'Invalid JSON request.' : status === 413 ? 'Request body too large.' : 'Unexpected server error.' });
  });
  return app;
}
const app = createApp();
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log('The Blackout running at http://localhost:' + port);
    console.log('AI mode: ' + (config.apiKey ? 'Gemini with scripted fallback' : 'Scripted (no API key configured)'));
  });
}
module.exports = app;
module.exports.createApp = createApp;
