// Subject / plain-text / HTML bodies for the emails the app sends.

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(n) {
  return `₹${(Number(n) || 0).toFixed(2)}`;
}

function wrap(innerHtml) {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">` +
    `<h2 style="margin:0 0 16px;color:#0b8f7a;">ATM &ndash; Any Time Medicine</h2>` +
    innerHtml +
    `</div>`
  );
}

function otpEmail(otp, minutes = 5) {
  const subject = 'Your ATM verification code';
  const text = `Your ATM verification code is ${otp}. It expires in ${minutes} minutes. If you did not request this, you can ignore this email.`;
  const html = wrap(
    `<p style="margin:0 0 12px;">Use this code to verify yourself:</p>` +
      `<p style="font-size:34px;letter-spacing:8px;font-weight:bold;margin:8px 0 16px;">${escapeHtml(otp)}</p>` +
      `<p style="margin:0;color:#555;">It expires in ${minutes} minutes. If you did not request this, you can ignore this email.</p>`
  );
  return { subject, text, html };
}

/**
 * d: { patientName, doctorName, symptoms, medicines: [{name, dosage, price}], fee: {consultationFee, medicinesTotal, total}, date, consultationId }
 */
function receiptEmail(d) {
  const medicines = Array.isArray(d.medicines) ? d.medicines : [];
  const fee = d.fee || {};
  const when = d.date
    ? new Date(d.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
    : '';

  const subject = 'Your ATM prescription & receipt';

  const textLines = [
    `Hi ${d.patientName || ''}, your ATM consultation is complete.`,
    when ? `Date: ${when}` : null,
    `Doctor: ${d.doctorName || 'N/A'}`,
    `Symptoms: ${d.symptoms || '-'}`,
    '',
    'Prescription:',
    ...(medicines.length
      ? medicines.map((m) => `- ${m.name}${m.dosage ? ` (${m.dosage})` : ''} - ${money(m.price)}`)
      : ['- No medicines prescribed']),
    '',
    `Consultation fee: ${money(fee.consultationFee)}`,
    `Medicines: ${money(fee.medicinesTotal)}`,
    `Total paid: ${money(fee.total)}`,
  ].filter((l) => l !== null);
  const text = textLines.join('\n');

  const rows = medicines.length
    ? medicines
        .map(
          (m) =>
            `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(m.name)}</td>` +
            `<td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(m.dosage || '')}</td>` +
            `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${money(m.price)}</td></tr>`
        )
        .join('')
    : `<tr><td colspan="3" style="padding:6px 8px;color:#777;">No medicines prescribed</td></tr>`;

  const html = wrap(
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(d.patientName || '')}, your consultation is complete. Here is your prescription and receipt.</p>` +
      `<p style="margin:0 0 4px;"><strong>Doctor:</strong> ${escapeHtml(d.doctorName || 'N/A')}</p>` +
      (when ? `<p style="margin:0 0 4px;"><strong>Date:</strong> ${escapeHtml(when)}</p>` : '') +
      `<p style="margin:0 0 16px;"><strong>Symptoms:</strong> ${escapeHtml(d.symptoms || '-')}</p>` +
      `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">` +
      `<tr style="background:#f3f7f6;"><th style="text-align:left;padding:6px 8px;">Medicine</th><th style="text-align:left;padding:6px 8px;">Dosage</th><th style="text-align:right;padding:6px 8px;">Price</th></tr>` +
      rows +
      `</table>` +
      `<p style="margin:0 0 4px;">Consultation fee: ${money(fee.consultationFee)}</p>` +
      `<p style="margin:0 0 4px;">Medicines: ${money(fee.medicinesTotal)}</p>` +
      `<p style="margin:8px 0 0;font-size:16px;"><strong>Total paid: ${money(fee.total)}</strong></p>` +
      (d.consultationId ? `<p style="margin:16px 0 0;color:#888;font-size:12px;">Reference: ${escapeHtml(d.consultationId)}</p>` : '')
  );

  return { subject, text, html };
}

module.exports = { otpEmail, receiptEmail, escapeHtml };
