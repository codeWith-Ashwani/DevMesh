const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String, required: true, maxlength: 100 },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: true });
schema.index({ conversation: 1, _id: -1 });
schema.index({ conversation: 1, sender: 1, clientId: 1 }, { unique: true });
module.exports = mongoose.model('ChatMessage', schema);
