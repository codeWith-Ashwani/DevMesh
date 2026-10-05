const router = require('express').Router();
const auth = require('../middlewares/auth');
const chat = require('../services/chat');
const { endpoint } = require('../utils/domain');
router.use('/conversations', auth);
router.use('/conversations', (req, res, next) => {
  require('../services/throttle').throttle(`conversations:${req.method}:${req.user._id}`, req.method === 'GET' ? 300 : 30).then(() => next()).catch(e => res.status(e.status || 503).json({ message: e.message }));
});
router.get('/conversations', endpoint(async (req, res) => res.json(await chat.list(req.user._id, req.query.before))));
async function opened(req, res, operation, status = 200) {
  const conversation = await operation;
  const members = conversation.kind === 'project'
    ? (await chat.access(req.user._id, String(conversation._id))).members
    : conversation.members.map(String);
  req.app.get('io')?.to(members.map(member => `user:${member}`)).emit('conversation:updated', { conversationId: String(conversation._id) });
  res.status(status).json({ data: conversation });
}
router.post('/conversations/direct', endpoint((req, res) => opened(req, res, chat.openDirect(req.user._id, req.body.userId))));
router.post('/conversations/group', endpoint((req, res) => opened(req, res, chat.createGroup(req.user._id, req.body), 201)));
router.post('/conversations/project/:projectId', endpoint((req, res) => opened(req, res, chat.openProject(req.user._id, req.params.projectId))));
router.post('/conversations/trial/:trialId', endpoint((req, res) => opened(req, res, chat.openTrial(req.user._id, req.params.trialId))));
router.get('/conversations/:conversationId', endpoint(async (req, res) => res.json({ data: await chat.detail(req.user._id, req.params.conversationId) })));
router.get('/conversations/:conversationId/messages', endpoint(async (req, res) => res.json(await chat.history(req.user._id, req.params.conversationId, req.query.before, req.query.limit, req.query.after))));
router.get('/conversations/:conversationId/receipts', endpoint(async (req, res) => {
  await chat.access(req.user._id, req.params.conversationId);
  res.json({ data: await require('../models/readReceipt').find({ conversation: req.params.conversationId }).select('user message').lean() });
}));
router.patch('/conversations/:conversationId/members', endpoint(async (req, res) => {
  const { fail, id } = require('../utils/domain');
  const Conversation = require('../models/conversation');
  const conversation = await chat.access(req.user._id, req.params.conversationId);
  if (conversation.kind !== 'group') fail(400, 'Only custom groups can change members');
  const member = String(id(req.body.userId));
  const owner = String(conversation.owner) === String(req.user._id);
  if (!['add', 'remove'].includes(req.body.action)) fail(400, 'Choose add or remove');
  if (!owner && !(req.body.action === 'remove' && member === String(req.user._id))) fail(403, 'Only the group owner can manage collaborators');
  if (member === String(conversation.owner)) fail(400, 'The group owner cannot leave');
  const update = req.body.action === 'add' ? { $addToSet: { members: member } } : { $pull: { members: member } };
  if (req.body.action === 'add') {
    const Connection = require('../models/conectionRequest');
    if (!await Connection.exists({ status: 'accepted', $or: [{ fromUserId: req.user._id, toUserId: member }, { fromUserId: member, toUserId: req.user._id }] })) fail(403, 'Invite accepted connections only');
  }
  const filter = { _id: conversation._id };
  if (req.body.action === 'add') filter.$expr = { $lt: [{ $size: '$members' }, 50] };
  const data = await Conversation.findOneAndUpdate(filter, update, { returnDocument: 'after' });
  if (!data) fail(409, 'Group member limit reached');
  const io = req.app.get('io');
  io?.to(data.members.map(member => `user:${member}`)).emit('conversation:updated', { conversationId: String(data._id) });
  if (req.body.action === 'remove' && conversation.members.includes(member))
    io?.to(`user:${member}`).emit('conversation:removed', { conversationId: String(data._id) });
  res.json({ data });
}));
module.exports = router;

