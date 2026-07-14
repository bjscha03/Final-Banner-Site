const crypto = require('crypto');

const COOKIE_NAME = 'botf_admin_session';

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

function sign(payload) {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function readAdminSessionCookie(event) {
  const cookieHeader = event?.headers?.cookie || event?.headers?.Cookie || '';
  const match = String(cookieHeader).split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null;
}

function createAdminSession(claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    role: 'admin',
    issuedAt: now,
    expiresAt: now + (8 * 60 * 60),
    ...claims,
  }));
  const signature = sign(payload);
  if (!signature) throw new Error('ADMIN_SESSION_NOT_CONFIGURED');
  return `${payload}.${signature}`;
}

function verifyAdminSessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'missing' };
  }
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  if (!expected) return { valid: false, reason: 'not_configured' };
  const actualBuffer = Buffer.from(signature || '');
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { valid: false, reason: 'bad_signature' };
  }
  try {
    const claims = JSON.parse(base64UrlDecode(payload));
    if (claims.role !== 'admin') return { valid: false, reason: 'bad_role' };
    if (!claims.expiresAt || claims.expiresAt < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'expired', claims };
    }
    return { valid: true, claims };
  } catch {
    return { valid: false, reason: 'bad_payload' };
  }
}

function verifyAdminSession(event) {
  return verifyAdminSessionToken(readAdminSessionCookie(event));
}

function createAdminSessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`;
}

module.exports = {
  COOKIE_NAME,
  createAdminSession,
  createAdminSessionCookie,
  readAdminSessionCookie,
  verifyAdminSession,
  verifyAdminSessionToken,
};
