const express = require('express');
const Medicine = require('../models/Medicine');
const { asyncHandler } = require('../utils');

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Used by the doctor's "add medicine" search box during a call, and anywhere
// else in the app that needs to look up what's currently stocked in the ATM.
router.get('/', asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = search ? { name: new RegExp(escapeRegex(String(search).trim()), 'i') } : {};
  const medicines = await Medicine.find(query).sort({ name: 1 }).limit(50);
  res.json({ ok: true, medicines });
}));

module.exports = router;
