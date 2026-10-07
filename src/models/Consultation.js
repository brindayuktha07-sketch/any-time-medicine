const mongoose = require('mongoose');

const prescribedMedicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    dosage: { type: String, default: '' },
    price: { type: Number, default: 0 }, // snapshot of the medicine's price at prescribe-time
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const consultationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  patientId: { type: String, required: true },
  doctorId: { type: String, default: null },
  symptoms: { type: String, required: true },
  medicinesTaken: { type: String, default: '' },
  allergies: { type: String, default: '' },
  vitals: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, default: 'pending' }, // pending | accepted | completed
  targetDoctors: { type: [String], default: [] },
  prescribedMedicines: { type: [prescribedMedicineSchema], default: [] },
  dispensed: { type: Boolean, default: false },
  // Billing: flat consultation fee + sum of prescribed medicine prices, computed once the call ends.
  fee: {
    consultationFee: { type: Number, default: 0 },
    medicinesTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  qrCode: { type: String, default: null }, // data:image/png;base64,... UPI payment QR
  roomId: { type: String, default: null },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Consultation', consultationSchema);
