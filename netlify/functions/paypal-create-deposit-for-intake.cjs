/**
 * Creates a new PayPal $19 design-deposit order for an existing (unpaid) intake.
 * Called when a customer cancelled the original PayPal redirect and wants to pay
 * without re-submitting the form.
 *
 * POST body: { intakeId: string }
 *
 * Returns: { ok: true, checkoutUrl: string } or { ok: false, error: string }
 */
const { neon } = require('@neondatabase/serverless');

const DESIGN_FEE_DOLLARS = '19.00';

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

  const { intakeId } = payload;
  if (!intakeId || typeof intakeId !== 'string') {
    return jsonResponse(headers, 400, { ok: false, error: 'intakeId is required' });
  }

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    return jsonResponse(headers, 500, { ok: false, error: 'Database not configured' });
  }

  // --- Verify intake exists and isn't already paid ---
  let intakeRow;
  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT id, design_fee_paid, status
      FROM designer_intake_orders
      WHERE id = ${intakeId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return jsonResponse(headers, 404, { ok: false, error: 'Intake not found' });
    }
    intakeRow = rows[0];
  } catch (dbErr) {
    console.error('paypal-create-deposit-for-intake DB error:', dbErr.message);
    return jsonResponse(headers, 500, { ok: false, error: 'Database error' });
  }

  if (intakeRow.design_fee_paid) {
    return jsonResponse(headers, 409, { ok: false, error: 'Design deposit already paid for this intake' });
  }

  const siteUrl = process.env.SITE_URL || process.env.URL || 'https://bannersonthefly.com';

  // --- Create new PayPal $19 deposit order ---
  let checkoutUrl;
  try {
    const { accessToken, baseUrl } = await getPayPalAccessToken();

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: DESIGN_FEE_DOLLARS },
        description: 'Custom design proof for graduation banner, yard sign, or car magnet',
        custom_id: intakeId,
      }],
      application_context: {
        brand_name: 'Banners On The Fly',
        user_action: 'PAY_NOW',
        return_url: siteUrl.replace(/\/$/, '') + '/graduation-signs?deposit=success&intakeId=' + encodeURIComponent(intakeId),
        cancel_url: siteUrl.replace(/\/$/, '') + '/graduation-signs?deposit=cancel&intakeId=' + encodeURIComponent(intakeId),
        shipping_preference: 'NO_SHIPPING',
      },
    };

    const ppResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!ppResponse.ok) {
      const errText = await ppResponse.text();
      console.error('paypal-create-deposit-for-intake: PayPal order creation failed:', ppResponse.status, errText);
      return jsonResponse(headers, 500, { ok: false, error: 'Failed to create payment session' });
    }

    const ppOrder = await ppResponse.json();
    const approveLink = (ppOrder.links || []).find((l) => l.rel === 'approve');
    checkoutUrl = approveLink ? approveLink.href : null;

    if (!checkoutUrl) {
      console.error('paypal-create-deposit-for-intake: No approve link in PayPal response');
      return jsonResponse(headers, 500, { ok: false, error: 'Failed to get PayPal approval URL' });
    }

    console.log('paypal-create-deposit-for-intake: created order', ppOrder.id, 'for intake', intakeId);

    // Update intake with new PayPal order ID (best effort)
    try {
      const sql = neon(dbUrl);
      await sql`
        UPDATE designer_intake_orders
        SET paypal_order_id = ${ppOrder.id}, updated_at = NOW()
        WHERE id = ${intakeId}
      `;
    } catch (updateErr) {
      console.warn('paypal-create-deposit-for-intake: failed to save paypal_order_id:', updateErr.message);
    }
  } catch (paypalErr) {
    console.error('paypal-create-deposit-for-intake PayPal error:', paypalErr.message);
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to create payment session' });
  }

  return jsonResponse(headers, 200, { ok: true, intakeId, checkoutUrl });
};
