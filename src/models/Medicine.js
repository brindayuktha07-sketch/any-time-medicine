const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true, default: 0 }, // rupees per unit
  quantity: { type: Number, required: true, default: 0 },
  expiryDate: { type: String, required: true }, // stored as YYYY-MM-DD to match <input type="date">
});

module.exports = mongoose.model('Medicine', medicineSchema);
