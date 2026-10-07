// OTPs are short-lived by nature, so they're kept in memory (not the database) —
// no need for them to survive a server restart.
const { sendEmail } = require('./email');
const { sendWhatsApp } = require('./whatsapp');
const { otpEmail } = require('./emailTemplates');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const store = new Map(); // key: "phone:purpose" -> { otp, expiresAt, email }

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Generates and sends an OTP for a given phone + purpose (signup / login / edit-profile / forgot-password).
 *
 * Delivery: by EMAIL when an email address is given (see src/email.js). Only when there is
 * no email on file (older accounts created before email became required) does it fall back
 * to WhatsApp (see src/whatsapp.js). The code is also logged to the server console as a
 * developer-only debugging fallback, but is never sent back in the API response.
 *
 * Returns { channel: 'email' | 'whatsapp', email } so the caller can tell the user where it went.
 */
function sendOtp(phone, purpose, email) {
  const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit
  const to = normalizeEmail(email);
  store.set(`${phone}:${purpose}`, { otp, expiresAt: Date.now() + OTP_TTL_MS, email: to });

  const channel = to ? 'email' : 'whatsapp';
  console.log(`\n[OTP] phone=${phone} purpose=${purpose} via=${channel} otp=${otp} (valid 5 min)\n`);

  if (to) {
    sendEmail({ to, ...otpEmail(otp, 5) }).catch(() => {});
  } else {
    sendWhatsApp(phone, `Your ATM verification code is ${otp}. It expires in 5 minutes.`).catch(() => {});
  }

  return { channel, email: to };
}

/**
 * expectedEmail (optional): at signup, pass the email the user is registering with — the
 * OTP only counts if it was sent to that same address.
 */
function verifyOtp(phone, purpose, otp, expectedEmail) {
  const key = `${phone}:${purpose}`;
  const record = store.get(key);
  if (!record) return { ok: false, reason: 'No OTP requested for this number.' };
  if (Date.now() > record.expiresAt) {
    store.delete(key);
    return { ok: false, reason: 'OTP expired. Please request a new one.' };
  }
  if (expectedEmail !== undefined && record.email && record.email !== normalizeEmail(expectedEmail)) {
    return { ok: false, reason: 'This OTP was sent to a different email address. Please request a new OTP for this email.' };
  }
  if (record.otp !== String(otp)) return { ok: false, reason: 'Incorrect OTP.' };
  store.delete(key);
  return { ok: true };
}

module.exports = { sendOtp, verifyOtp };
