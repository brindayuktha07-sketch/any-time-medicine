const { httpRequest } = require('./http');

// WhatsApp messages are sent straight from this app through Twilio's WhatsApp API
// (no n8n or any other middle step). Set these environment variables:
//   TWILIO_ACCOUNT_SID     from your Twilio console
//   TWILIO_AUTH_TOKEN      from your Twilio console
//   TWILIO_WHATSAPP_FROM   optional; defaults to Twilio's shared sandbox number
//                          (whatsapp:+14155238886). With the sandbox, every person who
//                          should receive messages must first WhatsApp the sandbox
//                          number the "join <your-code>" phrase shown in the console.
//   DEFAULT_COUNTRY_CODE   optional; defaults to 91 (India) for numbers typed without one
//
// If SID/token aren't set, messages are just logged to the console ("demo mode") so
// the rest of the app keeps working while you're testing.

function isConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

// "9876543210" -> "+919876543210"; "+14155550123" stays as is.
function toE164(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return `+${digits}`;
  const cc = (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '') || '91';
  if (digits.length === 10) return `+${cc}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+${cc}${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * Sends a WhatsApp text message. Never throws — resolves { ok: true } or { ok: false, error }.
 */
async function sendWhatsApp(toPhone, message) {
  if (!isConfigured()) {
    console.log(`\n[WHATSAPP - DEMO MODE, not actually sent] to=${toPhone}\n${message}\n`);
    return { ok: true, demo: true };
  }

  const to = toE164(toPhone);
  if (!to) return { ok: false, error: 'Invalid phone number.' };

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  const from = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;
  const base = process.env.TWILIO_API_BASE || 'https://api.twilio.com';

  try {
    const { status, body } = await httpRequest(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: new URLSearchParams({ From: from, To: `whatsapp:${to}`, Body: message }).toString(),
    });

    if (status >= 200 && status < 300) return { ok: true };
    console.error(`[whatsapp] send to ${to} failed (HTTP ${status}): ${body}`);
    return { ok: false, error: body };
  } catch (err) {
    console.error(`[whatsapp] request failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendWhatsApp, toE164, isConfigured };
