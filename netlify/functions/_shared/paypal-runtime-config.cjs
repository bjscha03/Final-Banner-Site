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

function deploymentContext() {
  const configured = clean(process.env.CONTEXT).toLowerCase();
  if (configured) return configured;

  // CONTEXT is set by Netlify Functions. URL inference is a defensive fallback
  // for local tests or an unusual invocation where that value is absent.
  for (const candidate of [process.env.DEPLOY_PRIME_URL, process.env.URL]) {
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

function isProductionContext() {
  return deploymentContext() === 'production';
}

function expectedEnvironment() {
  return isProductionContext() ? 'live' : 'sandbox';
}

function resolveCredentials(environment) {
  const suffix = environment === 'live' ? 'LIVE' : 'SANDBOX';
  const productionFallback = environment === 'live' && isProductionContext();
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

function resolvePayPalRuntime({ requireFeature = true } = {}) {
  const context = deploymentContext();
  const environment = expectedEnvironment();
  const configuredEnvironment = normalizeEnvironment(process.env.PAYPAL_ENV);
  const { clientId, clientSecret } = resolveCredentials(environment);
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
  resolveCredentials,
  resolvePayPalRuntime,
};
