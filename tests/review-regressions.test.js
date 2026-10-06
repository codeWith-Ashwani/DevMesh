const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const { once } = require('node:events');
const { startTestServer, stopTestServer, request, createTestUser, resetRateLimiters } = require('./helpers/testUtils');
const User = require('../src/models/user');
const Connection = require('../src/models/conectionRequest');
const Legacy = require('../src/models/message');
const Message = require('../src/models/chatMessage');
const chat = require('../src/services/chat');
const { validatePassword } = require('../src/utils/validation');
let base;
describe('Code review regressions', () => {
  before(async () => { base = await startTestServer(); });
  after(stopTestServer);
  beforeEach(resetRateLimiters);
  it('allows only one connection request for concurrent opposing sends', async () => {
    const a = await createTestUser(), b = await createTestUser();
    const results = await Promise.all([
      request('POST', `/request/send/interested/${b._id}`, {}, a.cookie),
      request('POST', `/request/send/interested/${a._id}`, {}, b.cookie),
    ]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.ok(results.every(r => [200, 400, 409].includes(r.status)));
    assert.equal(await Connection.countDocuments({ pairKey: [a._id, b._id].sort().join(':') }), 1);
  });
  it('cannot overwrite a completed review during an accept/reject race', async () => {
    const a = await createTestUser(), b = await createTestUser();
    const sent = await request('POST', `/request/send/interested/${b._id}`, {}, a.cookie);
    const results = await Promise.all(['accepted', 'rejected'].map(status => request('POST', `/request/review/${status}/${sent.data.data._id}`, {}, b.cookie)));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.ok(results.some(r => [400, 409].includes(r.status)));
    assert.equal((await Connection.findById(sent.data.data._id)).status, results.find(r => r.status === 200).data.data.status);
  });
  it('reports database outages as retryable HTTP and socket errors without leaking details', async () => {
    const user = await createTestUser();
    const unavailable = Object.assign(new Error('private database host'), { name: 'MongoNetworkError' });
    const original = mock.method(User, 'findById', () => {
      const query = Promise.reject(unavailable);
      // HTTP awaits the query; socket authentication selects and leans it.
      query.select = () => query; query.lean = () => query;
      return query;
    });
    let socket;
    try {
      const response = await request('GET', '/profile/view', null, user.cookie);
      assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '3');
      assert.ok(!response.data.message.includes('private'));
      socket = io(base, { transports: ['websocket'], reconnection: false, extraHeaders: { Cookie: user.cookie, Origin: 'http://localhost:5173' } });
      const [error] = await once(socket, 'connect_error');
      assert.equal(error.data.status, 503);
      assert.ok(!error.message.includes('private'));
    } finally { socket?.disconnect(); original.mock.restore(); }
    assert.equal((await request('GET', '/profile/view', null, user.cookie)).status, 200);
  });
  it('rejects array bodies and passwords that bcrypt would truncate', async () => {
    assert.equal((await request('POST', '/signup', [])).status, 400);
    assert.throws(() => validatePassword('Aa1!' + 'é'.repeat(35)), /72 UTF-8 bytes/);
    const user = await createTestUser({ password: 'Aa1!' + 'x'.repeat(69) });
    assert.equal(user.status, 400);
  });
  it('clears optional profile fields and rejects values that could break rendering', async () => {
    const user = await createTestUser();
    assert.equal((await request('PATCH', '/profile/edit', { about: 'A bio', gender: 'Male', age: 25, githubUrl: 'https://github.com/example' }, user.cookie)).status, 200);
    const cleared = await request('PATCH', '/profile/edit', { about: '', gender: null, age: null, githubUrl: '', photoUrl: '', skills: [] }, user.cookie);
    assert.equal(cleared.status, 200); assert.equal(cleared.data.data.about, '');
    assert.equal(cleared.data.data.gender, undefined); assert.equal(cleared.data.data.age, undefined);
    assert.equal(cleared.data.data.githubUrl, '');
    for (const body of [{ skills: null }, { githubUrl: 123 }, { age: 18.5 }, { age: [] }, { about: null }]) assert.equal((await request('PATCH', '/profile/edit', body, user.cookie)).status, 400);
  });
  it('returns validation errors for malformed project updates and respects schema minimums', async () => {
    const user = await createTestUser();
    const body = { title: 'Review project', description: 'A project with enough description for the schema.', techStack: ['Node'], rolesNeeded: ['Backend'] };
    assert.equal((await request('POST', '/projects', { ...body, title: 'tiny' }, user.cookie)).status, 400);
    const project = await request('POST', '/projects', body, user.cookie);
    assert.equal(project.status, 201);
    for (const update of [{ techStack: [12] }, { techStack: [''] }, { rolesNeeded: ['Backend', 'backend'] }, { description: 'Too short' }]) assert.equal((await request('PATCH', `/projects/${project.data.data._id}`, update, user.cookie)).status, 400);
  });
  it('imports legacy history once in batches and still imports newly written history', async () => {
    const a = await createTestUser(), b = await createTestUser();
    await Connection.create({ fromUserId: a._id, toUserId: b._id, status: 'accepted' });
    await Legacy.insertMany(Array.from({ length: 220 }, (_, i) => ({ fromUserId: a._id, toUserId: b._id, text: `legacy-${i}` })));
    const room = await chat.openDirect(a._id, b._id);
    assert.equal(await Message.countDocuments({ conversation: room._id }), 220);
    let messageWrites = 0;
    mongoose.set('debug', (collection, operation) => { if (collection === Message.collection.name && ['updateOne', 'bulkWrite'].includes(operation)) messageWrites++; });
    try { await chat.openDirect(a._id, b._id); assert.equal(messageWrites, 0); }
    finally { mongoose.set('debug', false); }
    await Legacy.create({ fromUserId: b._id, toUserId: a._id, text: 'new legacy message' });
    await Promise.all([chat.openDirect(a._id, b._id), chat.openDirect(b._id, a._id)]);
    assert.equal(await Message.countDocuments({ conversation: room._id }), 221);
    await Legacy.create({ _id: mongoose.Types.ObjectId.createFromTime(Math.floor(Date.now() / 1000) - 60), fromUserId: b._id, toUserId: a._id, text: 'A later insert with an older ObjectId' });
    await chat.openDirect(a._id, b._id);
    assert.equal(await Message.countDocuments({ conversation: room._id }), 222);
  });
  it('uses one membership lookup for a group and rejects unconnected invitees', async () => {
    const owner = await createTestUser(), a = await createTestUser(), b = await createTestUser();
    await Connection.create({ fromUserId: owner._id, toUserId: a._id, status: 'accepted' });
    await assert.rejects(chat.createGroup(owner._id, { name: 'Private', members: [a._id, b._id] }), error => error.status === 403);
    await Connection.create({ fromUserId: b._id, toUserId: owner._id, status: 'accepted' });
    let reads = 0;
    mongoose.set('debug', (collection, operation) => { if (collection === Connection.collection.name && operation === 'find') reads++; });
    try { const room = await chat.createGroup(owner._id, { name: 'Private', members: [a._id, b._id] }); assert.equal(room.members.length, 3); assert.equal(reads, 1); }
    finally { mongoose.set('debug', false); }
  });
  it('omits deleted peers from connection and request lists', async () => {
    const a = await createTestUser(), b = await createTestUser();
    await Connection.create({ fromUserId: a._id, toUserId: b._id, status: 'accepted' });
    await User.deleteOne({ _id: b._id });
    assert.deepEqual((await request('GET', '/user/connections', null, a.cookie)).data.data, []);
  });
  it('limits repeated project mutations without blocking reads', async () => {
    const user = await createTestUser();
    for (let i = 0; i < 60; i++) assert.equal((await request('POST', '/projects', {}, user.cookie)).status, 400);
    assert.equal((await request('POST', '/projects', {}, user.cookie)).status, 429);
    assert.equal((await request('GET', '/projects', null, user.cookie)).status, 200);
  });
  it('reports the actual database state when Redis readiness fails', async () => {
    const redisConfig = require('../src/config/redis');
    const originalUrl = process.env.REDIS_URL;
    const stub = mock.method(redisConfig, 'getRedis', () => ({ status: 'end' }));
    process.env.REDIS_URL = 'redis://isolated-readiness-fixture';
    try {
      const response = await request('GET', '/ready');
      assert.equal(response.status, 503);
      assert.equal(response.data.database, 'connected'); assert.equal(response.data.redis, 'disconnected');
    } finally { stub.mock.restore(); if (originalUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = originalUrl; }
  });
  it('notifies a removed project member and immediately revokes chat access', async () => {
    const owner = await createTestUser(), member = await createTestUser();
    const project = await mongoose.model('Project').create({ creator: owner._id, title: 'Live team revocation', description: 'A project whose team changes should reach the chat client.', techStack: ['React'], rolesNeeded: ['Frontend'], applications: [{ user: member._id, role: 'Frontend', status: 'accepted' }] });
    const room = await chat.openProject(owner._id, project._id);
    const socket = io(base, { transports: ['websocket'], reconnection: false, extraHeaders: { Cookie: member.cookie, Origin: 'http://localhost:5173' } });
    try {
      await once(socket, 'connect');
      const removed = once(socket, 'conversation:removed', { signal: AbortSignal.timeout(5000) });
      const result = await request('DELETE', `/projects/${project._id}/team/${member._id}`, null, owner.cookie);
      assert.equal(result.status, 200); assert.equal((await removed)[0].conversationId, String(room._id));
      assert.equal((await request('GET', `/conversations/${room._id}/messages`, null, member.cookie)).status, 403);
    } finally { socket.disconnect(); }
  });
  it('rejects oversized pagination instead of passing unsafe skip values to MongoDB', async () => {
    const user = await createTestUser();
    for (const path of ['/projects?page=99999999999999999999', '/feed?page=100001']) assert.equal((await request('GET', path, null, user.cookie)).status, 400);
  });
});
