const { getRedis } = require('../config/redis');
const { fail } = require('../utils/domain');
const memory = new Map();
const timer = setInterval(() => { for (const [key, value] of memory) if (value.until < Date.now()) memory.delete(key); }, 60000);
timer.unref();
const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";
async function throttle(key, max = 60, window = 60000) {
  const redis = getRedis();
  if (redis) {
    let hits;
    try { hits = await redis.eval(script, 1, `devmesh:limit:${key}`, window); }
    catch { fail(503, 'Messaging temporarily unavailable'); }
    if (hits > max) fail(429, 'Too many events; please wait');
    return;
  }
  const now = Date.now();
  let record = memory.get(key);
  if (!record || record.until <= now) { record = { hits: 0, until: now + window }; memory.set(key, record); }
  if (++record.hits > max) fail(429, 'Too many events; please wait');
}
module.exports = { throttle };
