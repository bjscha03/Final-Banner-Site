/**
 * PayPal Configuration Endpoint
 *
 * Returns only the public client ID used by the standard PayPal Buttons SDK.
 * Fastlane and Card Fields client-token generation are intentionally disabled.
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method not allowed' });

  try {
    if (process.env.FEATURE_PAYPAL !== '1') {
      return reply(200, {
        enabled: false,
        clientId: null,
        environment: null,
        components: 'buttons',
        fastlane: false,
      });
    }

    const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    const clientId = process.env[`PAYPAL_CLIENT_ID_${environment.toUpperCase()}`];

    if (!clientId) {
      console.error('[paypal-config] PayPal client ID is missing', { environment });
      return reply(500, {
        enabled: false,
        clientId: null,
        environment,
        components: 'buttons',
        fastlane: false,
        error: 'PayPal configuration error',
      });
    }

    return reply(200, {
      enabled: true,
      clientId,
      environment,
      components: 'buttons',
      fastlane: false,
    });
  } catch (error) {
    console.error('[paypal-config] unexpected error', error);
    return reply(500, {
      enabled: false,
      clientId: null,
      environment: null,
      components: 'buttons',
      fastlane: false,
      error: 'Internal server error',
    });
  }
};
