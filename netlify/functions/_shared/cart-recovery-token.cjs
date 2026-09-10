'use strict';

const crypto = require('crypto');

const RECOVERY_CONTEXT = 'bof-cart-recovery-v1';
const UNSUBSCRIBE_CONTEXT = 'bof-recovery-unsubscribe-v1';
const DEFAULT_RECOVERY_TTL_SECONDS = 96 * 60 * 60;
const DEFAULT_UNSUBSCRIBE_TTL_SECONDS = 365 * 24 * 60 * 60;

function configuredSecret(env = process.env) {
  return String(
    env.RECOVERY_EMAIL_TOKEN_SECRET
      || env.AUTH_SESSION_SECRET
      || env.CLOUDINARY_API_SECRET
      || '',
  ).trim();
}

function requireSecret(options = {}) {
  const secret = String(options.secret || configuredSecret(options.env)).trim();
  if (!secret) throw new Error('RECOVERY_EMAIL_TOKEN_SECRET is not configured');
  return secret;
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function nowSeconds(options = {}) {
  return Number.isFinite(options.nowSeconds)
    ? Math.floor(options.nowSeconds)
    : Math.floor(Date.now() / 1000);
}

function sign(value, secret, context) {
  return crypto.createHmac('sha256', secret).update(`${context}\0${value}`).digest('base64url');
}

function safeEqual(left, right) {
  try {
    const a = Buffer.from(String(left || ''), 'base64url');
    const b = Buffer.from(String(right || ''), 'base64url');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function createCartRecoveryToken(claims, options = {}) {
  const cartId = String(claims?.cartId || '').trim();
  const sequenceNumber = Number(claims?.sequenceNumber);
  if (!/^[0-9a-f-]{16,64}$/i.test(cartId)) throw new Error('A valid cart ID is required');
  if (![1, 2, 3].includes(sequenceNumber)) throw new Error('A valid recovery sequence is required');

  const issuedAt = nowSeconds(options);
  const expiresAt = Number.isFinite(options.expiresAtSeconds)
    ? Math.floor(options.expiresAtSeconds)
    : issuedAt + (Number(options.ttlSeconds) || DEFAULT_RECOVERY_TTL_SECONDS);
  const payload = Buffer.from(JSON.stringify({
    typ: 'cart_recovery',
    cartId,
    sequenceNumber,
    iat: issuedAt,
    exp: expiresAt,
  })).toString('base64url');
  const signature = sign(payload, requireSecret(options), RECOVERY_CONTEXT);
  return `r1.${payload}.${signature}`;
}

function verifyCartRecoveryToken(token, options = {}) {
  const [version, payload, signature, extra] = String(token || '').split('.');
  if (version !== 'r1' || !payload || !signature || extra) return null;

  let secret;
  try { secret = requireSecret(options); } catch { return null; }
  if (!safeEqual(signature, sign(payload, secret, RECOVERY_CONTEXT))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims?.typ !== 'cart_recovery') return null;
    if (!/^[0-9a-f-]{16,64}$/i.test(String(claims.cartId || ''))) return null;
    if (![1, 2, 3].includes(Number(claims.sequenceNumber))) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds(options)) return null;
    return {
      cartId: claims.cartId,
      sequenceNumber: Number(claims.sequenceNumber),
      expiresAt: Number(claims.exp),
    };
  } catch {
    return null;
  }
}

function encryptionKey(secret) {
  return crypto.createHash('sha256').update(`${UNSUBSCRIBE_CONTEXT}\0encryption\0${secret}`).digest();
}

function createRecoveryUnsubscribeToken(emailValue, options = {}) {
  const email = normalizeEmail(emailValue);
  if (!email) throw new Error('A valid email address is required');
  const secret = requireSecret(options);
  const issuedAt = nowSeconds(options);
  const expiresAt = Number.isFinite(options.expiresAtSeconds)
    ? Math.floor(options.expiresAtSeconds)
    : issuedAt + (Number(options.ttlSeconds) || DEFAULT_UNSUBSCRIBE_TTL_SECONDS);
  const plaintext = Buffer.from(JSON.stringify({
    typ: 'recovery_unsubscribe',
    email,
    iat: issuedAt,
    exp: expiresAt,
  }));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(UNSUBSCRIBE_CONTEXT));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const authenticated = [
    'u1',
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
  return `${authenticated}.${sign(authenticated, secret, UNSUBSCRIBE_CONTEXT)}`;
}

function verifyRecoveryUnsubscribeToken(token, options = {}) {
  const [version, encodedIv, encodedCiphertext, encodedTag, signature, extra] = String(token || '').split('.');
  if (version !== 'u1' || !encodedIv || !encodedCiphertext || !encodedTag || !signature || extra) return null;

  let secret;
  try { secret = requireSecret(options); } catch { return null; }
  const authenticated = [version, encodedIv, encodedCiphertext, encodedTag].join('.');
  if (!safeEqual(signature, sign(authenticated, secret, UNSUBSCRIBE_CONTEXT))) return null;

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(secret),
      Buffer.from(encodedIv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(UNSUBSCRIBE_CONTEXT));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]);
    const claims = JSON.parse(plaintext.toString('utf8'));
    const email = normalizeEmail(claims?.email);
    if (claims?.typ !== 'recovery_unsubscribe' || !email) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds(options)) return null;
    return { email, expiresAt: Number(claims.exp) };
  } catch {
    return null;
  }
}

module.exports = {
  configuredSecret,
  createCartRecoveryToken,
  createRecoveryUnsubscribeToken,
  normalizeEmail,
  verifyCartRecoveryToken,
  verifyRecoveryUnsubscribeToken,
};
