function requireText(req, res, next) {
  const value = req.body?.value ?? req.body?.command;
  if (typeof value !== 'string' || value.length > 150) return res.status(400).json({ error: 'Expected text up to 150 characters.' });
  next();
}
module.exports = { requireText };
