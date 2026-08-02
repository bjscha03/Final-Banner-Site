/**
 * PayPal Configuration Endpoint
 *
 * Returns the public SDK configuration and the short-lived token required by
 * PayPal's embedded Card Fields. The merchant secret never leaves this function.
 */

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

const firstConfigured = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const normalizeEnvironment = (value) => {
  const normalized = String(value || 'sandbox')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .toLowerCase();

  if (['live', 'production', 'prod'].includes(normalized)) return 'live';
  return 'sandbox';
};

const resolveCredentials = (environment) => {
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
};

const getAccessToken = async (environment, clientId, clientSecret) => {
  const baseUrl = environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error('PAYPAL_AUTH_FAILED');
  return { baseUrl, accessToken: payload.access_token };
};

const getCardFieldsToken = async (environment, clientId, clientSecret) => {
  const { baseUrl, accessToken } = await getAccessToken(environment, clientId, clientSecret);
  const response = await fetch(`${baseUrl}/v1/identity/generate-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.client_token) throw new Error('PAYPAL_CARD_TOKEN_FAILED');
  return payload.client_token;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method not allowed' });

  try {
    if (String(process.env.FEATURE_PAYPAL || '').trim() !== '1') {
      return reply(200, {
        enabled: false,
        clientId: null,
        environment: null,
        components: 'buttons,card-fields',
      });
    }

    const environment = normalizeEnvironment(process.env.PAYPAL_ENV);
    const { clientId, clientSecret } = resolveCredentials(environment);

    if (!clientId || !clientSecret) {
      console.error('[paypal-config] PayPal credentials are missing', {
        environment,
        clientIdPresent: Boolean(clientId),
        clientSecretPresent: Boolean(clientSecret),
        expectedClientIdVariable: environment === 'live' ? 'PAYPAL_CLIENT_ID_LIVE' : 'PAYPAL_CLIENT_ID_SANDBOX',
        expectedSecretVariable: environment === 'live' ? 'PAYPAL_SECRET_LIVE' : 'PAYPAL_SECRET_SANDBOX',
      });
      return reply(500, {
        enabled: false,
        clientId: null,
        environment,
        components: 'buttons,card-fields',
        error: 'PayPal configuration error',
      });
    }

    const clientToken = await getCardFieldsToken(environment, clientId, clientSecret);
    return reply(200, {
      enabled: true,
      clientId,
      environment,
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
      environment: normalizeEnvironment(process.env.PAYPAL_ENV),
      components: 'buttons,card-fields',
      error: 'Internal server error',
    });
  }
};

exports._test = { firstConfigured, normalizeEnvironment, resolveCredentials };
