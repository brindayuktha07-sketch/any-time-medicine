const express = require('express');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Medicine = require('../models/Medicine');
const { rankDoctorsForRequest } = require('../matching');
const { computeFee, generateUpiQr } = require('../billing');
const { sendWhatsApp } = require('../whatsapp');
const { sendEmail } = require('../email');
const { receiptEmail } = require('../emailTemplates');
const { dispenseMedicine } = require('../dispenser');
const { publicDoctor, publicPatient, newId, asyncHandler } = require('../utils');

const router = express.Router();

// Injected by server.js so routes can emit socket events.
let io = null;
function attachIo(ioInstance) {
  io = ioInstance;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MAX_TARGET_DOCTORS = 3;

// Patient creates a new consultation request.
router.post('/', asyncHandler(async (req, res) => {
  const { patientId, symptoms, medicinesTaken, allergies, vitals } = req.body;
  if (!patientId || !symptoms) return res.status(400).json({ error: 'patientId and symptoms are required.' });

  const patient = await Patient.findOne({ id: patientId });
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const ranked = await rankDoctorsForRequest({ symptoms, allergies });
  if (ranked.length === 0) {
    return res.status(503).json({ error: 'No doctors are currently available. Please try again shortly.' });
  }
  const targetDoctors = ranked.slice(0, MAX_TARGET_DOCTORS).map((r) => r.doctor.id);

  const consultation = await Consultation.create({
    id: newId('con'),
    patientId,
    doctorId: null,
    symptoms,
    medicinesTaken: medicinesTaken || '',
    allergies: allergies || '',
    vitals: vitals || {},
    status: 'pending',
    targetDoctors,
    prescribedMedicines: [],
    dispensed: false,
  });

  if (io) {
    targetDoctors.forEach((docId) => {
      io.to(`doctor:${docId}`).emit('consultation:new-request', {
        consultation,
        patient: publicPatient(patient),
      });
    });
  }

  // Let each matched doctor know on WhatsApp too, in case they're not watching the app.
  const appUrl = process.env.APP_URL || 'the ATM app';
  ranked.slice(0, MAX_TARGET_DOCTORS).forEach(({ doctor }) => {
    const message =
      `New patient waiting — ${patient.name} has requested a consultation.\n` +
      `Symptoms: ${symptoms}\n\n` +
      `Open ${appUrl} and log in to accept and join the call.`;
    sendWhatsApp(doctor.phone, message).catch(() => {});
  });

  res.json({ ok: true, consultation });
}));

// Pending requests routed to a specific doctor.
router.get('/pending/:doctorId', asyncHandler(async (req, res) => {
  const consultations = await Consultation.find({ status: 'pending', targetDoctors: req.params.doctorId });
  const pending = await Promise.all(
    consultations.map(async (c) => {
      const patient = await Patient.findOne({ id: c.patientId });
      return { consultation: c, patient: publicPatient(patient) };
    })
  );
  res.json({ ok: true, pending });
}));

router.post('/:id/accept', asyncHandler(async (req, res) => {
  const { doctorId } = req.body;
  const consultation = await Consultation.findOne({ id: req.params.id });
  if (!consultation) return res.status(404).json({ error: 'Consultation not found.' });
  if (consultation.status !== 'pending') return res.status(409).json({ error: 'This request has already been handled.' });

  consultation.status = 'accepted';
  consultation.doctorId = doctorId;
  consultation.roomId = consultation.id;
  await consultation.save();

  const doctor = await Doctor.findOne({ id: doctorId });

  if (io) {
    io.to(`patient:${consultation.patientId}`).emit('consultation:accepted', {
      consultation,
      doctor: publicDoctor(doctor),
    });
    (consultation.targetDoctors || [])
      .filter((id) => id !== doctorId)
      .forEach((otherId) => io.to(`doctor:${otherId}`).emit('consultation:taken', { consultationId: consultation.id }));
  }

  res.json({ ok: true, consultation });
}));

// Doctor adds a medicine to the live prescription during (or right after) the call.
// If the medicine matches something in the ATM's inventory, its current price is
// snapshotted onto the prescription so the bill total stays accurate even if the
// admin changes prices later.
router.post('/:id/medicine', asyncHandler(async (req, res) => {
  const { name, dosage } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Medicine name is required.' });

  const consultation = await Consultation.findOne({ id: req.params.id });
  if (!consultation) return res.status(404).json({ error: 'Consultation not found.' });

  const stock = await Medicine.findOne({ name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') });
  const medicine = {
    name: name.trim(),
    dosage: dosage || '',
    price: stock ? stock.price : 0,
    addedAt: new Date(),
  };
  consultation.prescribedMedicines.push(medicine);
  await consultation.save();

  if (io) io.to(`room:${consultation.roomId}`).emit('medicine:added', { consultationId: consultation.id, medicine });
  res.json({ ok: true, medicines: consultation.prescribedMedicines });
}));

router.post('/:id/complete', asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({ id: req.params.id });
  if (!consultation) return res.status(404).json({ error: 'Consultation not found.' });

  // Idempotent: either the patient or the doctor can end the call, and if both
  // happen to hang up at nearly the same time this only completes it once.
  if (consultation.status !== 'completed') {
    consultation.status = 'completed';
    consultation.date = new Date();

    const fee = computeFee(consultation.prescribedMedicines);
    consultation.fee = fee;
    consultation.qrCode = await generateUpiQr({
      amount: fee.total,
      note: `ATM consultation ${consultation.id}`,
    });

    const doctor = await Doctor.findOne({ id: consultation.doctorId });
    if (doctor) {
      doctor.totalCases = (doctor.totalCases || 0) + 1;
      await doctor.save();
    }
    await consultation.save();

    if (io) {
      io.to(`room:${consultation.roomId}`).emit('call:ended', {
        consultationId: consultation.id,
        medicines: consultation.prescribedMedicines,
        fee: consultation.fee,
        qrCode: consultation.qrCode,
      });
    }
  }
  res.json({ ok: true, consultation });
}));

// Patient taps "Dispense" - runs each prescribed medicine through the dispenser
// (today: pure software, always succeeds; once real hardware is connected,
// dispenseMedicine() in src/dispenser.js is the only place that needs to change)
// and decrements ATM stock only for the ones that actually dispensed.
router.post('/:id/dispense', asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({ id: req.params.id });
  if (!consultation) return res.status(404).json({ error: 'Consultation not found.' });
  if (consultation.dispensed) return res.status(409).json({ error: 'Already dispensed.' });

  const notFound = []; // out of stock / no matching medicine at all
  const failed = []; // in stock, but the dispenser itself reported a failure (e.g. a jam)
  for (const pm of consultation.prescribedMedicines) {
    const stock = await Medicine.findOne({ name: new RegExp(`^${escapeRegex(pm.name)}$`, 'i') });
    if (!stock || stock.quantity <= 0) {
      notFound.push(pm.name);
      continue;
    }
    const result = await dispenseMedicine({ name: pm.name, quantityRequested: 1 });
    if (result.dispensed) {
      stock.quantity -= 1;
      await stock.save();
    } else {
      failed.push({ name: pm.name, reason: result.reason || 'Dispense failed.' });
    }
  }
  consultation.dispensed = true;
  await consultation.save();

  // Email the patient their prescription + receipt now that payment is done. (Only an
  // older account with no email on file gets a short WhatsApp message instead.)
  const patient = await Patient.findOne({ id: consultation.patientId });
  const doctor = await Doctor.findOne({ id: consultation.doctorId });
  if (patient) {
    const fee = consultation.fee || { consultationFee: 0, medicinesTotal: 0, total: 0 };
    if (patient.email) {
      const mail = receiptEmail({
        consultationId: consultation.id,
        patientName: patient.name,
        doctorName: doctor ? doctor.name : 'N/A',
        symptoms: consultation.symptoms,
        medicines: consultation.prescribedMedicines.map((m) => ({ name: m.name, dosage: m.dosage, price: m.price })),
        fee,
        date: consultation.date,
      });
      sendEmail({ to: patient.email, ...mail }).catch(() => {});
    } else {
      const total = Number(fee.total) || 0;
      sendWhatsApp(
        patient.phone,
        `Your ATM consultation is complete! Total paid: \u20b9${total.toFixed(2)}. ` +
          `Add an email address to your profile to receive your prescription receipt by email.`
      ).catch(() => {});
    }
  }

  res.json({ ok: true, notFound, failed });
}));

module.exports = { router, attachIo };
