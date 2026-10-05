const Conversation = require('../models/conversation');
const ChatMessage = require('../models/chatMessage');
const LegacyMessage = require('../models/message');
const Connection = require('../models/conectionRequest');
const Project = require('../models/project');
const User = require('../models/user');
const { fail, id, text } = require('../utils/domain');

async function connected(a, b) {
  return Connection.exists({ status: 'accepted', $or: [{ fromUserId: a, toUserId: b }, { fromUserId: b, toUserId: a }] });
}
function projectMembers(project) {
  return [...new Set([String(project.creator), ...project.applications.filter(a => a.status === 'accepted').map(a => String(a.user))])];
}
async function access(userId, conversationId) {
  id(conversationId);
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) fail(404, 'Conversation not found');
  let members = conversation.members.map(String);
  if (conversation.kind === 'trial') {
    const trial = await require('../models/trial').findById(conversation.trial).lean();
    if (!trial || !['active', 'completed'].includes(trial.status) || !await Project.exists({ _id: trial.project })) fail(403, 'Trial chat is unavailable');
    members = [String(trial.owner), String(trial.participant)];
  }
  if (conversation.kind === 'project') {
    const project = await Project.findById(conversation.project).lean();
    if (!project) fail(404, 'Project not found');
    members = projectMembers(project);
  }
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
  const legacy = LegacyMessage.find({ $or: [{ fromUserId: userId, toUserId: peerId }, { fromUserId: peerId, toUserId: userId }] }).lean().cursor();
  for await (const m of legacy) {
    try { await ChatMessage.updateOne({ _id: m._id }, { $setOnInsert: { conversation: conversation._id, sender: m.fromUserId, clientId: `legacy:${m._id}`, text: m.text, createdAt: m.createdAt, updatedAt: m.updatedAt } }, { upsert: true, timestamps: false }); }
    catch (e) { if (e.code !== 11000) throw e; }
  }
  return conversation;
}
async function createGroup(userId, input) {
  const name = text(input.name, 1, 80);
  if (!Array.isArray(input.members) || input.members.length < 1 || input.members.length > 49) fail(400, 'Choose 1-49 collaborators');
  const members = [...new Set([String(userId), ...input.members.map(v => String(id(v)))])];
  if (members.length < 2) fail(400, 'Choose another collaborator');
  for (const peer of members.filter(v => v !== String(userId))) if (!await connected(userId, peer)) fail(403, 'Invite accepted connections only');
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
  for (const row of rows) {
    try {
      const authorized = await access(userId, String(row._id));
      const members = await User.find({ _id: { $in: authorized.members } }).select('firstName lastName photoUrl').lean();
      const receipt = await require('../models/readReceipt').findOne({ conversation: row._id, user: userId }).lean();
      const filter = { conversation: row._id, sender: { $ne: userId } };
      if (receipt) filter._id = { $gt: receipt.message };
      const [unreadCount, lastMessage] = await Promise.all([ChatMessage.countDocuments(filter), ChatMessage.findOne({ conversation: row._id }).sort({ _id: -1 }).select('text createdAt').lean()]);
      data.push({ ...row, members, unreadCount, lastMessage });
    } catch (e) { if (![403, 404].includes(e.status)) throw e; }
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
  const key = `trial:${trialId}`;
  try { return await Conversation.findOneAndUpdate({ key }, { $setOnInsert: { kind: 'trial', name: 'Collaboration trial', owner: trial.owner, members, trial: trialId, key } }, { upsert: true, returnDocument: 'after' }); }
  catch(e) { if (e.code !== 11000) throw e; return Conversation.findOne({ key }); }
}
module.exports = { access, openDirect, createGroup, openProject, openTrial, detail, history, send, list, projectMembers };

