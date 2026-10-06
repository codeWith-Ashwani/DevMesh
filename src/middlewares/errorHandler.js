const env = require("../config/env");
const { isDatabaseUnavailable } = require('../utils/availability');

const errorHandler = (err, req, res, next) => {
  if (err.status === 503 || isDatabaseUnavailable(err)) {
    res.set('Retry-After', '3');
    return res.status(503).json({ message: 'Service temporarily unavailable. Please try again.' });
  }
  if (err.name === 'VersionError') {
    return res.status(409).json({ message: 'Data changed; reload and try again' });
  }
  // SyntaxError from body-parser on malformed JSON
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ message: "Invalid JSON payload in request" });
  }

  // Request payload too large (exceeds limit)
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({ message: "Request payload exceeds size limit (50kb)" });
  }

  // Mongoose Validation Error
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }

  // Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    return res.status(409).json({ message: "A record with this unique identifier already exists" });
  }

  // Mongoose CastError / Invalid ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ message: `Invalid format for field '${err.path}'` });
  }

  // Explicit HTTP status code set on error object
  const statusCode = err.statusCode || err.status || 500;

  if (!env.isTest) {
    console.error("Unhandled Application Error:", err.message || err);
  }

  const message = statusCode === 500 && env.isProduction
    ? "Internal server error"
    : err.message || "An unexpected error occurred";

  return res.status(statusCode).json({ message });
};

const notFoundHandler = (req, res) => {
  return res.status(404).json({ message: "Route not found" });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
