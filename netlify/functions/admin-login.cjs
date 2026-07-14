const crypto = require('crypto');
const { createAdminSession, createAdminSessionCookie } = require('./_shared/admin-session.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyPassword(password) {
  const hash = process.env.ADMIN_PANEL_PASSWORD_HASH || '';
  if (!hash) return { ok: false, reason: 'missing_hash' };
  if (hash.includes(':')) {
    const [salt, expected] = hash.split(':');
    const actual = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return { ok: timingSafeEqualText(actual, expected), reason: 'hash' };
  }
  return { ok: timingSafeEqualText(password, hash), reason: 'plain' };
}

function isAllowlisted(email) {
  const raw = process.env.ADMIN_TEST_PAY_ALLOWLIST || '';
  const normalized = String(email || '').trim().toLowerCase();
  return Boolean(normalized) && raw.split(',').map((entry) => entry.trim().toLowerCase()).includes(normalized);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  if (!process.env.ADMIN_SESSION_SECRET || !process.env.ADMIN_PANEL_PASSWORD_HASH) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'ADMIN_SESSION_NOT_CONFIGURED',
        message: 'Server-side admin authentication is not configured for this deployment.',
      }),
    };
  }

  const body = JSON.parse(event.body || '{}');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const passwordResult = verifyPassword(password);

  if (!email || !passwordResult.ok || !isAllowlisted(email)) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Invalid admin credentials' }) };
  }

  const token = createAdminSession({ email });
  return {
    statusCode: 200,
    headers: {
      ...headers,
      'Set-Cookie': createAdminSessionCookie(token),
    },
    body: JSON.stringify({ ok: true, authenticated: true, isAdmin: true, source: 'signed_admin_session' }),
  };
};
