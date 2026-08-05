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
      'Vary': 'Authorization, X-Banners-Admin-Session, Cookie, Origin',
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

function allowedOrigins(event) {
  const proto = String(event?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const hosts = [event?.headers?.host, event?.headers?.['x-forwarded-host']]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = new Set(hosts.map((host) => `${proto}://${host}`));
  for (const candidate of [event?.rawUrl, process.env.URL, process.env.DEPLOY_URL, process.env.DEPLOY_PRIME_URL]) {
    try {
      if (candidate) origins.add(new URL(String(candidate)).origin);
    } catch {
      // Ignore malformed platform metadata.
    }
  }
  return origins;
}

function enforceSameOrigin(event, { requireOrigin = true } = {}) {
  const origin = String(event?.headers?.origin || '').trim();
  if (!origin && !requireOrigin) return null;
  let previewOriginAllowed = false;
  try {
    const siteName = String(process.env.SITE_NAME || '').trim().toLowerCase();
    const originUrl = new URL(origin);
    previewOriginAllowed = Boolean(
      siteName
      && originUrl.protocol === 'https:'
      && (
        originUrl.hostname === `${siteName}.netlify.app`
        || originUrl.hostname.endsWith(`--${siteName}.netlify.app`)
      )
    );
  } catch {
    previewOriginAllowed = false;
  }
  if (!origin || (!allowedOrigins(event).has(origin) && !previewOriginAllowed)) {
    return json(403, { error: 'FORBIDDEN_ORIGIN', message: 'This request must come from the same site.' });
  }
  return null;
}

function authorize(event, options = {}) {
  const auth = requireAdmin(event);
  if (!auth.ok) return { response: auth.response };
  if (!options.skipOrigin) {
    const originError = enforceSameOrigin(event, options);
    if (originError) return { response: originError };
  }
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
      : code === 'PROVIDER_USER_ERROR' ? 400
      : code === 'PROVIDER_TIMEOUT' ? 504
        : code === 'PROVIDER_UNAVAILABLE' ? 503
          : code === 'PROVIDER_BILLING_REQUIRED' ? 503
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
    PROVIDER_USER_ERROR: error.message,
    PROVIDER_TIMEOUT: 'The OpenAI request timed out safely. Please retry.',
    PROVIDER_UNAVAILABLE: 'OpenAI is temporarily unavailable. Please retry in a moment.',
    PROVIDER_BILLING_REQUIRED: 'The OpenAI API project has reached its spending limit or has no available credits.',
    PROVIDER_EMPTY_RESPONSE: 'OpenAI completed the request but returned no image. Please retry once.',
    PROVIDER_REQUEST_FAILED: 'The OpenAI image request failed before an image was returned. Please retry.',
    AI_PIPELINE_FAILED: error.pipelineStage
      ? `The AI job failed while ${String(error.pipelineStage).toLowerCase()}. Please retry.`
      : 'The AI artwork pipeline could not finish safely. Please retry.',
    VALIDATION_FAILED: 'The artwork did not pass print-readiness validation.',
  };
  return json(statusCode, { error: code, message: safeMessages[code] || 'The AI request could not be completed safely. Please retry.' });
}

function safeErrorPayload(error) {
  const response = safeError(error);
  try {
    return { statusCode: response.statusCode, ...JSON.parse(response.body) };
  } catch {
    return { statusCode: 500, error: 'AI_REQUEST_FAILED', message: 'The AI request could not be completed safely. Please retry.' };
  }
}

module.exports = {
  json,
  authorize,
  enforceBodyLimit,
  rateLimit,
  idempotencyKey,
  runIdempotent,
  safeError,
  safeErrorPayload,
};
