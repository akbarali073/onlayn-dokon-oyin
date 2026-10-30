const { Schema, model } = require('mongoose');
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m, required: true });
module.exports = model('Purchase', new Schema({
  room: { ...ref('Room'), index: true },
  buyer: ref('User'), buyerName: String,
  seller: ref('User'), sellerName: String,
  product: ref('Product'), productName: String,
  qty: { type: Number, min: 1, required: true },
  total: { type: Number, required: true }
}, { timestamps: true }));
