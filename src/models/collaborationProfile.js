const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  hoursPerWeek: { type: Number, min: 1, max: 40, required: true },
  durationWeeks: { type: Number, min: 1, max: 52, required: true },
  goal: { type: String, enum: ['Learn together', 'Ship a portfolio project', 'Contribute to open source', 'Launch a product'], required: true },
  roles: [{ type: String, maxlength: 60 }],
  availableUntil: { type: Date, required: true },
}, { timestamps: true });
schema.index({ availableUntil: 1, _id: -1 });
module.exports = mongoose.model('CollaborationProfile', schema);
