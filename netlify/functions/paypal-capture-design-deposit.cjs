/**
 * Captures the PayPal $19 design deposit after the customer returns from
 * the PayPal approval page.
 *
 * Called by GraduationSigns.tsx on mount when it detects
 * ?deposit=success&token=PAYPAL_ORDER_ID&intakeId=UUID in the URL.
 *
 * On success it marks designer_intake_orders.design_fee_paid = TRUE and
 * sets status = 'deposit_paid'.
 */
const { neon } = require('@neondatabase/serverless');

function getPayPalCredentials() {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) {
    throw new Error(`PayPal credentials not configured for environment: ${env}`);
  }
  return {
    clientId,
    secret,
    baseUrl: env === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com',
  };
}

async function getPayPalAccessToken() {
  const { clientId, secret, baseUrl } = getPayPalCredentials();
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal auth failed: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  return { accessToken: data.access_token, baseUrl };
}

function jsonResponse(headers, statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(headers, 405, { ok: false, error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_e) {
    return jsonResponse(headers, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const { paypalOrderId, intakeId } = payload;

  if (!paypalOrderId || typeof paypalOrderId !== 'string') {
    return jsonResponse(headers, 400, { ok: false, error: 'paypalOrderId is required' });
  }
  if (!intakeId || typeof intakeId !== 'string') {
    return jsonResponse(headers, 400, { ok: false, error: 'intakeId is required' });
  }

  console.log('paypal-capture-design-deposit: capturing order', paypalOrderId, 'for intake', intakeId);

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('paypal-capture-design-deposit: DATABASE_URL not configured');
    return jsonResponse(headers, 500, { ok: false, error: 'Database not configured' });
  }

  // --- Capture the PayPal order ---
  let captureData;
  try {
    const { accessToken, baseUrl } = await getPayPalAccessToken();
    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({}),
    });

    captureData = await captureRes.json();

    if (!captureRes.ok) {
      console.error('paypal-capture-design-deposit: capture failed:', captureRes.status, JSON.stringify(captureData));
      return jsonResponse(headers, 500, { ok: false, error: 'PayPal capture failed', details: captureData });
    }
    console.log('paypal-capture-design-deposit: capture status:', captureData.status);
  } catch (paypalErr) {
    console.error('paypal-capture-design-deposit PayPal error:', paypalErr.message);
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to capture payment' });
  }

  const captureStatus = captureData.status; // 'COMPLETED' on success

  // --- Mark intake as paid ---
  try {
    const sql = neon(dbUrl);
    await sql`
      UPDATE designer_intake_orders
      SET
        design_fee_paid = TRUE,
        status = 'deposit_paid',
        paypal_order_id = ${paypalOrderId},
        updated_at = NOW()
      WHERE id = ${intakeId}
    `;
    console.log('paypal-capture-design-deposit: intake updated for', intakeId);
  } catch (dbErr) {
    console.error('paypal-capture-design-deposit DB error:', dbErr.message);
    // Payment was captured — don't fail the user; just log
  }

  return jsonResponse(headers, 200, {
    ok: true,
    status: captureStatus,
    intakeId,
    paypalOrderId,
  });
};
