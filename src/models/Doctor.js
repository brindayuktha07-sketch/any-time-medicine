const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  medicalId: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, default: null },
  experience: { type: Number, default: 0 },
  specialty: { type: String, default: '' },
  certificate: { type: String, default: null },
  photo: { type: String, default: null },
  passwordHash: { type: String, required: true },
  online: { type: Boolean, default: false },
  totalCases: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Doctor', doctorSchema);
