'use strict';

const crypto = require('crypto');
const { requireAdmin } = require('../server-auth.cjs');

const buckets = new Map();
const inFlight = new Map();

function json(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Authorization, Origin',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function clientIp(event) {
  return String(event?.headers?.['x-nf-client-connection-ip'] || event?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
}

function expectedOrigin(event) {
  const host = String(event?.headers?.['x-forwarded-host'] || event?.headers?.host || '').trim();
  const proto = String(event?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function enforceSameOrigin(event, { requireOrigin = true } = {}) {
  const origin = String(event?.headers?.origin || '').trim();
  const expected = expectedOrigin(event);
  if (!origin && !requireOrigin) return null;
  if (!origin || !expected || origin !== expected) {
    return json(403, { error: 'FORBIDDEN_ORIGIN', message: 'This request must come from the same site.' });
  }
  return null;
}

function authorize(event, options = {}) {
  const auth = requireAdmin(event);
  if (!auth.ok) return { response: auth.response };
  const originError = enforceSameOrigin(event, options);
  if (originError) return { response: originError };
  return { session: auth.session };
}

function enforceBodyLimit(event, maxBytes) {
  const size = Buffer.byteLength(String(event?.body || ''), 'utf8');
  return size <= maxBytes
    ? null
    : json(413, { error: 'REQUEST_TOO_LARGE', message: 'The supplied image or request is too large.' });
}

function rateLimit(event, session, action, limit, windowMs) {
  const now = Date.now();
  const key = `${session.sub || session.email || 'admin'}:${clientIp(event)}:${action}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return json(429, { error: 'RATE_LIMITED', message: 'AI request limit reached. Please wait and retry.' }, { 'Retry-After': String(retryAfter) });
  }
  bucket.count += 1;
  return null;
}

function idempotencyKey(event, body, session, action = 'request') {
  const supplied = String(event?.headers?.['x-idempotency-key'] || body?.idempotencyKey || '').trim();
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(supplied)) {
    const error = new Error('A valid idempotency key is required.');
    error.code = 'IDEMPOTENCY_KEY_REQUIRED';
    throw error;
  }
  return crypto.createHash('sha256').update(`${session.sub}:${action}:${supplied}`).digest('hex');
}

async function runIdempotent(key, task) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = Promise.resolve().then(task).finally(() => {
    setTimeout(() => inFlight.delete(key), 5 * 60 * 1000).unref?.();
  });
  inFlight.set(key, promise);
  return promise;
}

function safeError(error) {
  const code = String(error?.code || 'AI_REQUEST_FAILED');
  const statusCode = ['INVALID_REQUEST', 'INVALID_DIMENSIONS', 'DESCRIPTION_REQUIRED', 'INVALID_IMAGE', 'IDEMPOTENCY_KEY_REQUIRED'].includes(code) ? 400
    : code === 'PROVIDER_RATE_LIMITED' ? 429
      : code === 'PROVIDER_TIMEOUT' ? 504
        : code === 'MODEL_ACCESS_DENIED' || code === 'AI_NOT_CONFIGURED' || code === 'UNAPPROVED_IMAGE_MODEL' ? 503
      : code === 'VALIDATION_FAILED' ? 422
        : 500;
  const safeMessages = {
    INVALID_REQUEST: error.message,
    INVALID_DIMENSIONS: error.message,
    DESCRIPTION_REQUIRED: error.message,
    INVALID_IMAGE: 'The supplied image must be a valid PNG, JPEG, or WebP file within the size limit.',
    IDEMPOTENCY_KEY_REQUIRED: error.message,
    MODEL_ACCESS_DENIED: 'GPT Image 2 is not available to the configured OpenAI project.',
    AI_NOT_CONFIGURED: 'The AI designer is not configured for this deployment.',
    UNAPPROVED_IMAGE_MODEL: 'The configured provider is not an approved GPT Image 2 model.',
    PROVIDER_RATE_LIMITED: 'OpenAI is temporarily rate limited. Please wait and retry.',
    PROVIDER_TIMEOUT: 'The OpenAI request timed out safely. Please retry.',
    VALIDATION_FAILED: 'The artwork did not pass print-readiness validation.',
  };
  return json(statusCode, { error: code, message: safeMessages[code] || 'The AI request could not be completed safely. Please retry.' });
}

module.exports = {
  json,
  authorize,
  enforceBodyLimit,
  rateLimit,
  idempotencyKey,
  runIdempotent,
  safeError,
};
