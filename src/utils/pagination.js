const { fail } = require('./domain');
module.exports = (query, defaultLimit = 10, maximumLimit = 50) => {
  const positiveInteger = (value, fallback, name) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string') fail(400, `Invalid ${name}`);
    if (!/^\d+$/.test(value)) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) fail(400, `Invalid ${name}`);
    if (parsed < 1) return fallback;
    return parsed;
  };
  const page = positiveInteger(query.page, 1, 'page');
  if (page > 100000) fail(400, 'Page exceeds pagination limit');
  const limit = Math.min(positiveInteger(query.limit, defaultLimit, 'limit'), maximumLimit);
  return { page, limit, skip: (page - 1) * limit };
};
