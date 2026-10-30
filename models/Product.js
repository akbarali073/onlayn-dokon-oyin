const { Schema, model } = require('mongoose');
module.exports = model('Product', new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: String,
  name: { type: String, required: true, maxlength: 80 },
  image: { type: String, default: '' },
  price: { type: Number, required: true, min: 1 },
  description: { type: String, default: '', maxlength: 500 },
  sold: { type: Number, default: 0 }
}, { timestamps: true }));
