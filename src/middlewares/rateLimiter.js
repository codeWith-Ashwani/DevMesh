const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
  const max = options.max || 10; // 10 attempts default
  const message = options.message || "Too many requests. Please try again later.";

  const hits = new Map();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Allow Node process to exit gracefully without keeping timer open
  if (interval.unref) {
    interval.unref();
  }

  const rateLimiter = async (req, res, next) => {
    const ip =
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown";

    const key = `${req.baseUrl || ""}${req.path}:${ip}`;
    if (require('../config/redis').getRedis()) {
      try { await require('../services/throttle').throttle(`http:${key}`, max, windowMs); return next(); }
      catch (error) { res.setHeader('Retry-After', Math.ceil(windowMs / 1000)); return res.status(error.status || 503).json({ message: error.status === 429 ? message : 'Authentication temporarily unavailable' }); }
    }
    const now = Date.now();

    let record = hits.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", resetSeconds);

    if (record.count > max) {
      res.setHeader("Retry-After", resetSeconds);
      return res.status(429).json({ message });
    }

    next();
  };

  // Helper for tests to reset in-memory state
  rateLimiter.reset = () => hits.clear();

  return rateLimiter;
};

// Standard rate limiters with configurable limits via environment variables
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 10,
  message: "Too many login attempts. Please try again after 15 minutes.",
});

const signupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_SIGNUP_MAX) || 10,
  message: "Too many accounts created from this IP. Please try again later.",
});

const passwordUpdateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PASSWORD_MAX) || 5,
  message: "Too many password update requests. Please try again after 15 minutes.",
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  signupLimiter,
  passwordUpdateLimiter,
};
