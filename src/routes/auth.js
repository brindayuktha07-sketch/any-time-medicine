const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');
const otp = require('../otp');
const {
  saveBase64Image, publicPatient, publicDoctor, publicAdmin, newId, asyncHandler,
  cleanEmail, isValidEmail, otpSentMessage,
} = require('../utils');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function fileToDataUrl(file) {
  if (!file) return null;
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

/* ---------------------------- OTP endpoints ---------------------------- */

// Signups: the OTP goes to the email the person typed into the form (email is required).
// Login / forgot-password: it goes to the email already saved on that account; only an
// older account with no email on file falls back to WhatsApp (to its own phone number).
const SIGNUP_OTP_PURPOSES = ['patient-signup', 'doctor-signup', 'admin-signup'];

router.post('/otp/send', asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body;
  if (!phone || !purpose) return res.status(400).json({ error: 'phone and purpose are required.' });

  let email = '';
  if (SIGNUP_OTP_PURPOSES.includes(purpose)) {
    email = cleanEmail(req.body.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address — your OTP is sent there.' });
    }
  } else if (purpose === 'patient-forgot') {
    const patient = await Patient.findOne({ phone });
    if (!patient) return res.status(404).json({ error: 'No patient account found with this number.' });
    email = cleanEmail(patient.email);
  } else if (purpose === 'doctor-login') {
    const doctor = await Doctor.findOne({ phone });
    if (!doctor) return res.status(404).json({ error: 'No doctor account found with this number.' });
    email = cleanEmail(doctor.email);
  } else {
    return res.status(400).json({ error: 'Unknown OTP purpose.' });
  }

  // The OTP itself is intentionally not included in this response. It is still logged
  // to the server console (not shown to the person using the app) as a developer-only
  // fallback for debugging.
  const result = otp.sendOtp(phone, purpose, email);
  res.json({ ok: true, channel: result.channel, message: otpSentMessage(result, phone) });
}));

router.post('/otp/verify', (req, res) => {
  const { phone, purpose, code } = req.body;
  const result = otp.verifyOtp(phone, purpose, code);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ ok: true });
});

/* ------------------------------- Patient -------------------------------- */

router.post('/patient/signup', asyncHandler(async (req, res) => {
  const { name, phone, aadhar, password, confirmPassword, email, photo, otpCode } = req.body;
  if (!name || !phone || !aadhar || !password || !confirmPassword) {
    return res.status(400).json({ error: 'name, phone, aadhar, password and confirmPassword are required.' });
  }
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
  const patientEmail = cleanEmail(email);
  if (!isValidEmail(patientEmail)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (!otpCode) return res.status(400).json({ error: 'OTP verification is required for first-time signup.' });

  const verify = otp.verifyOtp(phone, 'patient-signup', otpCode, patientEmail);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });

  const existing = await Patient.findOne({ phone });
  if (existing) return res.status(409).json({ error: 'A patient account with this phone number already exists.' });

  const photoPath = saveBase64Image(photo, `patient-${phone}`);
  const patient = await Patient.create({
    id: newId('pat'),
    name,
    phone,
    aadhar,
    email: patientEmail,
    photo: photoPath,
    passwordHash: bcrypt.hashSync(password, 10),
  });
  res.json({ ok: true, patient: publicPatient(patient) });
}));

router.post('/patient/login', asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const patient = await Patient.findOne({ phone });
  if (!patient || !bcrypt.compareSync(password || '', patient.passwordHash)) {
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }
  res.json({ ok: true, patient: publicPatient(patient) });
}));

router.post('/patient/forgot-password', asyncHandler(async (req, res) => {
  const { phone, otpCode, newPassword } = req.body;
  const patient = await Patient.findOne({ phone });
  if (!patient) return res.status(404).json({ error: 'No patient account found with this number.' });
  const verify = otp.verifyOtp(phone, 'patient-forgot', otpCode);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });
  patient.passwordHash = bcrypt.hashSync(newPassword, 10);
  await patient.save();
  res.json({ ok: true });
}));

/* -------------------------------- Doctor --------------------------------- */

router.post('/doctor/signup', upload.fields([{ name: 'certificate', maxCount: 1 }]), asyncHandler(async (req, res) => {
  const { name, medicalId, phone, email, experience, specialty, password, confirmPassword, photo, otpCode } = req.body;
  if (!name || !medicalId || !phone || !experience || !password || !confirmPassword) {
    return res.status(400).json({ error: 'name, medicalId, phone, experience, password and confirmPassword are required.' });
  }
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
  if (!req.files || !req.files.certificate) return res.status(400).json({ error: 'Medical certificate image is required.' });
  const doctorEmail = cleanEmail(email);
  if (!isValidEmail(doctorEmail)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (!otpCode) return res.status(400).json({ error: 'OTP verification is required for first-time signup.' });

  const verify = otp.verifyOtp(phone, 'doctor-signup', otpCode, doctorEmail);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });

  const existing = await Doctor.findOne({ $or: [{ phone }, { medicalId }] });
  if (existing) return res.status(409).json({ error: 'A doctor account with this phone number or medical ID already exists.' });

  const certDataUrl = fileToDataUrl(req.files.certificate[0]);
  const certPath = saveBase64Image(certDataUrl, `cert-${medicalId}`);
  const photoPath = saveBase64Image(photo, `doctor-${phone}`);

  const doctor = await Doctor.create({
    id: newId('doc'),
    name,
    medicalId,
    phone,
    email: doctorEmail,
    experience: Number(experience) || 0,
    specialty: specialty || '',
    certificate: certPath,
    photo: photoPath,
    passwordHash: bcrypt.hashSync(password, 10),
  });
  res.json({ ok: true, doctor: publicDoctor(doctor) });
}));

router.post('/doctor/login', asyncHandler(async (req, res) => {
  const { phone, otpCode } = req.body;
  const doctor = await Doctor.findOne({ phone });
  if (!doctor) return res.status(404).json({ error: 'No doctor account found with this number.' });
  const verify = otp.verifyOtp(phone, 'doctor-login', otpCode);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });
  doctor.online = true;
  await doctor.save();
  res.json({ ok: true, doctor: publicDoctor(doctor) });
}));

/* -------------------------------- Admin ---------------------------------- */

router.post('/admin/signup', asyncHandler(async (req, res) => {
  const { name, phone, email, password, confirmPassword, photo, otpCode } = req.body;
  if (!name || !phone || !password || !confirmPassword) {
    return res.status(400).json({ error: 'name, phone, password and confirmPassword are required.' });
  }
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
  const adminEmail = cleanEmail(email);
  if (!isValidEmail(adminEmail)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (!otpCode) return res.status(400).json({ error: 'OTP verification is required for first-time signup.' });

  const verify = otp.verifyOtp(phone, 'admin-signup', otpCode, adminEmail);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });

  const existing = await Admin.findOne({ phone });
  if (existing) return res.status(409).json({ error: 'An admin account with this phone number already exists.' });

  const photoPath = saveBase64Image(photo, `admin-${phone}`);
  const admin = await Admin.create({
    id: newId('adm'),
    name,
    phone,
    email: adminEmail,
    photo: photoPath,
    passwordHash: bcrypt.hashSync(password, 10),
  });
  res.json({ ok: true, admin: publicAdmin(admin) });
}));

router.post('/admin/login', asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const admin = await Admin.findOne({ phone });
  if (!admin || !bcrypt.compareSync(password || '', admin.passwordHash)) {
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }
  res.json({ ok: true, admin: publicAdmin(admin) });
}));

module.exports = router;
