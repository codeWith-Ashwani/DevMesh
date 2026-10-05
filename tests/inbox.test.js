const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, stopTestServer, request, createTestUser } = require('./helpers/testUtils');
const mongoose = require('mongoose');
const Conversation = require('../src/models/conversation');
const Message = require('../src/models/chatMessage');
const Receipt = require('../src/models/readReceipt');
const Project = require('../src/models/project');
const Trial = require('../src/models/trial');
const Connection = require('../src/models/conectionRequest');
let me, peer, outsider, groups;

describe('Batched inbox summaries and current access', () => {
  before(async () => {
    await startTestServer();
    me = await createTestUser(); peer = await createTestUser(); outsider = await createTestUser();
    groups = await Conversation.insertMany(Array.from({ length: 31 }, (_, i) => ({
      kind: 'group', owner: me._id, members: [me._id, peer._id], name: `Group ${i}`,
    })));
  });
  after(async () => { mongoose.set('debug', false); await stopTestServer(); });

  it('bounds database operations on a full page, preserves cursors, and excludes private user fields', async () => {
    let queries = 0;
    mongoose.set('debug', () => { queries++; });
    let response;
    try { response = await request('GET', '/conversations', null, me.cookie); }
    finally { mongoose.set('debug', false); }
    assert.equal(response.status, 200);
    assert.equal(response.data.data.length, 30);
    assert.equal(response.data.hasMore, true);
    assert.ok(queries <= 5, `Expected at most 5 operations, received ${queries}`);
    assert.deepEqual(response.data.data.map(r => r._id), groups.slice(1).reverse().map(r => String(r._id)));
    for (const row of response.data.data) {
      assert.equal(row.unreadCount, 0);
      assert.equal(row.lastMessage, null);
      for (const member of row.members) assert.deepEqual(Object.keys(member).sort(), ['_id', 'firstName', 'lastName', 'photoUrl']);
    }
    const next = await request('GET', `/conversations?before=${response.data.before}`, null, me.cookie);
    assert.equal(next.data.hasMore, false);
    assert.deepEqual(next.data.data.map(r => r._id), [String(groups[0]._id)]);
    assert.equal((await request('GET', '/conversations?before=bad-id', null, me.cookie)).status, 400);
  });

  it('counts only unread peer messages, including no receipt, and finds the latest message', async () => {
    const room = groups.at(-1);
    const messages = await Message.insertMany([
      { conversation: room._id, sender: peer._id, clientId: 'old', text: 'Read peer message' },
      { conversation: room._id, sender: me._id, clientId: 'own', text: 'Own message' },
      { conversation: room._id, sender: peer._id, clientId: 'new', text: 'Unread peer message' },
    ]);
    const getRoom = async () => (await request('GET', '/conversations', null, me.cookie)).data.data.find(r => r._id === String(room._id));
    assert.equal((await getRoom()).unreadCount, 2);
    await Receipt.create({ conversation: room._id, user: me._id, message: messages[0]._id });
    let result = await getRoom();
    assert.equal(result.unreadCount, 1);
    assert.equal(result.lastMessage.text, 'Unread peer message');
    await Receipt.updateOne({ conversation: room._id, user: me._id }, { message: messages[2]._id });
    assert.equal((await getRoom()).unreadCount, 0);
  });

  it('rechecks direct connections, project applications, trial status and parent existence', async () => {
    const project = await Project.create({ creator: peer._id, title: 'Access test project', description: 'A sufficiently detailed project description.', applications: [{ user: me._id, status: 'accepted' }] });
    const connection = await Connection.create({ fromUserId: me._id, toUserId: peer._id, status: 'accepted' });
    const direct = await Conversation.create({ kind: 'direct', owner: me._id, members: [me._id, peer._id] });
    const projectRoom = await Conversation.create({ kind: 'project', owner: peer._id, project: project._id, members: [] });
    const trial = await Trial.create({ project: project._id, owner: peer._id, participant: me._id, deliverable: 'Ship a task', dueAt: new Date(), status: 'active' });
    const trialRoom = await Conversation.create({ kind: 'trial', owner: peer._id, trial: trial._id, members: [peer._id, me._id] });
    const removedProjectRoom = await Conversation.create({ kind: 'project', owner: peer._id, project: project._id, members: [outsider._id] });
    const ids = async user => (await request('GET', '/conversations', null, user.cookie)).data.data.map(r => r._id);
    let mine = await ids(me);
    for (const row of [direct, projectRoom, trialRoom]) assert.ok(mine.includes(String(row._id)));
    assert.ok(!(await ids(outsider)).includes(String(removedProjectRoom._id)), 'Stored project members must not grant access');
    await Connection.deleteOne({ _id: connection._id });
    await Project.updateOne({ _id: project._id }, { $set: { 'applications.0.status': 'withdrawn' } });
    mine = await ids(me);
    assert.ok(!mine.includes(String(direct._id)));
    assert.ok(!mine.includes(String(projectRoom._id)));
    assert.ok(mine.includes(String(trialRoom._id)), 'Active trial remains independent of project acceptance');
    await Trial.updateOne({ _id: trial._id }, { status: 'invited' });
    assert.ok(!(await ids(me)).includes(String(trialRoom._id)));
    await Trial.updateOne({ _id: trial._id }, { status: 'completed' });
    assert.ok((await ids(me)).includes(String(trialRoom._id)));
    await Project.deleteOne({ _id: project._id });
    assert.ok(!(await ids(me)).includes(String(trialRoom._id)));
    assert.equal((await request('GET', `/conversations/${trialRoom._id}`, null, me.cookie)).status, 403);
  });
});
