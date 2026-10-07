const express = require('express');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Consultation = require('../models/Consultation');
const otp = require('../otp');
const { publicDoctor, saveBase64Image, asyncHandler, cleanEmail, isValidEmail, otpSentMessage } = require('../utils');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const doctors = await Doctor.find({});
  res.json({ ok: true, doctors: doctors.map(publicDoctor) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ id: req.params.id });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  res.json({ ok: true, doctor: publicDoctor(doctor) });
}));

// All cases this doctor has handled
router.get('/:id/history', asyncHandler(async (req, res) => {
  const consultations = await Consultation.find({ doctorId: req.params.id, status: 'completed' }).sort({ date: -1 });
  const history = await Promise.all(
    consultations.map(async (c) => {
      const patient = await Patient.findOne({ id: c.patientId });
      return {
        id: c.id,
        date: c.date,
        patientName: patient ? patient.name : 'Unknown',
        symptoms: c.symptoms,
        medicines: c.prescribedMedicines || [],
        fee: c.fee,
      };
    })
  );
  res.json({ ok: true, history, totalCases: history.length });
}));

router.post('/:id/online', asyncHandler(async (req, res) => {
  const { online } = req.body;
  const doctor = await Doctor.findOne({ id: req.params.id });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  doctor.online = !!online;
  await doctor.save();
  res.json({ ok: true });
}));

router.post('/:id/request-edit-otp', asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ id: req.params.id });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const result = otp.sendOtp(doctor.phone, 'doctor-edit', doctor.email);
  res.json({ ok: true, channel: result.channel, message: otpSentMessage(result, doctor.phone) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { otpCode, name, email, experience, specialty, photo } = req.body;
  const doctor = await Doctor.findOne({ id: req.params.id });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });

  // A blank email field means "leave it as it is"; a filled one must be a valid address.
  const newEmail = typeof email === 'string' ? cleanEmail(email) : '';
  if (newEmail && !isValidEmail(newEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });

  const verify = otp.verifyOtp(doctor.phone, 'doctor-edit', otpCode);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });

  if (name) doctor.name = name;
  if (newEmail) doctor.email = newEmail;
  if (experience !== undefined) doctor.experience = Number(experience) || doctor.experience;
  if (specialty !== undefined) doctor.specialty = specialty;
  if (photo) doctor.photo = saveBase64Image(photo, `doctor-${doctor.phone}`) || doctor.photo;
  await doctor.save();
  res.json({ ok: true, doctor: publicDoctor(doctor) });
}));

module.exports = router;
