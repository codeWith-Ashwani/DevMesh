const env = require('../config/env');
module.exports = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const browser = req.get('sec-fetch-site');
  if ((origin && origin !== env.getClientURL()) || (browser && !origin)) {
    return res.status(403).json({ message: 'Request origin denied' });
  }
  // Non-browser API clients may omit Origin; browsers sending JSON or forms
  // carry Origin/Fetch Metadata and are checked above.
  next();
};
