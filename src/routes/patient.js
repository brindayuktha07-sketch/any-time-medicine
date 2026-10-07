const express = require('express');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Consultation = require('../models/Consultation');
const otp = require('../otp');
const { publicPatient, saveBase64Image, asyncHandler, cleanEmail, isValidEmail, otpSentMessage } = require('../utils');

const router = express.Router();

router.get('/:id', asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ id: req.params.id });
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  res.json({ ok: true, patient: publicPatient(patient) });
}));

// History: date, doctor consulted (+ that doctor's total case count), medicine dispensed, bill
router.get('/:id/history', asyncHandler(async (req, res) => {
  const consultations = await Consultation.find({ patientId: req.params.id, status: 'completed' }).sort({ date: -1 });
  const history = await Promise.all(
    consultations.map(async (c) => {
      const doctor = c.doctorId ? await Doctor.findOne({ id: c.doctorId }) : null;
      return {
        id: c.id,
        date: c.date,
        doctorName: doctor ? doctor.name : 'Unknown',
        doctorCaseCount: doctor ? doctor.totalCases : 0,
        symptoms: c.symptoms,
        medicines: c.prescribedMedicines || [],
        dispensed: !!c.dispensed,
        fee: c.fee,
      };
    })
  );
  res.json({ ok: true, history });
}));

// Request an OTP before editing profile details
router.post('/:id/request-edit-otp', asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ id: req.params.id });
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  const result = otp.sendOtp(patient.phone, 'patient-edit', patient.email);
  res.json({ ok: true, channel: result.channel, message: otpSentMessage(result, patient.phone) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { otpCode, name, email, photo } = req.body;
  const patient = await Patient.findOne({ id: req.params.id });
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  // A blank email field means "leave it as it is"; a filled one must be a valid address.
  const newEmail = typeof email === 'string' ? cleanEmail(email) : '';
  if (newEmail && !isValidEmail(newEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });

  const verify = otp.verifyOtp(patient.phone, 'patient-edit', otpCode);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });

  if (name) patient.name = name;
  if (newEmail) patient.email = newEmail;
  if (photo) patient.photo = saveBase64Image(photo, `patient-${patient.phone}`) || patient.photo;
  await patient.save();
  res.json({ ok: true, patient: publicPatient(patient) });
}));

module.exports = router;
