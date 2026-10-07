const express = require('express');
const Admin = require('../models/Admin');
const Medicine = require('../models/Medicine');
const otp = require('../otp');
const { publicAdmin, saveBase64Image, newId, asyncHandler, otpSentMessage } = require('../utils');

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Demo-only password to "unlock" the ATM for restocking medicines.
// In a real deployment this would be a securely stored/rotated credential.
const ATM_LOAD_PASSWORD = process.env.ATM_LOAD_PASSWORD || 'ATM@2026';

router.get('/:id', asyncHandler(async (req, res) => {
  const admin = await Admin.findOne({ id: req.params.id });
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  res.json({ ok: true, admin: publicAdmin(admin) });
}));

router.post('/:id/request-edit-otp', asyncHandler(async (req, res) => {
  const admin = await Admin.findOne({ id: req.params.id });
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  const result = otp.sendOtp(admin.phone, 'admin-edit', admin.email);
  res.json({ ok: true, channel: result.channel, message: otpSentMessage(result, admin.phone) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { otpCode, name, photo } = req.body;
  const admin = await Admin.findOne({ id: req.params.id });
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const verify = otp.verifyOtp(admin.phone, 'admin-edit', otpCode);
  if (!verify.ok) return res.status(400).json({ error: verify.reason });

  if (name) admin.name = name;
  if (photo) admin.photo = saveBase64Image(photo, `admin-${admin.phone}`) || admin.photo;
  await admin.save();
  res.json({ ok: true, admin: publicAdmin(admin) });
}));

/* ------------------------------ Medicines -------------------------------- */

router.get('/data/medicines', asyncHandler(async (req, res) => {
  const medicines = await Medicine.find({}).sort({ name: 1 });
  res.json({ ok: true, medicines });
}));

// "Open" the ATM to load it with medicines - gated by a demo password.
router.post('/data/medicines/unlock', (req, res) => {
  const { password } = req.body;
  if (password !== ATM_LOAD_PASSWORD) return res.status(401).json({ error: 'Incorrect ATM password.' });
  res.json({ ok: true });
});

router.post('/data/medicines', asyncHandler(async (req, res) => {
  const { password, name, price, quantity, expiryDate } = req.body;
  if (password !== ATM_LOAD_PASSWORD) return res.status(401).json({ error: 'Incorrect ATM password.' });
  if (!name || price === undefined || price === '' || !quantity || !expiryDate) {
    return res.status(400).json({ error: 'name, price, quantity and expiryDate are required.' });
  }
  const priceNum = Number(price);
  if (Number.isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'price must be a valid non-negative number.' });

  const existing = await Medicine.findOne({ name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') });
  if (existing) {
    existing.quantity += Number(quantity);
    existing.price = priceNum; // update to the latest price given
    existing.expiryDate = expiryDate;
    await existing.save();
  } else {
    await Medicine.create({ id: newId('med'), name: name.trim(), price: priceNum, quantity: Number(quantity), expiryDate });
  }
  const medicines = await Medicine.find({}).sort({ name: 1 });
  res.json({ ok: true, medicines });
}));

module.exports = router;
