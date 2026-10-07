const { httpRequest } = require('./http');

// Email is sent through a small free Google Apps Script "relay" that mails from
// your own Gmail account (setup steps are in README.md, script is in
// email-relay/Code.gs). Why a relay and not plain SMTP: Render's free plan blocks
// the SMTP ports, and most email APIs only send to other people once you own and
// verify a domain.
//
// Set these two environment variables (on Render, or in your local .env):
//   EMAIL_RELAY_URL    the Apps Script web-app URL (ends in /exec)
//   EMAIL_RELAY_TOKEN  the same secret you put at the top of the Apps Script
// Optional: EMAIL_FROM_NAME (display name shown to the recipient).
//
// If they're not set, emails are just logged to the console ("demo mode") so the
// rest of the app keeps working while you're testing.

function isConfigured() {
  return !!(process.env.EMAIL_RELAY_URL && process.env.EMAIL_RELAY_TOKEN);
}

/**
 * Sends one email. Never throws — resolves { ok: true } or { ok: false, error }.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to) return { ok: false, error: 'No recipient email address.' };

  if (!isConfigured()) {
    console.log(`\n[EMAIL - DEMO MODE, not actually sent] to=${to}\nsubject: ${subject}\n${text || ''}\n`);
    return { ok: true, demo: true };
  }

  try {
    const { status, body } = await httpRequest(process.env.EMAIL_RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: process.env.EMAIL_RELAY_TOKEN,
        to,
        subject,
        text: text || '',
        html: html || '',
        fromName: process.env.EMAIL_FROM_NAME || 'ATM - Any Time Medicine',
      }),
    });

    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      /* not JSON — handled below */
    }

    if (status >= 200 && status < 300 && parsed && parsed.ok) return { ok: true };

    const reason = parsed && parsed.error ? parsed.error : `unexpected response (HTTP ${status})`;
    console.error(`[email relay] send to ${to} failed: ${reason}`);
    return { ok: false, error: reason };
  } catch (err) {
    console.error(`[email relay] request failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail, isConfigured };
