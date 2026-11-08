const express = require('express');
const game = require('../services/gameEngine');
const { requireSession } = require('../middleware/session');
const { requireText } = require('../middleware/validation');
const { run, readFileName } = require('../services/virtualLinux');
const router = express.Router();
router.post('/start', (req, res) => { const sessionId = game.createSession(); res.json({ sessionId, state: game.publicState(game.getSession(sessionId)) }); });
router.use(requireSession);
router.get('/state', (req, res) => res.json(game.publicState(req.game)));
router.post('/hint', (req, res) => res.json(game.hint(req.game)));
router.post('/answer', requireText, (req, res) => {
  const stage = Number(req.body.stage);
  if (![1,2,3].includes(stage)) return res.status(400).json({ error: 'Invalid answer stage.' });
  res.json(game.answer(req.game, stage, req.body.value));
});
router.post('/terminal', requireText, (req, res) => {
  if (!game.valid(req.game) || req.game.stage !== 2) return res.status(403).json({ error: 'Terminal is locked or session ended.' });
  const output = run(req.body.command);
  const file = readFileName(req.body.command);
  if (file && !req.game.readFiles.includes(file)) req.game.readFiles.push(file);
  res.json({ output, state: game.publicState(req.game) });
});
module.exports = router;
