const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completed: { type: String, maxlength: 1000, required: true },
  blockers: { type: String, maxlength: 1000, default: '' },
  next: { type: String, maxlength: 1000, required: true },
}, { timestamps: true });
schema.index({ project: 1, _id: -1 });
module.exports = mongoose.model('CheckIn', schema);
