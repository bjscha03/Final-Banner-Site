'use strict';

const TEST_PUBLISHABLE_PREFIX = 'pk_test_';
const LIVE_PUBLISHABLE_PREFIX = 'pk_live_';
const TEST_SECRET_PREFIX = 'sk_test_';
const LIVE_SECRET_PREFIX = 'sk_live_';

function clean(value) {
  return String(value || '').trim();
}

function hostname(value) {
  const normalized = clean(value);
  if (!normalized) return '';
  try {
    return new URL(normalized.includes('://') ? normalized : `https://${normalized}`)
      .hostname
      .toLowerCase();
  } catch {
    return '';
  }
}

function requestHostnames(event = {}) {
  const headers = event?.headers || {};
  const header = (name) => {
    if (typeof headers?.get === 'function') return headers.get(name) || '';
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
    return key ? headers[key] : '';
  };
  return [
    event?.rawUrl,
    event?.raw_url,
    event?.url,
    header('host'),
    ...String(header('x-forwarded-host') || '').split(','),
  ].map(hostname).filter(Boolean);
}

function previewContextForHostname(host) {
  if (/^deploy-preview-\d+--.+\.netlify\.app$/.test(host)) return 'deploy-preview';
  // An immutable deploy permalink can represent production or nonproduction.
  // Defer to deployment-controlled metadata instead of guessing from it.
  if (/^[0-9a-f]{24}--.+\.netlify\.app$/.test(host)) return '';
  if (host.endsWith('.netlify.app')
      && host !== 'bannersonthefly.netlify.app'
      && host.includes('--')) {
    return 'branch-deploy';
  }
  return '';
}

function isProductionHostname(host) {
  return host === 'bannersonthefly.com'
    || host === 'www.bannersonthefly.com'
    || host === 'bannersonthefly.netlify.app';
}

function deploymentContext(event = {}) {
  for (const candidate of [process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    const inferredHost = hostname(candidate);
    if (/^deploy-preview-\d+--.+\.netlify\.app$/.test(inferredHost)) return 'deploy-preview';
  }

  // A request hostname can always demote a request to an explicit preview or
  // branch. It must never upgrade an unknown deployment to production.
  const actualRequestHosts = requestHostnames(event);
  for (const requestHost of actualRequestHosts) {
    const inferred = previewContextForHostname(requestHost);
    if (inferred) return inferred;
  }

  const configured = clean(process.env.CONTEXT).toLowerCase();
  if (['production', 'deploy-preview', 'branch-deploy', 'dev'].includes(configured)) {
    return configured;
  }
  if (configured) return 'unknown';

  // Netlify can omit build-only CONTEXT inside a manually published Function.
  // Its deployment-controlled canonical URL is the first half of the fallback.
  // The actual request must also target a known production hostname; request
  // metadata alone can never promote an unknown deployment to production.
  const canonicalHost = hostname(process.env.URL);
  if (/^deploy-preview-\d+--.+\.netlify\.app$/.test(canonicalHost)) return 'deploy-preview';
  if (!isProductionHostname(canonicalHost)) {
    if (canonicalHost.endsWith('.netlify.app')) return 'branch-deploy';
    return 'unknown';
  }
  if (actualRequestHosts.length > 0
      && actualRequestHosts.every(isProductionHostname)) {
    return 'production';
  }
  return 'unknown';
}

function isProductionContext(event = {}) {
  return deploymentContext(event) === 'production';
}

function expectedMode(event = {}) {
  return isProductionContext(event) ? 'live' : 'test';
}

function enabledByFlag() {
  return ['1', 'true', 'yes', 'on'].includes(clean(process.env.STRIPE_CHECKOUT_ENABLED).toLowerCase());
}

function keyMatchesMode(key, mode, kind) {
  const prefix = kind === 'publishable'
    ? (mode === 'live' ? LIVE_PUBLISHABLE_PREFIX : TEST_PUBLISHABLE_PREFIX)
    : (mode === 'live' ? LIVE_SECRET_PREFIX : TEST_SECRET_PREFIX);
  return clean(key).startsWith(prefix);
}

function resolveStripeRuntime(options = {}) {
  const context = deploymentContext(options.event);
  const mode = expectedMode(options.event);
  const configuredMode = clean(process.env.STRIPE_MODE).toLowerCase();
  const publishableKey = clean(process.env.STRIPE_PUBLISHABLE_KEY);
  const secretKey = clean(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = clean(process.env.STRIPE_WEBHOOK_SECRET);
  const errors = [];

  if (context === 'unknown') errors.push('STRIPE_DEPLOY_CONTEXT_UNKNOWN');
  if (options.requireEnabledFlag !== false && !enabledByFlag()) errors.push('STRIPE_CHECKOUT_DISABLED');
  if (configuredMode && !['test', 'live'].includes(configuredMode)) errors.push('STRIPE_MODE_INVALID');
  if (configuredMode && configuredMode !== mode) errors.push('STRIPE_MODE_CONTEXT_MISMATCH');
  if (!keyMatchesMode(publishableKey, mode, 'publishable')) errors.push('STRIPE_PUBLISHABLE_KEY_MODE_MISMATCH');
  if (!keyMatchesMode(secretKey, mode, 'secret')) errors.push('STRIPE_SECRET_KEY_MODE_MISMATCH');
  if (!webhookSecret.startsWith('whsec_')) errors.push('STRIPE_WEBHOOK_SECRET_INVALID');
  if (!(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL)) errors.push('DATABASE_NOT_CONFIGURED');
  if (!(process.env.ORDER_CONFIRMATION_TOKEN_SECRET || process.env.AUTH_SESSION_SECRET)) {
    errors.push('ORDER_CONFIRMATION_SECRET_NOT_CONFIGURED');
  }
  if (options.requireInternalJobSecret
      && !(process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET)) {
    errors.push('INTERNAL_JOB_SECRET_NOT_CONFIGURED');
  }

  return {
    enabled: errors.length === 0,
    mode,
    environment: mode,
    context,
    publishableKey,
    secretKey,
    webhookSecret,
    errors,
  };
}

function publicStripeConfig(event = {}) {
  const runtime = resolveStripeRuntime({ requireInternalJobSecret: true, event });
  return {
    enabled: runtime.enabled,
    publishableKey: runtime.enabled ? runtime.publishableKey : null,
    environment: runtime.environment,
  };
}

function header(event, name) {
  const headers = event?.headers || {};
  const lower = name.toLowerCase();
  return clean(headers[lower] || headers[name] || headers[Object.keys(headers).find((key) => key.toLowerCase() === lower)]);
}

function requestHost(event) {
  return header(event, 'x-forwarded-host').split(',')[0].trim() || header(event, 'host').split(',')[0].trim();
}

function isLocalRequest(event) {
  if (clean(process.env.NODE_ENV).toLowerCase() === 'test') return true;
  if (clean(process.env.NETLIFY_DEV).toLowerCase() === 'true') return true;
  const host = requestHost(event).split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function assertSameOrigin(event, options = {}) {
  const origin = header(event, 'origin');
  const host = requestHost(event);
  if (!origin) {
    if (isLocalRequest(event) || options.allowMissingOrigin === true) return true;
    const error = new Error('A same-origin browser request is required.');
    error.code = 'ORIGIN_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  let originHost;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    originHost = parsed.host;
  } catch {
    const error = new Error('The request origin is invalid.');
    error.code = 'ORIGIN_INVALID';
    error.statusCode = 403;
    throw error;
  }

  if (!host || originHost.toLowerCase() !== host.toLowerCase()) {
    const error = new Error('Cross-origin checkout requests are not allowed.');
    error.code = 'ORIGIN_MISMATCH';
    error.statusCode = 403;
    throw error;
  }
  return true;
}

function siteUrlForEvent(event) {
  // Internal follow-up requests carry an authorization secret, so their
  // destination must come only from deployment-controlled environment values.
  // Never reflect Host/X-Forwarded-Host into a server-side fetch.
  for (const candidate of [process.env.DEPLOY_PRIME_URL, process.env.URL, process.env.PUBLIC_SITE_URL]) {
    try {
      const parsed = new URL(clean(candidate));
      if (parsed.protocol === 'https:') return parsed.origin;
      if (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
        return parsed.origin;
      }
    } catch {
      // Try the next deployment-controlled candidate.
    }
  }
  if (isLocalRequest(event)) {
    const host = requestHost(event);
    if (host) return `http://${host}`;
  }
  return null;
}

module.exports = {
  assertSameOrigin,
  deploymentContext,
  enabledByFlag,
  expectedMode,
  isLocalRequest,
  isProductionContext,
  keyMatchesMode,
  publicStripeConfig,
  requestHost,
  resolveStripeRuntime,
  siteUrlForEvent,
};
