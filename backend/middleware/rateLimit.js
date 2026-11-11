// Per-process fixed-window limits; reset when the server restarts.
function createLimiter(limit, windowMs, key = req => req.ip || 'local') {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [id, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(id);
    const id = key(req);
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }
    if (bucket.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Request limit reached. Try again later or continue using terminal evidence.', retryAfter });
    }
    bucket.count++;
    next();
  };
}
module.exports = { createLimiter };
