const { isValidObjectId } = require('./validation');
class DomainError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new DomainError(status, message); };
const id = (value) => { if (!isValidObjectId(value)) fail(400, 'Invalid ID'); return value; };
const text = (value, min = 1, max = 2000) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `Text must contain ${min}-${max} characters`);
  return value.trim();
};
const endpoint = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ message: 'Invalid input' });
    if (error.code === 11000) return res.status(409).json({ message: 'Already exists' });
    next(error);
  }
};
module.exports = { DomainError, fail, id, text, endpoint };
