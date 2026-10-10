process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('hex');
process.env.CLIENT_URL = 'http://localhost:5173';
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const { attachRealtime } = require('../../src/realtime');
const { loginLimiter, signupLimiter, passwordUpdateLimiter } = require('../../src/middlewares/rateLimiter');
let server, memory, realtime, baseUrl;
async function startTestServer() {
  if (server) return baseUrl;
  memory = await MongoMemoryServer.create({ binary: { version: '7.0.24', downloadDir: require('path').resolve('node_modules/.cache/devmesh-test-mongo') } });
  process.env.DB_CONNECTION_STRING = memory.getUri('devmesh_test');
  await mongoose.connect(process.env.DB_CONNECTION_STRING);
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  server = http.createServer(app);
  realtime = await attachRealtime(server);
  app.set('io', realtime.io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}
async function stopTestServer() {
  if (realtime) await realtime.close();
  server = null; realtime = null;
  await mongoose.disconnect();
  if (memory) await memory.stop();
  memory = null;
}
async function request(method, path, body = null, cookies = null) {
  if (!server) await startTestServer();
  const headers = { 'Content-Type': 'application/json' };
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === null ? null : JSON.stringify(body) });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: response.status, data, setCookie: response.headers.get('set-cookie'), headers: response.headers };
}
async function createTestUser(overrides = {}) {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = overrides.email || `test.${unique}@devmesh.example`;
  const password = overrides.password || 'TestPassword#2026';
  const result = await request('POST', '/signup', { firstName: 'Test', lastName: 'User', email, password, ...overrides });
  return { _id: result.data?.data?._id, user: result.data?.data, email, password, cookie: result.setCookie?.split(';')[0], status: result.status };
}
function resetRateLimiters() { loginLimiter.reset(); signupLimiter.reset(); passwordUpdateLimiter.reset(); }
async function cleanupTestData(emails = []) {
  const User = require('../../src/models/user');
  const users = await User.find({ email: { $in: emails } }).select('_id');
  const ids = users.map(u => u._id);
  const projects = await mongoose.model('Project').find({ creator: { $in: ids } }).select('_id');
  for (const model of Object.values(mongoose.models)) {
    await model.deleteMany({ $or: [{ user: { $in: ids } }, { owner: { $in: ids } }, { creator: { $in: ids } }, { sender: { $in: ids } }, { fromUserId: { $in: ids } }, { toUserId: { $in: ids } }, { project: { $in: projects.map(p => p._id) } }] });
  }
  await User.deleteMany({ _id: { $in: ids } });
}
module.exports = { startTestServer, stopTestServer, request, createTestUser, resetRateLimiters, cleanupTestData };
