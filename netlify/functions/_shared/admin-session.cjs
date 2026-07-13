const crypto = require('crypto');

const ADMIN_SESSION_COOKIE = 'botf_admin_session';
const DEFAULT_MAX_AGE_SECONDS = 8 * 60 * 60;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function unbase64url(input) {
  return Buffer.from(String(input || ''), 'base64url').toString('utf8');
}

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

function signPayload(encodedPayload, secret = getSecret()) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
}

function createAdminSession({ profileId = null, email = null, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS } = {}) {
  const secret = getSecret();
  if (!secret) {
    const err = new Error('ADMIN_SESSION_SECRET is not configured');
    err.code = 'ADMIN_SESSION_NOT_CONFIGURED';
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role: 'admin',
    profileId: profileId || null,
    email: email ? String(email).trim().toLowerCase() : null,
    issuedAt: now,
    expiresAt: now + maxAgeSeconds,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  const token = `${encodedPayload}.${signature}`;
  const cookie = serializeCookie(ADMIN_SESSION_COOKIE, token, {
    maxAge: maxAgeSeconds,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  });
  return { token, cookie, claims: payload };
}

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return acc;
      acc[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
      return acc;
    }, {});
}

function readAdminSessionCookie(eventOrCookieHeader) {
  const cookieHeader = typeof eventOrCookieHeader === 'string'
    ? eventOrCookieHeader
    : (eventOrCookieHeader?.headers?.cookie || eventOrCookieHeader?.headers?.Cookie || '');
  return parseCookies(cookieHeader)[ADMIN_SESSION_COOKIE] || null;
}

function verifyAdminSession(tokenOrEvent) {
  const secret = getSecret();
  const token = typeof tokenOrEvent === 'string' && tokenOrEvent.includes('.') && !tokenOrEvent.includes('=')
    ? tokenOrEvent
    : readAdminSessionCookie(tokenOrEvent);

  const result = {
    present: !!token,
    valid: false,
    expired: false,
    configured: !!secret,
    claims: null,
    reason: null,
  };

  if (!secret) {
    result.reason = 'ADMIN_SESSION_NOT_CONFIGURED';
    return result;
  }
  if (!token) {
    result.reason = 'ADMIN_SESSION_MISSING';
    return result;
  }

  const [encodedPayload, signature, extra] = String(token).split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    result.reason = 'ADMIN_SESSION_MALFORMED';
    return result;
  }

  const expected = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expected)) {
    result.reason = 'ADMIN_SESSION_BAD_SIGNATURE';
    return result;
  }

  let claims;
  try {
    claims = JSON.parse(unbase64url(encodedPayload));
  } catch (_err) {
    result.reason = 'ADMIN_SESSION_BAD_PAYLOAD';
    return result;
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.role !== 'admin') {
    result.reason = 'ADMIN_SESSION_ROLE_INVALID';
    return result;
  }
  if (!claims.expiresAt || Number(claims.expiresAt) <= now) {
    result.expired = true;
    result.reason = 'ADMIN_SESSION_EXPIRED';
    return result;
  }

  result.valid = true;
  result.claims = claims;
  return result;
}

function clearAdminSessionCookie() {
  return serializeCookie(ADMIN_SESSION_COOKIE, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  });
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  DEFAULT_MAX_AGE_SECONDS,
  createAdminSession,
  verifyAdminSession,
  readAdminSessionCookie,
  clearAdminSessionCookie,
};
