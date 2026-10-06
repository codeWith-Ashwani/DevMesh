const { throttle } = require('../services/throttle');
module.exports = (scope, max = 60) => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  throttle(`mutation:${scope}:${req.user._id}`, max).then(() => next()).catch(next);
};
