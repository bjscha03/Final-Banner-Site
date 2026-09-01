'use strict';

const crypto = require('node:crypto');

const TOKEN_VERSION = 1;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
const MAX_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 2048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class RecoveryTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RecoveryTokenError';
    this.code = code;
  }
}

function resolveRecoverySecret(env = process.env) {
  const candidates = [
    env.ABANDONED_CART_RECOVERY_SECRET,
    env.AUTH_SESSION_SECRET,
    env.CLOUDINARY_API_SECRET,
  ];
  const secret = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return secret ? secret.trim() : null;
}

function requireRecoverySecret(secret) {
  const resolved = typeof secret === 'string' && secret.trim()
    ? secret.trim()
    : resolveRecoverySecret();
  if (!resolved) {
    throw new RecoveryTokenError(
      'RECOVERY_SECRET_UNAVAILABLE',
      'Abandoned-cart recovery signing is not configured',
    );
  }
  return resolved;
}

function epochSeconds(value, fallbackMs = Date.now()) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value > 10_000_000_000 ? value / 1000 : value);
  }
  return Math.floor(fallbackMs / 1000);
}

function validateClaims({ cartId, sequenceNumber, expiresAt }) {
  if (!UUID_PATTERN.test(String(cartId || ''))) {
    throw new RecoveryTokenError('INVALID_RECOVERY_CLAIMS', 'A valid cart id is required');
  }
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1 || sequenceNumber > 3) {
    throw new RecoveryTokenError('INVALID_RECOVERY_CLAIMS', 'Email sequence must be 1, 2, or 3');
  }
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
    throw new RecoveryTokenError('INVALID_RECOVERY_CLAIMS', 'A valid expiry is required');
  }
}

function signatureFor(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest();
}

function createAbandonedCartRecoveryToken({
  cartId,
  sequenceNumber,
  expiresAt,
  expiresInSeconds = DEFAULT_TOKEN_LIFETIME_SECONDS,
  now = Date.now(),
  secret,
}) {
  const nowSeconds = epochSeconds(now);
  const requestedExpiry = expiresAt == null
    ? nowSeconds + Math.floor(expiresInSeconds)
    : epochSeconds(expiresAt);

  validateClaims({ cartId, sequenceNumber, expiresAt: requestedExpiry });
  if (requestedExpiry <= nowSeconds) {
    throw new RecoveryTokenError('INVALID_RECOVERY_CLAIMS', 'Recovery token must expire in the future');
  }
  if (requestedExpiry - nowSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new RecoveryTokenError('INVALID_RECOVERY_CLAIMS', 'Recovery token lifetime is too long');
  }

  const payload = {
    v: TOKEN_VERSION,
    c: String(cartId).toLowerCase(),
    s: sequenceNumber,
    exp: requestedExpiry,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signatureFor(encodedPayload, requireRecoverySecret(secret)).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyAbandonedCartRecoveryToken(token, { now = Date.now(), secret } = {}) {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new RecoveryTokenError('INVALID_RECOVERY_TOKEN', 'Recovery token is invalid');
  }

  const parts = token.split('.');
  if (
    parts.length !== 2
    || !parts[0]
    || !parts[1]
    || !/^[A-Za-z0-9_-]+$/.test(parts[0])
    || !/^[A-Za-z0-9_-]+$/.test(parts[1])
  ) {
    throw new RecoveryTokenError('INVALID_RECOVERY_TOKEN', 'Recovery token is invalid');
  }

  const signingSecret = requireRecoverySecret(secret);
  const expectedSignature = signatureFor(parts[0], signingSecret);
  let suppliedSignature;
  try {
    suppliedSignature = Buffer.from(parts[1], 'base64url');
  } catch {
    throw new RecoveryTokenError('INVALID_RECOVERY_TOKEN', 'Recovery token is invalid');
  }
  if (
    suppliedSignature.length !== expectedSignature.length
    || !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new RecoveryTokenError('INVALID_RECOVERY_TOKEN', 'Recovery token is invalid');
  }

  let rawPayload;
  try {
    rawPayload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new RecoveryTokenError('INVALID_RECOVERY_TOKEN', 'Recovery token is invalid');
  }

  if (
    !rawPayload
    || rawPayload.v !== TOKEN_VERSION
    || Object.keys(rawPayload).some((key) => !['v', 'c', 's', 'exp'].includes(key))
  ) {
    throw new RecoveryTokenError('INVALID_RECOVERY_TOKEN', 'Recovery token is invalid');
  }

  validateClaims({
    cartId: rawPayload.c,
    sequenceNumber: rawPayload.s,
    expiresAt: rawPayload.exp,
  });

  const nowSeconds = epochSeconds(now);
  if (rawPayload.exp <= nowSeconds) {
    throw new RecoveryTokenError('RECOVERY_TOKEN_EXPIRED', 'Recovery token has expired');
  }
  if (rawPayload.exp - nowSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new RecoveryTokenError('INVALID_RECOVERY_TOKEN', 'Recovery token is invalid');
  }

  return {
    cartId: rawPayload.c,
    sequenceNumber: rawPayload.s,
    expiresAt: rawPayload.exp,
  };
}

module.exports = {
  DEFAULT_TOKEN_LIFETIME_SECONDS,
  MAX_TOKEN_LIFETIME_SECONDS,
  MAX_TOKEN_LENGTH,
  RecoveryTokenError,
  createAbandonedCartRecoveryToken,
  resolveRecoverySecret,
  verifyAbandonedCartRecoveryToken,
};
