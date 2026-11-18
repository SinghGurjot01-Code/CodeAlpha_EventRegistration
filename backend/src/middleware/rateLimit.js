/**
 * Lightweight in-memory sliding-window rate limiter per IP + bucket.
 */
const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 40, keyPrefix = 'rl' } = {}) {
  return (req, res, next) => {
    const ip =
      (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local')
        .toString()
        .split(',')[0]
        .trim();
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || now > entry.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    next();
  };
}

module.exports = { rateLimit };
