// ATM email relay — paste this whole file into a new Google Apps Script project
// (script.google.com), set TOKEN below, then Deploy > New deployment > Web app:
//   Execute as: Me      Who has access: Anyone
// Copy the Web app URL into EMAIL_RELAY_URL, and put the same TOKEN into
// EMAIL_RELAY_TOKEN, in your Render environment variables.
//
// It sends mail from the Gmail account that owns this script. (Free Gmail accounts
// can send roughly 100 emails a day this way.)

const TOKEN = 'CHANGE-ME-TO-A-LONG-RANDOM-SECRET';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return reply({ ok: false, error: 'bad token' });
    if (!data.to || !data.subject) return reply({ ok: false, error: 'missing to/subject' });

    const options = { to: data.to, subject: data.subject, body: data.text || ' ' };
    if (data.html) options.htmlBody = data.html;
    if (data.fromName) options.name = data.fromName;

    MailApp.sendEmail(options);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
