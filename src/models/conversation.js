const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  kind: { type: String, enum: ['direct', 'group', 'project', 'trial'], required: true },
  name: { type: String, trim: true, maxlength: 80 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Direct pair/project keys ensure concurrent creation produces one conversation.
  key: { type: String },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  trial: { type: mongoose.Schema.Types.ObjectId, ref: 'Trial' },
}, { timestamps: true });
schema.index({ key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });
schema.index({ members: 1, _id: -1 });
schema.index({ project: 1, _id: -1 });
module.exports = mongoose.model('Conversation', schema);
