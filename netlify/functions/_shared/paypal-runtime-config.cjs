'use strict';

function firstConfigured(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeEnvironment(value) {
  const normalized = String(value || 'sandbox')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .toLowerCase();

  if (['live', 'production', 'prod'].includes(normalized)) return 'live';
  return 'sandbox';
}

function resolveCredentials(environment) {
  const suffix = environment === 'live' ? 'LIVE' : 'SANDBOX';
  return {
    clientId: firstConfigured(
      `PAYPAL_CLIENT_ID_${suffix}`,
      `PAYPAL_${suffix}_CLIENT_ID`,
      'PAYPAL_CLIENT_ID',
      'VITE_PAYPAL_CLIENT_ID',
    ),
    clientSecret: firstConfigured(
      `PAYPAL_SECRET_${suffix}`,
      `PAYPAL_CLIENT_SECRET_${suffix}`,
      `PAYPAL_${suffix}_SECRET`,
      `PAYPAL_${suffix}_CLIENT_SECRET`,
      'PAYPAL_SECRET',
      'PAYPAL_CLIENT_SECRET',
    ),
  };
}

function preparePayPalRuntime() {
  const environment = normalizeEnvironment(process.env.PAYPAL_ENV);
  const { clientId, clientSecret } = resolveCredentials(environment);
  const suffix = environment === 'live' ? 'LIVE' : 'SANDBOX';

  process.env.PAYPAL_ENV = environment;
  if (clientId) process.env[`PAYPAL_CLIENT_ID_${suffix}`] = clientId;
  if (clientSecret) process.env[`PAYPAL_SECRET_${suffix}`] = clientSecret;

  return {
    environment,
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
  };
}

module.exports = {
  firstConfigured,
  normalizeEnvironment,
  resolveCredentials,
  preparePayPalRuntime,
};
