function requireText(req, res, next) {
  const value = req.path === '/terminal' ? req.body?.command : req.body?.value;
  if (typeof value !== 'string' || !value.trim() || value.length > 150) {
    return res.status(400).json({ error: 'Expected non-empty text up to 150 characters.' });
  }
  next();
}
module.exports = { requireText };
