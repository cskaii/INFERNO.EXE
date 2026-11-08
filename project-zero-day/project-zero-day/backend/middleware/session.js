const game = require('../services/gameEngine');
function requireSession(req, res, next) {
  const id = req.get('x-session-id');
  const session = id && game.getSession(id);
  if (!session) return res.status(401).json({ error: 'Start a new mission first.' });
  req.game = session;
  next();
}
module.exports = { requireSession };
