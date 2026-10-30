const { Schema, model } = require('mongoose');
const s = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 40 },
  token: { type: String, required: true, select: false }
}, { timestamps: true });
s.index({ room: 1, name: 1 }, { unique: true });
module.exports = model('User', s);
