const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deliverable: { type: String, required: true, maxlength: 1000 },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['invited', 'active', 'declined', 'completed'], default: 'invited' },
  ownerDecision: { type: String, enum: ['pending', 'continue', 'stop'], default: 'pending' },
  participantDecision: { type: String, enum: ['pending', 'continue', 'stop'], default: 'pending' },
  evidenceUrl: { type: String, maxlength: 500, default: '' },
}, { timestamps: true });
schema.index({ project: 1, _id: -1 });
module.exports = mongoose.model('Trial', schema);
