const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Tiny HTTP(S) client used by the email and WhatsApp senders (no extra npm packages).
 * Resolves with { status, body } and rejects only on network errors / timeouts.
 * Redirects are followed with a plain GET — Google Apps Script web apps answer a
 * POST with a 302 to the page that holds the result.
 */
function httpRequest(urlString, { method = 'GET', headers = {}, body = null, timeoutMs = 15000, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${urlString}`));
    }

    const lib = url.protocol === 'http:' ? http : https;
    const payload = body == null ? null : Buffer.from(body);
    const reqHeaders = { ...headers };
    if (payload) reqHeaders['Content-Length'] = payload.length;

    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const status = res.statusCode;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && maxRedirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          // Headers (e.g. Authorization) are deliberately not forwarded to the redirect target.
          resolve(httpRequest(next, { method: 'GET', headers: {}, timeoutMs, maxRedirects: maxRedirects - 1 }));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status, body: data }));
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { httpRequest };
