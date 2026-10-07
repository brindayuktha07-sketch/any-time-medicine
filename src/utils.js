const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/**
 * Saves a base64 dataURL (e.g. from a webcam capture: "data:image/png;base64,....")
 * to disk and returns the public relative path to store in the DB.
 */
function saveBase64Image(dataUrl, filenamePrefix) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1].split('/')[1] || 'png';
  const buffer = Buffer.from(match[2], 'base64');
  const filename = `${filenamePrefix}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

// Turns a Mongoose document (or plain object) into a plain object, stripping
// Mongo-internal fields so they never leak into API responses.
function toPlain(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { _id, __v, ...rest } = obj;
  return rest;
}

function publicPatient(p) {
  if (!p) return null;
  const { passwordHash, aadhar, ...rest } = toPlain(p);
  return rest;
}

function publicDoctor(d) {
  if (!d) return null;
  const { passwordHash, ...rest } = toPlain(d);
  return rest;
}

function publicAdmin(a) {
  if (!a) return null;
  const { passwordHash, ...rest } = toPlain(a);
  return rest;
}

/* ------------------------------ Email helpers ------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trimmed + lowercased, or '' if it isn't a string.
function cleanEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return EMAIL_RE.test(cleanEmail(email));
}

// "jane.doe@gmail.com" -> "j***@gmail.com"
function maskEmail(email) {
  const [user, domain] = cleanEmail(email).split('@');
  if (!user || !domain) return '';
  return `${user[0]}***@${domain}`;
}

// The sentence shown to the user after an OTP was sent. `result` is what otp.sendOtp() returns.
function otpSentMessage(result, phone) {
  if (result.channel === 'email') {
    return `OTP sent to ${maskEmail(result.email)}. If you don't see it, check your Spam folder.`;
  }
  return `OTP sent to ${phone} on WhatsApp.`;
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Wraps an async Express route handler so a rejected promise (a thrown error,
// a failed DB call, etc.) becomes a clean JSON 500 response instead of crashing
// the request or leaving it hanging.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: err.message || 'Something went wrong on the server.' });
    });
  };
}

module.exports = {
  saveBase64Image,
  toPlain,
  publicPatient,
  publicDoctor,
  publicAdmin,
  newId,
  asyncHandler,
  cleanEmail,
  isValidEmail,
  maskEmail,
  otpSentMessage,
  UPLOADS_DIR,
};
