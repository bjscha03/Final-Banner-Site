import crypto from 'node:crypto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const DEFAULT_SITE_ORIGIN = 'https://bannersonthefly.com';

export function normalizeComplianceEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function generateUnsubscribeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashUnsubscribeToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function validUnsubscribeToken(token) {
  return TOKEN_PATTERN.test(String(token || ''));
}

export function publicSiteOrigin(env = process.env) {
  const candidate = String(env.PUBLIC_SITE_URL || '').trim();
  if (!candidate) return DEFAULT_SITE_ORIGIN;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.origin : DEFAULT_SITE_ORIGIN;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function buildTradeShowUnsubscribeUrl(token, env = process.env) {
  if (!validUnsubscribeToken(token)) throw new Error('A valid unsubscribe token is required.');
  return `${publicSiteOrigin(env)}/.netlify/functions/trade-show-unsubscribe?token=${encodeURIComponent(token)}`;
}

export function requestUnsubscribeToken(event) {
  const queryToken = event?.queryStringParameters?.token;
  if (queryToken) return String(queryToken);
  try {
    if (String(event?.headers?.['content-type'] || '').toLowerCase().includes('application/json')) {
      return String(JSON.parse(event.body || '{}').token || '');
    }
  } catch {
    return '';
  }
  return '';
}

export function isOneClickUnsubscribe(event) {
  return event?.httpMethod === 'POST'
    && String(event.body || '').includes('List-Unsubscribe=One-Click');
}

export function compliancePage(statusCode, title, message, showConfirmation = false) {
  const form = showConfirmation
    ? '<form method="post"><button type="submit">Confirm unsubscribe</button></form>'
    : '';
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;padding:32px 16px;background:#eef3f8;color:#172033;font-family:Arial,sans-serif}main{max-width:560px;margin:40px auto;background:#fff;border-radius:18px;padding:32px;box-shadow:0 10px 35px rgba(15,45,92,.14);border-top:5px solid #ff6a00}h1{margin:0 0 14px;color:#18448d;font-size:28px}p{line-height:1.65}button{margin-top:10px;border:0;border-radius:9px;background:#ff6a00;color:#fff;padding:13px 20px;font-size:15px;font-weight:800;cursor:pointer}</style></head><body><main><h1>${title}</h1><p>${message}</p>${form}</main></body></html>`,
  };
}

export const _test = { TOKEN_PATTERN, DEFAULT_SITE_ORIGIN };
