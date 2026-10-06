const Conversation = require('../models/conversation');
const ChatMessage = require('../models/chatMessage');
const LegacyMessage = require('../models/message');
const Connection = require('../models/conectionRequest');
const Project = require('../models/project');
const User = require('../models/user');
const Trial = require('../models/trial');
const ReadReceipt = require('../models/readReceipt');
const { Types } = require('mongoose');
const { fail, id, text } = require('../utils/domain');

async function connected(a, b) {
  return Connection.exists({ status: 'accepted', $or: [{ fromUserId: a, toUserId: b }, { fromUserId: b, toUserId: a }] });
}
function projectMembers(project) {
  return [...new Set([String(project.creator), ...project.applications.filter(a => a.status === 'accepted').map(a => String(a.user))])];
}
// Both single-room access and the batched inbox use current project/trial membership.
function currentMembers(conversation, project, trial, trialProjectExists) {
  if (conversation.kind === 'trial') {
    if (!trial || !['active', 'completed'].includes(trial.status) || !trialProjectExists) fail(403, 'Trial chat is unavailable');
    return [String(trial.owner), String(trial.participant)];
  }
  if (conversation.kind === 'project') {
    if (!project) fail(404, 'Project not found');
    return projectMembers(project);
  }
  return conversation.members.map(String);
}
async function access(userId, conversationId) {
  id(conversationId);
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) fail(404, 'Conversation not found');
  let project, trial, trialProjectExists;
  if (conversation.kind === 'trial') {
    trial = await Trial.findById(conversation.trial).lean();
    trialProjectExists = trial && await Project.exists({ _id: trial.project });
  }
  if (conversation.kind === 'project') {
    project = await Project.findById(conversation.project).select('creator applications.user applications.status').lean();
  }
  const members = currentMembers(conversation, project, trial, trialProjectExists);
  if (!members.includes(String(userId))) fail(403, 'Conversation access denied');
  if (conversation.kind === 'direct' && !await connected(members[0], members[1])) fail(403, 'An accepted connection is required');
  return { ...conversation, members };
}
async function openDirect(userId, peerId) {
  id(peerId);
  if (String(userId) === String(peerId)) fail(400, 'Choose another developer');
  if (!await connected(userId, peerId)) fail(403, 'An accepted connection is required');
  const members = [String(userId), String(peerId)].sort();
  const key = `direct:${members.join(':')}`;
  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate({ key }, { $setOnInsert: { kind: 'direct', owner: userId, members, key } }, { upsert: true, returnDocument: 'after' });
  } catch (e) { if (e.code !== 11000) throw e; conversation = await Conversation.findOne({ key }); }
  // Preserve existing personal history. Stable IDs make concurrent imports idempotent.
  // Per-message completion survives retries and writers with older ObjectIds.
  const filter = { chatImported: { $ne: true }, $or: [{ fromUserId: userId, toUserId: peerId }, { fromUserId: peerId, toUserId: userId }] };
  const legacy = LegacyMessage.find(filter).sort({ _id: 1 }).lean().cursor({ batchSize: 100 });
  let batch = [];
  async function importBatch() {
    try {
      await ChatMessage.bulkWrite(batch.map(m => ({ updateOne: {
        filter: { _id: m._id }, update: { $setOnInsert: { conversation: conversation._id, sender: m.fromUserId, clientId: `legacy:${m._id}`, text: m.text, createdAt: m.createdAt, updatedAt: m.updatedAt } }, upsert: true, timestamps: false,
      } })), { ordered: false, timestamps: false });
    } catch (error) {
      // Concurrent imports can win the same upsert. Other failures must retry.
      if (error.code !== 11000 || !error.writeErrors?.length || error.writeErrors.some(e => e.code !== 11000) || error.writeConcernErrors?.length) throw error;
    }
    await LegacyMessage.updateMany({ _id: { $in: batch.map(message => message._id) } }, { $set: { chatImported: true } });
    batch = [];
  }
  for await (const message of legacy) {
    batch.push(message);
    if (batch.length === 100) await importBatch();
  }
  if (batch.length) await importBatch();
  return conversation;
}
async function createGroup(userId, input) {
  const name = text(input.name, 1, 80);
  if (!Array.isArray(input.members) || input.members.length < 1 || input.members.length > 49) fail(400, 'Choose 1-49 collaborators');
  const members = [...new Set([String(userId), ...input.members.map(v => String(id(v)))])];
  if (members.length < 2) fail(400, 'Choose another collaborator');
  const peers = members.filter(v => v !== String(userId));
  const connections = await Connection.find({ status: 'accepted', $or: [
    { fromUserId: userId, toUserId: { $in: peers } }, { toUserId: userId, fromUserId: { $in: peers } },
  ] }).select('fromUserId toUserId').lean();
  const accepted = new Set(connections.map(c => String(c.fromUserId) === String(userId) ? String(c.toUserId) : String(c.fromUserId)));
  if (peers.some(peer => !accepted.has(peer))) fail(403, 'Invite accepted connections only');
  return Conversation.create({ kind: 'group', name, owner: userId, members });
}
async function openProject(userId, projectId) {
  const project = await Project.findById(id(projectId)).lean();
  if (!project) fail(404, 'Project not found');
  const members = projectMembers(project);
  if (!members.includes(String(userId))) fail(403, 'Join the project team first');
  const key = `project:${projectId}`;
  try { return await Conversation.findOneAndUpdate({ key }, { $setOnInsert: { kind: 'project', name: project.title, owner: project.creator, members: [], project: projectId, key } }, { upsert: true, returnDocument: 'after' }); }
  catch (e) { if (e.code !== 11000) throw e; return Conversation.findOne({ key }); }
}
async function history(userId, conversationId, before, limit = 30, after) {
  await access(userId, conversationId);
  if (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100) fail(400, 'Limit must be 1-100');
  const filter = { conversation: conversationId };
  if (before) filter._id = { $lt: id(before) };
  if (after) { if (before) fail(400, 'Choose before or after'); filter._id = { $gt: id(after) }; }
  const messages = await ChatMessage.find(filter).sort({ _id: after ? 1 : -1 }).limit(Number(limit) + 1).lean();
  const hasMore = messages.length > Number(limit);
  if (hasMore) messages.pop();
  const data = after ? messages : messages.reverse();
  return { data, hasMore, before: data[0]?._id || null, after: data.at(-1)?._id || null };
}
async function send(userId, input) {
  const conversation = await access(userId, input.conversationId);
  const body = text(input.text);
  const clientId = text(input.clientId, 1, 100);
  if (!/^[a-zA-Z0-9:_-]+$/.test(clientId)) fail(400, 'Invalid message retry ID');
  let message;
  let fresh = false;
  try { message = await ChatMessage.create({ conversation: conversation._id, sender: userId, text: body, clientId }); fresh = true; }
  catch (e) {
    if (e.code !== 11000) throw e;
    message = await ChatMessage.findOne({ conversation: conversation._id, sender: userId, clientId });
    if (!message || message.text !== body) fail(409, 'Retry ID already used for a different message');
  }
  if (fresh) await Conversation.updateOne({ _id: conversation._id }, { $set: { updatedAt: new Date() } });
  return { message: message.toObject(), members: conversation.members, fresh };
}
async function list(userId, before) {
  const projects = await Project.find({ $or: [{ creator: userId }, { applications: { $elemMatch: { user: userId, status: 'accepted' } } }] }).select('_id').limit(100).lean();
  const filter = { $or: [{ members: userId }, { project: { $in: projects.map(p => p._id) } }] };
  if (before) filter._id = { $lt: id(before) };
  const rows = await Conversation.find(filter).sort({ _id: -1 }).limit(31).lean();
  const hasMore = rows.length > 30;
  if (hasMore) rows.pop();
  const data = [];
  const trialIds = rows.filter(r => r.kind === 'trial').map(r => r.trial);
  const directRows = rows.filter(r => r.kind === 'direct');
  const [trials, connections] = await Promise.all([
    trialIds.length ? Trial.find({ _id: { $in: trialIds } }).select('owner participant status project').lean() : [],
    directRows.length ? Connection.find({ status: 'accepted', $or: directRows.flatMap(r => [
      { fromUserId: r.members[0], toUserId: r.members[1] },
      { fromUserId: r.members[1], toUserId: r.members[0] },
    ]) }).select('fromUserId toUserId').lean() : [],
  ]);
  const projectIds = [...new Set([
    ...rows.filter(r => r.kind === 'project').map(r => String(r.project)),
    ...trials.map(t => String(t.project)),
  ])];
  const projectRows = projectIds.length ? await Project.find({ _id: { $in: projectIds } }).select('creator applications.user applications.status').lean() : [];
  const projectMap = new Map(projectRows.map(p => [String(p._id), p]));
  const trialMap = new Map(trials.map(t => [String(t._id), t]));
  const pairKey = (a, b) => [String(a), String(b)].sort().join(':');
  const acceptedPairs = new Set(connections.map(c => pairKey(c.fromUserId, c.toUserId)));
  const authorizedRows = [];
  for (const row of rows) {
    try {
      const trial = trialMap.get(String(row.trial));
      const members = currentMembers(row, projectMap.get(String(row.project)), trial, trial && projectMap.has(String(trial.project)));
      if (!members.includes(String(userId))) continue;
      if (row.kind === 'direct' && !acceptedPairs.has(pairKey(members[0], members[1]))) continue;
      authorizedRows.push({ ...row, members });
    } catch (e) { if (![403, 404].includes(e.status)) throw e; }
  }
  if (authorizedRows.length) {
    const memberIds = [...new Set(authorizedRows.flatMap(r => r.members))];
    const viewer = new Types.ObjectId(String(userId));
    // Indexed lookups run inside MongoDB instead of five network round trips per room.
    const [users, summaries] = await Promise.all([
      User.find({ _id: { $in: memberIds } }).select('firstName lastName photoUrl').lean(),
      Conversation.aggregate([
        { $match: { _id: { $in: authorizedRows.map(r => r._id) } } },
        { $lookup: { from: ReadReceipt.collection.name, let: { room: '$_id' }, pipeline: [
          { $match: { user: viewer, $expr: { $eq: ['$conversation', '$$room'] } } },
          { $project: { message: 1 } },
        ], as: 'receipt' } },
        { $lookup: { from: ChatMessage.collection.name, let: { room: '$_id' }, pipeline: [
          { $match: { $expr: { $eq: ['$conversation', '$$room'] } } },
          { $sort: { _id: -1 } }, { $limit: 1 }, { $project: { text: 1, createdAt: 1 } },
        ], as: 'latest' } },
        { $lookup: { from: ChatMessage.collection.name, let: {
          room: '$_id', readThrough: { $ifNull: [{ $arrayElemAt: ['$receipt.message', 0] }, new Types.ObjectId('000000000000000000000000')] },
        }, pipeline: [
          { $match: { sender: { $ne: viewer }, $expr: { $and: [
            { $eq: ['$conversation', '$$room'] }, { $gt: ['$_id', '$$readThrough'] },
          ] } } }, { $count: 'count' },
        ], as: 'unread' } },
        { $project: { lastMessage: { $ifNull: [{ $arrayElemAt: ['$latest', 0] }, null] }, unreadCount: { $ifNull: [{ $arrayElemAt: ['$unread.count', 0] }, 0] } } },
      ]),
    ]);
    const userMap = new Map(users.map(u => [String(u._id), u]));
    const summaryMap = new Map(summaries.map(s => [String(s._id), s]));
    for (const row of authorizedRows) {
      const summary = summaryMap.get(String(row._id));
      // A concurrently deleted room must not reappear with stale metadata.
      if (summary) data.push({ ...row, members: row.members.map(m => userMap.get(m)).filter(Boolean), unreadCount: summary.unreadCount, lastMessage: summary.lastMessage });
    }
  }
  return { data, hasMore, before: rows.at(-1)?._id || null };
}
async function detail(userId, conversationId) {
  const conversation = await access(userId, conversationId);
  const members = await User.find({ _id: { $in: conversation.members } }).select('firstName lastName photoUrl').lean();
  return { ...conversation, members };
}
async function openTrial(userId, trialId) {
  const trial = await require('../models/trial').findById(id(trialId)).lean();
  if (!trial || !['active', 'completed'].includes(trial.status)) fail(403, 'Accept the trial before chatting');
  const members = [String(trial.owner), String(trial.participant)];
  if (!members.includes(String(userId))) fail(403, 'Trial access denied');
  if (!await Project.exists({ _id: trial.project })) fail(403, 'Trial chat is unavailable');
  const key = `trial:${trialId}`;
  try { return await Conversation.findOneAndUpdate({ key }, { $setOnInsert: { kind: 'trial', name: 'Collaboration trial', owner: trial.owner, members, trial: trialId, key } }, { upsert: true, returnDocument: 'after' }); }
  catch(e) { if (e.code !== 11000) throw e; return Conversation.findOne({ key }); }
}
module.exports = { access, openDirect, createGroup, openProject, openTrial, detail, history, send, list, projectMembers };

