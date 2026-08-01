/**
 * PayPal Configuration Endpoint
 *
 * Returns the public PayPal client ID and, when available, a short-lived client
 * token for PayPal Card Fields. App secrets and OAuth tokens never leave the
 * server. Fastlane is not loaded or initialized by this integration.
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

async function getAccessToken(baseUrl, clientId, secret) {
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en_US',
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PAYPAL_OAUTH_FAILED_${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error('PAYPAL_OAUTH_TOKEN_MISSING');
  return payload.access_token;
}

async function generateClientToken(baseUrl, accessToken) {
  const response = await fetch(`${baseUrl}/v1/identity/generate-token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en_US',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.client_token) {
    const error = new Error(`PAYPAL_CLIENT_TOKEN_FAILED_${response.status}`);
    error.providerCode = payload?.name || payload?.details?.[0]?.issue || null;
    throw error;
  }
  return payload.client_token;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method not allowed' });

  try {
    if (process.env.FEATURE_PAYPAL !== '1') {
      return reply(200, {
        enabled: false,
        clientId: null,
        clientToken: null,
        advancedCardPayments: false,
        environment: null,
      });
    }

    const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    const clientId = process.env[`PAYPAL_CLIENT_ID_${environment.toUpperCase()}`];
    const secret = process.env[`PAYPAL_SECRET_${environment.toUpperCase()}`];
    const baseUrl = environment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    if (!clientId || !secret) {
      console.error('[paypal-config] PayPal credentials are missing', { environment });
      return reply(500, {
        error: 'PayPal configuration error',
        enabled: false,
        clientId: null,
        clientToken: null,
        advancedCardPayments: false,
        environment,
      });
    }

    let clientToken = null;
    let advancedCardPayments = false;
    try {
      const accessToken = await getAccessToken(baseUrl, clientId, secret);
      clientToken = await generateClientToken(baseUrl, accessToken);
      advancedCardPayments = true;
    } catch (error) {
      // Wallet checkout remains available if the merchant account is not
      // provisioned for Advanced Card Fields. We never fall back to Fastlane.
      console.error('[paypal-config] Card Fields client token unavailable', {
        environment,
        error: error?.message,
        providerCode: error?.providerCode || null,
      });
    }

    return reply(200, {
      enabled: true,
      clientId,
      clientToken,
      advancedCardPayments,
      environment,
      fastlane: false,
    });
  } catch (error) {
    console.error('[paypal-config] unexpected error', error);
    return reply(500, {
      error: 'Internal server error',
      enabled: false,
      clientId: null,
      clientToken: null,
      advancedCardPayments: false,
      environment: null,
    });
  }
};

exports._test = { getAccessToken, generateClientToken };
