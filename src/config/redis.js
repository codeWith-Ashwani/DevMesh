const Redis = require('ioredis');
let client;
async function connectRedis() {
  if (!process.env.REDIS_URL) return null;
  client = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000 });
  client.on('error', () => console.error('Redis connection unavailable'));
  await client.connect();
  return client;
}
async function closeRedis() { if (client) { client.disconnect(); client = null; } }
module.exports = { connectRedis, closeRedis, getRedis: () => client };
