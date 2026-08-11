'use strict';

const { requireAdmin } = require('../server-auth.cjs');

const SENSITIVE_KEY = /(secret|password|authorization|cookie|credential|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|unsubscribe[_-]?token|signature)/i;
const PUBLIC_ERROR_CODES = new Set([
  'INVALID_JSON',
  'INVALID_SETTINGS',
  'REQUEST_TOO_LARGE',
  'SETTINGS_CONFLICT',
  'LIVE_SENDING_PHASE_LOCKED',
  'SHADOW_MODE_PHASE_LOCKED',
  'SHADOW_GENERATION_CONTEXT_LOCKED',
  'SHADOW_GENERATION_DISABLED',
  'PERSONALIZATION_NOT_ELIGIBLE',
  'PERSONALIZATION_BUDGET_EXHAUSTED',
  'PERSONALIZATION_CONTEXT_BLOCKED',
  'PERSONALIZATION_ALREADY_RUNNING',
  'PERSONALIZATION_INPUT_TOO_LARGE',
  'PERSONALIZATION_INVALID_OUTPUT',
  'PERSONALIZATION_EMPTY_OUTPUT',
  'PERSONALIZATION_INVALID_USAGE',
  'PERSONALIZATION_SAVE_CONFLICT',
  'OUTBOUND_OPENAI_NOT_CONFIGURED',
  'OUTBOUND_OPENAI_AUTHORIZATION_FAILED',
  'OUTBOUND_OPENAI_PROJECT_BUDGET_REACHED',
  'OUTBOUND_OPENAI_RATE_LIMITED',
  'OUTBOUND_OPENAI_TIMEOUT',
  'OUTBOUND_OPENAI_UNAVAILABLE',
  'OUTBOUND_OPENAI_REQUEST_REJECTED',
  'OUTBOUND_OPENAI_REQUEST_FAILED',
  'OUTBOUND_SCHEMA_NOT_READY',
  'DATABASE_NOT_CONFIGURED',
  'AUTOMATION_CONTEXT_LOCKED',
  'INBOUND_CONTEXT_LOCKED',
  'AUTOMATIC_REPLY_PHASE_LOCKED',
  'REPLY_AI_CONTEXT_LOCKED',
  'OUTBOUND_WEBHOOK_NOT_CONFIGURED',
  'OUTBOUND_WEBHOOK_INVALID',
  'OUTBOUND_RESEND_NOT_CONFIGURED',
  'OUTBOUND_RECEIVED_EMAIL_UNAVAILABLE',
  'OUTBOUND_RECEIVED_EMAIL_TIMEOUT',
  'INBOUND_PROCESSING_DISABLED',
  'INVALID_REPLY_REVIEW',
  'REPLY_NOT_FOUND',
  'INVALID_ANALYTICS_VIEW',
  'OUTBOUND_SEND_BLOCKED',
  'OUTBOUND_SEND_FAILED',
  'OUTBOUND_DELIVERY_PROVIDER_POLICY_BLOCKED',
  'OUTBOUND_DELIVERY_PROVIDER_UNSUPPORTED',
  'INVALID_MANUAL_REVIEW',
  'PERMISSIONED_MARKETING_REQUIRED',
  'MANUAL_MARKETING_NOT_CONFIGURED',
  'MANUAL_MARKETING_NOT_ELIGIBLE',
  'MANUAL_MARKETING_SEND_FAILED',
  'INVALID_COMPANY_MOCKUP',
  'COMPANY_MOCKUP_NOT_FOUND',
  'COMPANY_MOCKUP_NOT_READY',
  'COMPANY_MOCKUP_IDENTITY_MISMATCH',
]);

function redactSecretText(value) {
  return String(value)
    .replace(/\b(?:sk|rk)-[a-z0-9_-]{8,}/gi, '[REDACTED_API_KEY]')
    .replace(/\bre_[a-z0-9_-]{8,}/gi, '[REDACTED_API_KEY]')
    .replace(/\bBearer\s+[a-z0-9._~+/-]{8,}={0,2}/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@[^\s"'<>]+/gi, '[REDACTED_CREDENTIAL_URL]')
    .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|signature|password)=)[^&#\s"'<>]*/gi, '$1[REDACTED]')
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\s*[:=]\s*)[^\s,;"']+/gi, '$1[REDACTED]');
}

function safeRequestId(value) {
  const cleaned = redactSecretText(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 200);
  return cleaned || null;
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
  const statusByCode = {
    INVALID_JSON: 400,
    INVALID_SETTINGS: 400,
    REQUEST_TOO_LARGE: 413,
    SETTINGS_CONFLICT: 409,
    LIVE_SENDING_PHASE_LOCKED: 409,
    SHADOW_MODE_PHASE_LOCKED: 409,
    SHADOW_GENERATION_CONTEXT_LOCKED: 409,
    SHADOW_GENERATION_DISABLED: 409,
    PERSONALIZATION_CONTEXT_BLOCKED: 409,
    PERSONALIZATION_NOT_ELIGIBLE: 422,
    PERSONALIZATION_INPUT_TOO_LARGE: 422,
    PERSONALIZATION_BUDGET_EXHAUSTED: 402,
    PERSONALIZATION_ALREADY_RUNNING: 409,
    PERSONALIZATION_SAVE_CONFLICT: 409,
    PERSONALIZATION_INVALID_OUTPUT: 502,
    PERSONALIZATION_EMPTY_OUTPUT: 502,
    PERSONALIZATION_INVALID_USAGE: 502,
    OUTBOUND_OPENAI_NOT_CONFIGURED: 503,
    OUTBOUND_OPENAI_AUTHORIZATION_FAILED: 502,
    OUTBOUND_OPENAI_PROJECT_BUDGET_REACHED: 402,
    OUTBOUND_OPENAI_RATE_LIMITED: 429,
    OUTBOUND_OPENAI_TIMEOUT: 504,
    OUTBOUND_OPENAI_UNAVAILABLE: 503,
    OUTBOUND_OPENAI_REQUEST_REJECTED: 502,
    OUTBOUND_OPENAI_REQUEST_FAILED: 502,
    OUTBOUND_SCHEMA_NOT_READY: 503,
    DATABASE_NOT_CONFIGURED: 503,
    AUTOMATION_CONTEXT_LOCKED: 409,
    INBOUND_CONTEXT_LOCKED: 409,
    AUTOMATIC_REPLY_PHASE_LOCKED: 409,
    REPLY_AI_CONTEXT_LOCKED: 409,
    OUTBOUND_WEBHOOK_NOT_CONFIGURED: 503,
    OUTBOUND_WEBHOOK_INVALID: 400,
    OUTBOUND_RESEND_NOT_CONFIGURED: 503,
    OUTBOUND_RECEIVED_EMAIL_UNAVAILABLE: 503,
    OUTBOUND_RECEIVED_EMAIL_TIMEOUT: 504,
    INBOUND_PROCESSING_DISABLED: 409,
    INVALID_REPLY_REVIEW: 400,
    REPLY_NOT_FOUND: 404,
    INVALID_ANALYTICS_VIEW: 400,
    OUTBOUND_SEND_BLOCKED: 409,
    OUTBOUND_SEND_FAILED: 502,
    OUTBOUND_DELIVERY_PROVIDER_POLICY_BLOCKED: 409,
    OUTBOUND_DELIVERY_PROVIDER_UNSUPPORTED: 503,
    INVALID_MANUAL_REVIEW: 400,
    PERMISSIONED_MARKETING_REQUIRED: 409,
    MANUAL_MARKETING_NOT_CONFIGURED: 503,
    MANUAL_MARKETING_NOT_ELIGIBLE: 409,
    MANUAL_MARKETING_SEND_FAILED: 502,
    INVALID_COMPANY_MOCKUP: 400,
    COMPANY_MOCKUP_NOT_READY: 409,
    COMPANY_MOCKUP_IDENTITY_MISMATCH: 409,
    COMPANY_MOCKUP_NOT_FOUND: 404,
  };
  const statusCode = statusByCode[code] || 500;
  const messages = {
    INVALID_JSON: 'Request body must be valid JSON.',
    INVALID_SETTINGS: 'Outbound settings contain an invalid or unsupported value.',
    REQUEST_TOO_LARGE: 'Request body is too large.',
    SETTINGS_CONFLICT: 'Settings changed in another session. Refresh and try again.',
    LIVE_SENDING_PHASE_LOCKED: 'Live sending remains locked during Shadow Mode personalization.',
    SHADOW_MODE_PHASE_LOCKED: 'Shadow Mode must remain enabled during personalization.',
    SHADOW_GENERATION_CONTEXT_LOCKED: 'Shadow personalization is available only in explicitly enabled test or staging contexts.',
    SHADOW_GENERATION_DISABLED: 'Shadow personalization is disabled by the global controls.',
    PERSONALIZATION_NOT_ELIGIBLE: 'This prospect is not eligible for a Shadow Mode personalization preview.',
    PERSONALIZATION_BUDGET_EXHAUSTED: 'The local OpenAI budget cannot cover this personalization request.',
    PERSONALIZATION_CONTEXT_BLOCKED: 'OpenAI personalization is blocked in this deployment context.',
    PERSONALIZATION_ALREADY_RUNNING: 'A personalization request for this evidence is already running.',
    PERSONALIZATION_INPUT_TOO_LARGE: 'The bounded research evidence is too large to personalize safely.',
    PERSONALIZATION_INVALID_OUTPUT: 'The outbound OpenAI response did not pass the grounded-copy contract.',
    PERSONALIZATION_EMPTY_OUTPUT: 'The outbound OpenAI response did not contain a personalization draft.',
    PERSONALIZATION_INVALID_USAGE: 'The outbound OpenAI response did not include valid token usage.',
    PERSONALIZATION_SAVE_CONFLICT: 'The personalization state changed before the preview could be saved.',
    OUTBOUND_OPENAI_NOT_CONFIGURED: 'The isolated outbound OpenAI project is not configured in this deployment.',
    OUTBOUND_OPENAI_AUTHORIZATION_FAILED: 'The isolated outbound OpenAI project rejected its credential.',
    OUTBOUND_OPENAI_PROJECT_BUDGET_REACHED: 'The isolated outbound OpenAI project budget has been reached.',
    OUTBOUND_OPENAI_RATE_LIMITED: 'The isolated outbound OpenAI project is temporarily rate limited.',
    OUTBOUND_OPENAI_TIMEOUT: 'The outbound OpenAI request timed out.',
    OUTBOUND_OPENAI_UNAVAILABLE: 'The outbound OpenAI service is temporarily unavailable.',
    OUTBOUND_OPENAI_REQUEST_REJECTED: 'The outbound OpenAI request or pinned model was rejected.',
    OUTBOUND_OPENAI_REQUEST_FAILED: 'The outbound OpenAI request failed safely.',
    OUTBOUND_SCHEMA_NOT_READY: 'The outbound database migration has not been applied.',
    DATABASE_NOT_CONFIGURED: 'The outbound database connection is not configured.',
    AUTOMATION_CONTEXT_LOCKED: 'Outbound automation is available only in explicitly enabled test or staging contexts.',
    INBOUND_CONTEXT_LOCKED: 'Outbound inbound-event processing is available only in explicitly enabled test or staging contexts.',
    AUTOMATIC_REPLY_PHASE_LOCKED: 'Automatic or AI-generated reply sending remains locked.',
    REPLY_AI_CONTEXT_LOCKED: 'Optional AI reply classification is available only in an explicitly enabled test or staging context.',
    OUTBOUND_WEBHOOK_NOT_CONFIGURED: 'The isolated outbound webhook verifier is not configured.',
    OUTBOUND_WEBHOOK_INVALID: 'The outbound webhook request could not be verified.',
    OUTBOUND_RESEND_NOT_CONFIGURED: 'The dedicated outbound Resend project is not configured.',
    OUTBOUND_RECEIVED_EMAIL_UNAVAILABLE: 'The received email content is temporarily unavailable.',
    OUTBOUND_RECEIVED_EMAIL_TIMEOUT: 'The received email lookup timed out.',
    INBOUND_PROCESSING_DISABLED: 'Inbound reply processing is disabled.',
    INVALID_REPLY_REVIEW: 'Reply review fields are invalid.',
    REPLY_NOT_FOUND: 'The reply was not found.',
    INVALID_ANALYTICS_VIEW: 'The requested analytics view is invalid.',
    OUTBOUND_SEND_BLOCKED: 'Outbound delivery is blocked by the safety controls.',
    OUTBOUND_SEND_FAILED: 'The dedicated outbound delivery provider rejected the request.',
    OUTBOUND_DELIVERY_PROVIDER_POLICY_BLOCKED: 'The configured outbound delivery provider is not approved for cold outreach.',
    OUTBOUND_DELIVERY_PROVIDER_UNSUPPORTED: 'A compliant outbound delivery provider is not installed.',
    INVALID_MANUAL_REVIEW: 'Lead review fields are invalid.',
    PERMISSIONED_MARKETING_REQUIRED: 'An authenticated administrator must click Send to authorize this email.',
    MANUAL_MARKETING_NOT_CONFIGURED: 'Manual marketing delivery is not fully configured.',
    MANUAL_MARKETING_NOT_ELIGIBLE: 'This lead is not eligible to send. Recheck approval, permission, suppression, contact quality, preview readiness, and the daily limit.',
    MANUAL_MARKETING_SEND_FAILED: 'Resend could not send this permissioned marketing email.',
    INVALID_COMPANY_MOCKUP: 'Company mockup fields are invalid.',
    COMPANY_MOCKUP_NOT_FOUND: 'This company could not be found for mockup preparation.',
    COMPANY_MOCKUP_NOT_READY: 'This company’s personalized banner is not ready yet. Refresh the banner, review it, and try Send again.',
    COMPANY_MOCKUP_IDENTITY_MISMATCH: 'The personalized banner did not match this company. Nothing was sent; refresh the banner before trying again.',
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
  safeRequestId,
  sanitizeForAudit,
  safeFailure,
  sameOriginError,
};
