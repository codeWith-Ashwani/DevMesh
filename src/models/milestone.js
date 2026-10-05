const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, maxlength: 100 },
  definitionOfDone: { type: String, required: true, maxlength: 1000 },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['planned', 'building', 'completed'], default: 'planned' },
  evidenceUrl: { type: String, maxlength: 500, default: '' },
}, { timestamps: true });
schema.index({ project: 1, _id: -1 });
module.exports = mongoose.model('Milestone', schema);
