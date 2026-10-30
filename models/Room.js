const { Schema, model } = require('mongoose');
module.exports = model('Room', new Schema({
  code: { type: String, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  adminToken: { type: String, required: true, select: false },
  status: { type: String, enum: ['active', 'finished'], default: 'active' }
}, { timestamps: true }));
