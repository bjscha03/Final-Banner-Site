/**
 * PayPal Configuration Endpoint
 *
 * Returns only the public client ID for the standard hosted PayPal Buttons
 * integration. Fastlane, embedded Card Fields, and client-token generation are
 * intentionally not loaded.
 */

const runtimeConfig = require('../paypal-runtime-config.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method not allowed' });

  try {
    if (String(process.env.FEATURE_PAYPAL || '').trim() !== '1') {
      return reply(200, {
        enabled: false,
        clientId: null,
        environment: runtimeConfig.normalizeEnvironment(process.env.PAYPAL_ENV),
        components: 'buttons',
        fastlane: false,
      });
    }

    const prepared = runtimeConfig.preparePayPalRuntime();
    if (!prepared.configured) {
      console.error('[paypal-config] PayPal credentials are missing', {
        environment: prepared.environment,
        clientIdPresent: Boolean(prepared.clientId),
        clientSecretPresent: Boolean(prepared.clientSecret),
        expectedClientIdVariable: prepared.environment === 'live'
          ? 'PAYPAL_CLIENT_ID_LIVE'
          : 'PAYPAL_CLIENT_ID_SANDBOX',
        expectedSecretVariable: prepared.environment === 'live'
          ? 'PAYPAL_SECRET_LIVE'
          : 'PAYPAL_SECRET_SANDBOX',
      });
      return reply(500, {
        enabled: false,
        clientId: null,
        environment: prepared.environment,
        components: 'buttons',
        fastlane: false,
        error: 'PayPal configuration error',
      });
    }

    return reply(200, {
      enabled: true,
      clientId: prepared.clientId,
      environment: prepared.environment,
      components: 'buttons',
      fastlane: false,
    });
  } catch (error) {
    console.error('[paypal-config] unexpected error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return reply(500, {
      enabled: false,
      clientId: null,
      environment: runtimeConfig.normalizeEnvironment(process.env.PAYPAL_ENV),
      components: 'buttons',
      fastlane: false,
      error: 'Internal server error',
    });
  }
};

exports._test = {
  firstConfigured: runtimeConfig.firstConfigured,
  normalizeEnvironment: runtimeConfig.normalizeEnvironment,
  resolveCredentials: runtimeConfig.resolveCredentials,
};
