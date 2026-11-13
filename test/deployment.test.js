const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { backendOrigin, build } = require('../scripts/buildFrontend');

test('production backend URL must be an HTTPS origin without credentials or paths', () => {
  assert.equal(backendOrigin(' https://blackout-example.onrender.com/ '), 'https://blackout-example.onrender.com');
  for (const value of ['', 'not-a-url', 'http://example.com', 'https://example.com/api', 'https://key@example.com', 'https://example.com?key=secret', 'https://example.com/#secret']) {
    assert.throws(() => backendOrigin(value));
  }
});

test('Vercel build contains only public assets and the selected API origin', () => {
  const previous = process.env.BACKEND_URL;
  process.env.BACKEND_URL = 'https://blackout-example.onrender.com';
  try {
    build();
    const config = fs.readFileSync('dist/config.js', 'utf8');
    assert.match(config, /https:\/\/blackout-example.onrender.com/);
    assert.equal(fs.existsSync('dist/.env'), false);
    assert.equal(fs.existsSync('dist/backend'), false);
    assert.equal(fs.existsSync('dist/node_modules'), false);
    assert.ok(fs.existsSync('dist/assets/nyp-infosec-haunted.png'));
    const html = fs.readFileSync('dist/index.html', 'utf8');
    assert.ok(html.indexOf('src="config.js"') < html.indexOf('src="app.js"'));
    assert.deepEqual(Object.keys(JSON.parse(config.slice(config.indexOf('=') + 1).trim().replace(/;$/, ''))), ['apiBaseUrl']);
  } finally {
    if (previous === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previous;
  }
});
