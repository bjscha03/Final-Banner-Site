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

  // --- Mark intake as paid, and fetch customer info for confirmation email ---
  let customerName = '';
  let customerEmail = '';
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

    // Fetch customer details for confirmation email
    const rows = await sql`
      SELECT customer_name, customer_email
      FROM designer_intake_orders
      WHERE id = ${intakeId}
      LIMIT 1
    `;
    if (rows.length > 0) {
      customerName = rows[0].customer_name || '';
      customerEmail = rows[0].customer_email || '';
    }
  } catch (dbErr) {
    console.error('paypal-capture-design-deposit DB error:', dbErr.message);
    // Payment was captured — don't fail the user; just log
  }

  // --- Send payment confirmation email (best effort) ---
  if (captureStatus === 'COMPLETED' && customerEmail) {
    try {
      const { Resend } = require('resend');
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resend = new Resend(apiKey);
        const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
        const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
        const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';

        function sanitize(v) {
          if (v == null) return '';
          return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
          + '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4;">'
          + '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">'
          + '<div style="text-align:center;padding:20px;background:#ffffff;"><img src="' + logoUrl + '" alt="Banners On The Fly" style="height:50px;"></div>'
          + '<div style="background:#0B1F3A;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">Payment Received \u2014 We\u2019re On It! \ud83c\udf93</h1></div>'
          + '<div style="padding:24px;">'
          + '<p style="font-weight:600;color:#0B1F3A;">Hi ' + sanitize(customerName) + ',</p>'
          + '<p>Your <strong>$19 design deposit</strong> has been received. Our design team is now working on your custom graduation design.</p>'
          + '<p>You\u2019ll receive a proof by email to review and approve. Once approved, we\u2019ll print and ship fast \u2014 FREE next-day air.</p>'
          + '<p style="margin-top:8px;color:#6b7280;font-size:13px;">Questions? Reply to this email or contact us at <a href="mailto:info@bannersonthefly.com" style="color:#FF6A00;">info@bannersonthefly.com</a>.</p>'
          + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">'
          + '<p style="font-size:13px;color:#6b7280;">\u2014 Banners On The Fly</p>'
          + '</div></div></body></html>';

        await resend.emails.send({
          from: 'Banners on the Fly <' + emailFrom + '>',
          to: customerEmail,
          subject: 'Your $19 Design Deposit is Confirmed \ud83c\udf93',
          html,
          reply_to: emailReplyTo,
          tags: [{ name: 'source', value: 'designer_deposit_paid' }],
        });
        console.log('paypal-capture-design-deposit: confirmation email sent to', customerEmail);
      }
    } catch (emailErr) {
      console.error('paypal-capture-design-deposit: failed to send confirmation email:', emailErr.message);
    }
  }

  return jsonResponse(headers, 200, {
    ok: true,
    status: captureStatus,
    intakeId,
    paypalOrderId,
  });
};
