const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { once } = require('node:events');
const { startTestServer, stopTestServer, createTestUser, request } = require('./helpers/testUtils');
const ChatMessage = require('../src/models/chatMessage');
let base, a, b, outsider, direct, group;
const sockets = [];
async function socket(user) {
  const s = io(base, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie, Origin: 'http://localhost:5173' }, reconnection: false });
  sockets.push(s);
  await Promise.race([once(s, 'connect'), once(s, 'connect_error').then(([e]) => Promise.reject(e)), new Promise((_, reject) => setTimeout(() => reject(new Error('Socket connection timed out')), 5000).unref())]);
  return s;
}
const emit = (s, event, input) => new Promise((resolve, reject) => s.timeout(5000).emit(event, input, (error, result) => error ? reject(error) : resolve(result)));
describe('Authenticated real-time personal and group chat', () => {
  before(async () => {
    base = await startTestServer(); a = await createTestUser({ firstName: 'Sender' }); b = await createTestUser({ firstName: 'Receiver' }); outsider = await createTestUser({ firstName: 'Outsider' });
    const sent = await request('POST', `/request/send/interested/${b._id}`, {}, a.cookie);
    await request('POST', `/request/review/accepted/${sent.data.data._id}`, {}, b.cookie);
    direct = (await request('POST', '/conversations/direct', { userId: b._id }, a.cookie)).data.data;
    group = (await request('POST', '/conversations/group', { name: 'Build team', members: [b._id] }, a.cookie)).data.data;
  });
  after(async () => { sockets.forEach(s => s.disconnect()); await stopTestServer(); });
  it('rejects missing cookies and hostile origins', async () => {
    for (const headers of [{ Origin: 'http://localhost:5173' }, { Cookie: a.cookie, Origin: 'https://attacker.example' }]) {
      const s = io(base, { transports: ['websocket'], extraHeaders: headers, reconnection: false }); sockets.push(s);
      await once(s, 'connect_error'); s.disconnect();
    }
  });
  it('delivers persisted personal messages and handles concurrent retries once', async () => {
    const sa = await socket(a), sb = await socket(b);
    const received = once(sb, 'message:new');
    const payload = { conversationId: String(direct._id), clientId: 'retry-test-1', text: 'Ready to build' };
    const results = await Promise.all([emit(sa, 'message:send', payload), emit(sa, 'message:send', payload)]);
    assert.ok(results.every(r => r.ok)); assert.equal(results[0].data._id, results[1].data._id);
    const [message] = await received; assert.equal(message.text, payload.text);
    assert.equal(await ChatMessage.countDocuments({ conversation: direct._id, clientId: payload.clientId }), 1);
    const conflict = await emit(sa, 'message:send', { ...payload, text: 'Different body' }); assert.equal(conflict.status, 409);
  });
  it('creates the same direct conversation under concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => request('POST', '/conversations/direct', { userId: a._id }, b.cookie)));
    assert.ok(results.every(r => r.data.data._id === direct._id));
  });
  it('prevents outsiders reading, sending, typing or marking group messages read', async () => {
    const s = await socket(outsider);
    const result = await request('GET', `/conversations/${group._id}/messages`, null, outsider.cookie); assert.equal(result.status, 403);
    for (const event of ['message:send', 'conversation:typing', 'conversation:read']) {
      const response = await emit(s, event, { conversationId: group._id, text: 'Intrusion', clientId: 'intrusion', messageId: direct._id });
      assert.equal(response.status, 403);
    }
  });
  it('delivers group messages, persists receipts, and revokes removed members', async () => {
    const sa = await socket(a), sb = await socket(b);
    const delivered = once(sb, 'message:new');
    const result = await emit(sa, 'message:send', { conversationId: group._id, text: 'Group milestone', clientId: 'group-1' }); assert.equal(result.ok, true); await delivered;
    assert.equal((await emit(sb, 'conversation:read', { conversationId: group._id, messageId: result.data._id })).ok, true);
    const receipts = await request('GET', `/conversations/${group._id}/receipts`, null, a.cookie); assert.equal(receipts.data.data[0].user, b._id);
    assert.equal((await request('PATCH', `/conversations/${group._id}/members`, { action: 'remove', userId: b._id }, a.cookie)).status, 200);
    assert.equal((await emit(sb, 'message:send', { conversationId: group._id, text: 'Removed', clientId: 'removed' })).status, 403);
  });
  it('replays missed messages through a forward cursor and bounds history', async () => {
    const sa = await socket(a);
    const first = await emit(sa, 'message:send', { conversationId: direct._id, text: 'Before reconnect', clientId: 'before' });
    await emit(sa, 'message:send', { conversationId: direct._id, text: 'Offline message', clientId: 'offline' });
    const replay = await request('GET', `/conversations/${direct._id}/messages?after=${first.data._id}&limit=1`, null, b.cookie);
    assert.equal(replay.data.data[0].text, 'Offline message');
    assert.equal((await request('GET', `/conversations/${direct._id}/messages?limit=101`, null, b.cookie)).status, 400);
  });
  it('disconnects sockets and rejects tokens after logout', async () => {
    const sa = await socket(a); const disconnected = once(sa, 'disconnect');
    assert.equal((await request('POST', '/logout', {}, a.cookie)).status, 200); await disconnected;
    assert.equal((await request('GET', '/conversations', null, a.cookie)).status, 401);
  });
});
