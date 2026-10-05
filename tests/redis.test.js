const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const { startTestServer, stopTestServer, request, createTestUser } = require('./helpers/testUtils');
const { connectRedis, closeRedis } = require('../src/config/redis');
const { attachRealtime } = require('../src/realtime');
const { throttle } = require('../src/services/throttle');
const app = require('../src/app');
describe('Redis cross-instance messaging', { skip: !process.env.REDIS_TEST_URL }, () => {
  const servers = [], runtimes = [], sockets = [];
  let redis, a, b, conversation;
  before(async () => {
    await startTestServer();
    process.env.REDIS_URL = process.env.REDIS_TEST_URL;
    redis = await connectRedis();
    a = await createTestUser({ firstName: 'RedisSender' }); b = await createTestUser({ firstName: 'RedisReceiver' });
    const sent = await request('POST', `/request/send/interested/${b._id}`, {}, a.cookie);
    await request('POST', `/request/review/accepted/${sent.data.data._id}`, {}, b.cookie);
    conversation = (await request('POST', '/conversations/direct', { userId: b._id }, a.cookie)).data.data;
    for (let i = 0; i < 2; i++) {
      const server = http.createServer(app); servers.push(server);
      runtimes.push(await attachRealtime(server, redis));
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    }
  });
  after(async () => { sockets.forEach(s => s.disconnect()); for (const runtime of runtimes) await runtime.close(); await closeRedis(); delete process.env.REDIS_URL; await stopTestServer(); });
  it('delivers across two independent Socket.IO servers', async () => {
    for (const [index, user] of [a, b].entries()) {
      const socket = io(`http://127.0.0.1:${servers[index].address().port}`, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie, Origin: 'http://localhost:5173' }, reconnection: false });
      sockets.push(socket); await once(socket, 'connect');
    }
    const received = new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Cross-instance delivery timed out')), 5000); sockets[1].once('message:new', m => { clearTimeout(timeout); resolve(m); }); });
    const result = await new Promise((resolve, reject) => sockets[0].timeout(5000).emit('message:send', { conversationId: conversation._id, clientId: 'redis-cluster', text: 'Hello from another instance' }, (error, result) => error ? reject(error) : resolve(result)));
    assert.equal(result.ok, true); assert.equal((await received)._id, result.data._id);
  });
  it('enforces atomic shared Redis rate limits', async () => {
    const key = `test:${Date.now()}`;
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => throttle(key, 2, 1000)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
    assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.status === 429));
  });
});
