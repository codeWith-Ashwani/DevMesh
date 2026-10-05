const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const User = require('./models/user');
const env = require('./config/env');
const chat = require('./services/chat');
const { throttle } = require('./services/throttle');
const { fail } = require('./utils/domain');

async function attachRealtime(server, redis) {
  const io = new Server(server, {
    cors: { origin: env.getClientURL(), credentials: true },
    maxHttpBufferSize: 16384,
    transports: ['websocket'],
    allowRequest: (req, callback) => callback(null, req.headers.origin === env.getClientURL()),
  });
  let subscriber;
  if (redis) {
    subscriber = redis.duplicate();
    subscriber.on('error', () => console.error('Redis chat subscription unavailable'));
    await subscriber.ping();
    io.adapter(createAdapter(redis, subscriber, { key: 'devmesh:socket' }));
  }
  async function authenticate(socket) {
    const token = cookie.parseCookie(socket.handshake.headers.cookie || '').token;
    const decoded = jwt.verify(token || '', env.getJWTSecret(), { algorithms: ['HS256'] });
    const user = await User.findById(decoded._id).select('_id authVersion').lean();
    if (!user || (decoded.version || 0) !== (user.authVersion || 0)) fail(401, 'Session expired');
    return { userId: String(user._id), expires: decoded.exp * 1000 };
  }
  io.use(async (socket, next) => {
    try { socket.data = await authenticate(socket); await throttle(`handshake:${socket.data.userId}`, 30); next(); }
    catch { next(new Error('Authentication required')); }
  });
  io.on('connection', socket => {
    socket.join(`user:${socket.data.userId}`);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, socket.data.expires - Date.now()));
    expiry.unref();
    socket.on('disconnect', () => clearTimeout(expiry));
    const event = (name, max, handler) => socket.on(name, async (input, ack) => {
      if (typeof ack !== 'function') return;
      try {
        await authenticate(socket);
        await throttle(`${name}:${socket.data.userId}`, max);
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid event');
        ack({ ok: true, ...(await handler(input)) });
      } catch (e) { ack({ ok: false, status: e.status || 500, message: e.status ? e.message : 'Unable to process event' }); }
    });
    event('message:send', 60, async input => {
      const result = await chat.send(socket.data.userId, input);
      // Broadcasting retries is safe: clients deduplicate by persisted message ID.
      io.to(result.members.map(member => `user:${member}`)).emit('message:new', result.message);
      return { data: result.message };
    });
    event('conversation:typing', 120, async input => {
      const conversation = await chat.access(socket.data.userId, input.conversationId);
      io.to(conversation.members.filter(m => m !== socket.data.userId).map(m => `user:${m}`)).emit('conversation:typing', { conversationId: input.conversationId, userId: socket.data.userId });
      return {};
    });
    event('conversation:read', 120, async input => {
      const conversation = await chat.access(socket.data.userId, input.conversationId);
      const Message = require('./models/chatMessage');
      const { id } = require('./utils/domain');
      const message = await Message.findOne({ _id: id(input.messageId), conversation: conversation._id }).lean();
      if (!message) fail(404, 'Message not found');
      const Receipt = require('./models/readReceipt');
      const filter = { conversation: conversation._id, user: socket.data.userId };
      try { await Receipt.updateOne(filter, { $max: { message: message._id } }, { upsert: true }); }
      catch(e) { if (e.code !== 11000) throw e; await Receipt.updateOne(filter, { $max: { message: message._id } }); }
      io.to(conversation.members.map(m => `user:${m}`)).emit('conversation:read', { conversationId: input.conversationId, userId: socket.data.userId, messageId: String(message._id) });
      return {};
    });
  });
  return { io, close: async () => { await new Promise(resolve => io.close(resolve)); subscriber?.disconnect(); } };
}
module.exports = { attachRealtime };
