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
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error('PAYPAL_AUTH_FAILED');
  return { baseUrl, accessToken: payload.access_token };
};

const getCardFieldsToken = async (environment, clientId, clientSecret) => {
  const { baseUrl, accessToken } = await getAccessToken(environment, clientId, clientSecret);
  const response = await fetch(`${baseUrl}/v1/identity/generate-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const payload = await response.json();
  if (!response.ok || !payload.client_token) throw new Error('PAYPAL_CARD_TOKEN_FAILED');
  return payload.client_token;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method not allowed' });

  try {
    if (process.env.FEATURE_PAYPAL !== '1') {
      return reply(200, {
        enabled: false,
        clientId: null,
        environment: null,
        components: 'buttons,card-fields',
      });
    }

    const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    const clientId = process.env[`PAYPAL_CLIENT_ID_${environment.toUpperCase()}`];
    const clientSecret = process.env[`PAYPAL_CLIENT_SECRET_${environment.toUpperCase()}`];

    if (!clientId || !clientSecret) {
      console.error('[paypal-config] PayPal client ID is missing', { environment });
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
    console.error('[paypal-config] unexpected error', error);
    return reply(500, {
      enabled: false,
      clientId: null,
      environment: null,
      components: 'buttons,card-fields',
      error: 'Internal server error',
    });
  }
};
