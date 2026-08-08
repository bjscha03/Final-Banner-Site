'use strict';

function clean(value) {
  return String(value || '').trim().replace(/^['"]+|['"]+$/g, '');
}

function firstConfigured(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeEnvironment(value) {
  const normalized = clean(value || 'sandbox').toLowerCase();
  if (['live', 'production', 'prod'].includes(normalized)) return 'live';
  return 'sandbox';
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
  // Any branch/deploy-specific Netlify hostname is nonproduction even if a
  // runtime unexpectedly exposes the site's production URL/CONTEXT.
  if (host.endsWith('.netlify.app')
      && host !== 'bannersonthefly.netlify.app'
      && host.includes('--')) {
    return 'branch-deploy';
  }
  return '';
}

function deploymentContext(event = {}) {
  // DEPLOY_PRIME_URL is deployment-controlled when Netlify exposes it. Only an
  // explicit Deploy Preview result may override CONTEXT; a production deploy's
  // immutable `hash--site.netlify.app` URL must not demote the live deployment.
  for (const candidate of [process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    const inferredHost = hostname(candidate);
    if (/^deploy-preview-\d+--.+\.netlify\.app$/.test(inferredHost)) return 'deploy-preview';
  }

  // The actual request host is the final containment boundary for Netlify
  // runtimes that omit build-only context variables. It can only downgrade a
  // request to nonproduction, never upgrade one to production.
  for (const requestHost of requestHostnames(event)) {
    const inferred = previewContextForHostname(requestHost);
    if (inferred) return inferred;
  }

  const configured = clean(process.env.CONTEXT).toLowerCase();
  if (configured) return configured;

  // CONTEXT is set by Netlify Functions. URL inference is a defensive fallback
  // for local tests or an unusual invocation where that value is absent.
  for (const candidate of [process.env.URL]) {
    try {
      const hostname = new URL(clean(candidate)).hostname.toLowerCase();
      if (/^deploy-preview-\d+--.+\.netlify\.app$/.test(hostname)) return 'deploy-preview';
      if (hostname === 'bannersonthefly.com' || hostname === 'www.bannersonthefly.com') {
        return 'production';
      }
      if (hostname.endsWith('.netlify.app')) return 'branch-deploy';
    } catch {
      // Try the next deployment-controlled URL.
    }
  }
  return 'unknown';
}

function isProductionContext(event = {}) {
  return deploymentContext(event) === 'production';
}

function expectedEnvironment(event = {}) {
  return isProductionContext(event) ? 'live' : 'sandbox';
}

function resolveCredentials(environment, event = {}) {
  const suffix = environment === 'live' ? 'LIVE' : 'SANDBOX';
  const productionFallback = environment === 'live' && isProductionContext(event);
  return {
    // Provider credentials must be explicitly scoped outside production.
    // Legacy generic/Vite client variables remain a production-live fallback
    // only, so current live configuration keeps working without allowing those
    // values to cross into a Deploy Preview or branch deploy.
    clientId: firstConfigured(
      `PAYPAL_CLIENT_ID_${suffix}`,
      `PAYPAL_${suffix}_CLIENT_ID`,
      ...(productionFallback ? ['PAYPAL_CLIENT_ID', 'VITE_PAYPAL_CLIENT_ID'] : []),
    ),
    clientSecret: firstConfigured(
      `PAYPAL_SECRET_${suffix}`,
      `PAYPAL_CLIENT_SECRET_${suffix}`,
      `PAYPAL_${suffix}_SECRET`,
      `PAYPAL_${suffix}_CLIENT_SECRET`,
      ...(productionFallback ? ['PAYPAL_SECRET', 'PAYPAL_CLIENT_SECRET'] : []),
    ),
  };
}

function featureEnabled() {
  return String(process.env.FEATURE_PAYPAL || '').trim() === '1';
}

function resolvePayPalRuntime({ requireFeature = true, event = {} } = {}) {
  const context = deploymentContext(event);
  const environment = expectedEnvironment(event);
  const configuredEnvironment = normalizeEnvironment(process.env.PAYPAL_ENV);
  const { clientId, clientSecret } = resolveCredentials(environment, event);
  const errors = [];

  if (requireFeature && !featureEnabled()) errors.push('PAYPAL_DISABLED');
  // Banners On The Fly previews intentionally use their local test-order
  // substitute instead of any provider flow. This source guard is independent
  // of Netlify UI environment overrides, so an inherited flag/key can never
  // re-enable PayPal on a pull-request deployment.
  if (context === 'deploy-preview') errors.push('PAYPAL_DEPLOY_PREVIEW_DISABLED');
  if (configuredEnvironment !== environment) errors.push('PAYPAL_ENV_CONTEXT_MISMATCH');
  if (!clientId) errors.push('PAYPAL_CLIENT_ID_NOT_CONFIGURED');
  if (!clientSecret) errors.push('PAYPAL_SECRET_NOT_CONFIGURED');

  return {
    enabled: errors.length === 0,
    configured: Boolean(clientId && clientSecret),
    context,
    environment,
    configuredEnvironment,
    clientId,
    clientSecret,
    baseUrl: environment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com',
    errors,
  };
}

function preparePayPalRuntime(options = {}) {
  const runtime = resolvePayPalRuntime(options);
  const suffix = runtime.environment === 'live' ? 'LIVE' : 'SANDBOX';

  // Canonicalize aliases only after the context/mode check succeeds. Keeping a
  // mismatched PAYPAL_ENV untouched ensures every later warm invocation also
  // fails closed instead of silently changing configuration after one call.
  if (runtime.enabled) {
    process.env.PAYPAL_ENV = runtime.environment;
    if (runtime.clientId) process.env[`PAYPAL_CLIENT_ID_${suffix}`] = runtime.clientId;
    if (runtime.clientSecret) process.env[`PAYPAL_SECRET_${suffix}`] = runtime.clientSecret;
  }

  return runtime;
}

module.exports = {
  clean,
  deploymentContext,
  expectedEnvironment,
  featureEnabled,
  firstConfigured,
  isProductionContext,
  normalizeEnvironment,
  preparePayPalRuntime,
  previewContextForHostname,
  requestHostnames,
  resolveCredentials,
  resolvePayPalRuntime,
};
