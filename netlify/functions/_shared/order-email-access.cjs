const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 90 * 24 * 60 * 60;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getSigningSecret() {
  return process.env.AUTH_SESSION_SECRET
    || process.env.INTERNAL_JOB_SECRET
    || process.env.RESEND_ORDER_EMAIL_SECRET
    || null;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function emailHash(email) {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createOrderAccessToken(orderId, email, options = {}) {
  const secret = options.secret || getSigningSecret();
  const normalizedOrderId = String(orderId || '').trim();
  const normalizedEmail = normalizeEmail(email);
  if (!secret || !normalizedOrderId || !normalizedEmail) return null;

  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const ttlSeconds = Number.isFinite(Number(options.ttlSeconds))
    ? Math.max(60, Number(options.ttlSeconds))
    : DEFAULT_TTL_SECONDS;
  const payload = {
    v: 1,
    oid: normalizedOrderId,
    eh: emailHash(normalizedEmail),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyOrderAccessToken(token, orderId, email, options = {}) {
  try {
    const secret = options.secret || getSigningSecret();
    if (!secret || !token) return false;
    const [encodedPayload, suppliedSignature, extra] = String(token).split('.');
    if (!encodedPayload || !suppliedSignature || extra) return false;
    const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    if (!safeEqual(suppliedSignature, expectedSignature)) return false;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    if (payload?.v !== 1 || Number(payload?.exp) <= Math.floor(nowMs / 1000)) return false;
    if (!safeEqual(payload?.oid, String(orderId || '').trim())) return false;
    return safeEqual(payload?.eh, emailHash(email));
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  normalizeEmail,
  getSigningSecret,
  createOrderAccessToken,
  verifyOrderAccessToken,
};
