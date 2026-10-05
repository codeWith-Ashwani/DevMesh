const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', required: true },
}, { timestamps: true });
schema.index({ conversation: 1, user: 1 }, { unique: true });
module.exports = mongoose.model('ReadReceipt', schema);
