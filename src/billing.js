const QRCode = require('qrcode');

const CONSULTATION_FEE = 10; // flat ₹10 consultation fee, per the spec

// These are read from environment variables so a real UPI ID never has to be
// committed to the (public) source code. Set UPI_ID and UPI_PAYEE_NAME as
// environment variables (.env locally, "Environment" tab on Render) with your
// real details; until then, demo placeholders are used so the feature still works.
const UPI_ID = process.env.UPI_ID || 'demo@upi';
const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'ATM (Demo)';

/**
 * Computes the bill for a consultation from its prescribed medicines
 * (each medicine's price is snapshotted onto it when the doctor adds it).
 */
function computeFee(prescribedMedicines) {
  const medicinesTotal = (prescribedMedicines || []).reduce((sum, m) => sum + (Number(m.price) || 0), 0);
  const total = CONSULTATION_FEE + medicinesTotal;
  return { consultationFee: CONSULTATION_FEE, medicinesTotal, total };
}

/**
 * Builds a standard `upi://pay` deep link (the format GPay/PhonePe/Paytm all
 * recognize when scanned) and renders it as a QR code PNG data URL.
 */
async function generateUpiQr({ amount, note }) {
  const params = new URLSearchParams({
    pa: UPI_ID, // payee VPA
    pn: UPI_PAYEE_NAME, // payee name
    am: amount.toFixed(2), // amount
    cu: 'INR',
    tn: note || 'ATM consultation payment', // transaction note
  });
  const upiUri = `upi://pay?${params.toString()}`;
  const dataUrl = await QRCode.toDataURL(upiUri, { width: 260, margin: 1 });
  return dataUrl;
}

module.exports = { computeFee, generateUpiQr, CONSULTATION_FEE };
