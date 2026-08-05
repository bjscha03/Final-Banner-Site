'use strict';

const { requireAdmin } = require('../server-auth.cjs');

const SENSITIVE_KEY = /(secret|password|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;
const PUBLIC_ERROR_CODES = new Set([
  'INVALID_JSON',
  'INVALID_SETTINGS',
  'REQUEST_TOO_LARGE',
  'SETTINGS_CONFLICT',
  'LIVE_SENDING_PHASE_LOCKED',
  'OUTBOUND_SCHEMA_NOT_READY',
  'DATABASE_NOT_CONFIGURED',
]);

function redactSecretText(value) {
  return String(value)
    .replace(/\b(?:sk|rk)-[a-z0-9_-]{8,}/gi, '[REDACTED_API_KEY]')
    .replace(/\bre_[a-z0-9_-]{8,}/gi, '[REDACTED_API_KEY]')
    .replace(/\bBearer\s+[a-z0-9._~+/-]{8,}={0,2}/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@[^\s"'<>]+/gi, '[REDACTED_CREDENTIAL_URL]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\s*[:=]\s*)[^\s,;"']+/gi, '$1[REDACTED]');
}

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

function allowedOrigins(event) {
  const proto = String(event?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const hosts = [event?.headers?.host, event?.headers?.['x-forwarded-host']]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const result = new Set(hosts.map((host) => `${proto}://${host}`));
  for (const candidate of [event?.rawUrl, process.env.URL, process.env.DEPLOY_URL, process.env.DEPLOY_PRIME_URL]) {
    try {
      if (candidate) result.add(new URL(String(candidate)).origin);
    } catch {
      // Ignore malformed platform metadata.
    }
  }
  return result;
}

function sameOriginError(event) {
  const origin = String(event?.headers?.origin || '').trim();
  let approvedPreview = false;
  try {
    const siteName = String(process.env.SITE_NAME || '').trim().toLowerCase();
    const url = new URL(origin);
    approvedPreview = Boolean(
      siteName
      && url.protocol === 'https:'
      && (url.hostname === `${siteName}.netlify.app` || url.hostname.endsWith(`--${siteName}.netlify.app`)),
    );
  } catch {
    approvedPreview = false;
  }
  if (!origin || (!allowedOrigins(event).has(origin) && !approvedPreview)) {
    return json(403, { error: 'FORBIDDEN_ORIGIN', message: 'This request must come from the same site.' });
  }
  return null;
}

function authorize(event, { requireOrigin = false } = {}) {
  const auth = requireAdmin(event);
  if (!auth.ok) return { response: auth.response };
  if (requireOrigin) {
    const originError = sameOriginError(event);
    if (originError) return { response: originError };
  }
  return { session: auth.session };
}

function parseJsonBody(event, maxBytes = 16 * 1024) {
  const raw = String(event?.body || '');
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    const error = new Error('Request body is too large.');
    error.code = 'REQUEST_TOO_LARGE';
    throw error;
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function sanitizeForAudit(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return redactSecretText(value).slice(0, 2000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitizeForAudit(entry, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value).slice(0, 100)) {
      if (SENSITIVE_KEY.test(key)) continue;
      result[key] = sanitizeForAudit(entry, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 2000);
}

function safeFailure(error) {
  const candidateCode = String(error?.code || 'OUTBOUND_REQUEST_FAILED');
  const code = PUBLIC_ERROR_CODES.has(candidateCode) ? candidateCode : 'OUTBOUND_REQUEST_FAILED';
  const statusCode = code === 'INVALID_JSON' || code === 'INVALID_SETTINGS' ? 400
    : code === 'REQUEST_TOO_LARGE' ? 413
      : code === 'SETTINGS_CONFLICT' ? 409
        : code === 'LIVE_SENDING_PHASE_LOCKED' ? 409
          : code === 'OUTBOUND_SCHEMA_NOT_READY' || code === 'DATABASE_NOT_CONFIGURED' ? 503
            : 500;
  const messages = {
    INVALID_JSON: 'Request body must be valid JSON.',
    INVALID_SETTINGS: error.message,
    REQUEST_TOO_LARGE: 'Request body is too large.',
    SETTINGS_CONFLICT: 'Settings changed in another session. Refresh and try again.',
    LIVE_SENDING_PHASE_LOCKED: 'Live sending remains locked during the isolated foundation phase.',
    OUTBOUND_SCHEMA_NOT_READY: 'The outbound database migration has not been applied.',
    DATABASE_NOT_CONFIGURED: 'The outbound database connection is not configured.',
  };
  return json(statusCode, {
    ok: false,
    error: code,
    message: messages[code] || 'The outbound sales request could not be completed safely.',
  });
}

module.exports = {
  json,
  authorize,
  parseJsonBody,
  redactSecretText,
  sanitizeForAudit,
  safeFailure,
  sameOriginError,
};
