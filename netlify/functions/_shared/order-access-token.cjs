const crypto = require('crypto');

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getOrderAccessSecret() {
  return process.env.ORDER_ACCESS_SECRET
    || process.env.AUTH_SESSION_SECRET
    || process.env.RESEND_ORDER_EMAIL_SECRET
    || process.env.INTERNAL_JOB_SECRET
    || null;
}

function encodeSignature(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(orderId, expiresAt, secret) {
  return encodeSignature(
    crypto
      .createHmac('sha256', secret)
      .update(`${String(orderId)}.${String(expiresAt)}`)
      .digest(),
  );
}

function createOrderAccessToken(orderId, ttlMs = DEFAULT_TTL_MS) {
  const normalizedOrderId = String(orderId || '').trim();
  const secret = getOrderAccessSecret();
  if (!normalizedOrderId || !secret) return null;

  const expiresAt = Date.now() + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
  return `${expiresAt}.${sign(normalizedOrderId, expiresAt, secret)}`;
}

function verifyOrderAccessToken(orderId, token) {
  const normalizedOrderId = String(orderId || '').trim();
  const normalizedToken = String(token || '').trim();
  const secret = getOrderAccessSecret();
  if (!normalizedOrderId || !normalizedToken || !secret) return false;

  const separator = normalizedToken.indexOf('.');
  if (separator <= 0) return false;

  const expiresAtRaw = normalizedToken.slice(0, separator);
  const suppliedSignature = normalizedToken.slice(separator + 1);
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !suppliedSignature) return false;

  const expectedSignature = sign(normalizedOrderId, expiresAtRaw, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function buildOrderAccessUrl(origin, orderId, ttlMs = DEFAULT_TTL_MS) {
  const normalizedOrigin = String(origin || 'https://bannersonthefly.com').replace(/\/$/, '');
  const normalizedOrderId = String(orderId || '').trim();
  const token = createOrderAccessToken(normalizedOrderId, ttlMs);
  const baseUrl = `${normalizedOrigin}/orders/${encodeURIComponent(normalizedOrderId)}`;
  return token ? `${baseUrl}?access=${encodeURIComponent(token)}` : baseUrl;
}

module.exports = {
  DEFAULT_TTL_MS,
  buildOrderAccessUrl,
  createOrderAccessToken,
  verifyOrderAccessToken,
};
