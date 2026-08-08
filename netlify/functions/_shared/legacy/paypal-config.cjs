/**
 * PayPal Configuration Endpoint
 *
 * Returns the public SDK configuration and the short-lived token required by
 * PayPal's embedded Card Fields. The merchant secret never leaves this function.
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

const getAccessToken = async (environment, clientId, clientSecret) => {
  const baseUrl = environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`PAYPAL_AUTH_FAILED_${response.status}`);
  }
  return { baseUrl, accessToken: payload.access_token };
};

const getCardFieldsToken = async (environment, clientId, clientSecret) => {
  const { baseUrl, accessToken } = await getAccessToken(
    environment,
    clientId,
    clientSecret,
  );
  const response = await fetch(`${baseUrl}/v1/identity/generate-token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.client_token) {
    throw new Error(`PAYPAL_CARD_TOKEN_FAILED_${response.status}`);
  }
  return payload.client_token;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return reply(405, { error: 'Method not allowed' });
  }

  try {
    const prepared = runtimeConfig.preparePayPalRuntime({ event });
    if (!prepared.enabled) {
      console.warn('[paypal-config] PayPal is unavailable for this deploy context', {
        context: prepared.context,
        environment: prepared.environment,
        configuredEnvironment: prepared.configuredEnvironment,
        errors: prepared.errors,
      });
      return reply(200, {
        enabled: false,
        clientId: null,
        environment: prepared.environment,
        components: 'buttons,card-fields',
      });
    }

    const clientToken = await getCardFieldsToken(
      prepared.environment,
      prepared.clientId,
      prepared.clientSecret,
    );

    return reply(200, {
      enabled: true,
      clientId: prepared.clientId,
      environment: prepared.environment,
      components: 'buttons,card-fields',
      clientToken,
    });
  } catch (error) {
    console.error('[paypal-config] unexpected error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return reply(500, {
      enabled: false,
      clientId: null,
      environment: runtimeConfig.expectedEnvironment(event),
      components: 'buttons,card-fields',
      error: 'Internal server error',
    });
  }
};

exports._test = {
  handler: exports.handler,
  firstConfigured: runtimeConfig.firstConfigured,
  normalizeEnvironment: runtimeConfig.normalizeEnvironment,
  resolveCredentials: runtimeConfig.resolveCredentials,
  getAccessToken,
  getCardFieldsToken,
};
