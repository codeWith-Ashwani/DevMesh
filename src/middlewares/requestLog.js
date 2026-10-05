const { randomUUID } = require('node:crypto');
module.exports = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  const start = performance.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    console.log(JSON.stringify({ event: 'http_request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(performance.now() - start) }));
  });
  next();
};
