// netlify/functions/paypal-capture-order.js
const fetch = require('node-fetch');
const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Helper to trigger the notify-order function
async function sendOrderNotificationEmail(orderId) {
  try {
    console.log('Triggering notification for PayPal order:', orderId);
    // Use the production URL or the one from environment variables
    const siteURL = process.env.URL || 'https://bannersonthefly.com';
    const notifyURL = `${siteURL}/.netlify/functions/notify-order`;

    // We don't need to wait for the response, just fire and forget.
    // The notify-order function will handle its own logic, including logging.
    fetch(notifyURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });

    console.log('Notification request sent for order:', orderId);
  } catch (error) {
    // Log and ignore, as failing to send email should not block the user flow.
    console.error('Failed to trigger notification for order:', orderId, error);
  }
}

const getPayPalCredentials = () => {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
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
      : 'https://api-m.sandbox.paypal.com'
  };
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return ok('');
    if (event.httpMethod !== 'POST') return send(405, { error: 'METHOD_NOT_ALLOWED' });

    const { orderID } = JSON.parse(event.body || '{}');
    if (!orderID) return send(400, { error: 'MISSING_ORDER_ID' });

    const { clientId, secret, baseUrl: base } = getPayPalCredentials();

    // Database connection
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return send(500, { error: 'DATABASE_NOT_CONFIGURED' });
    const sql = neon(dbUrl);

    // OAuth
    const tRes = await fetch(`${base}/v1/oauth2/token`, {
      method:'POST',
      headers:{
        Authorization:'Basic '+Buffer.from(`${clientId}:${secret}`).toString('base64'),
        'Content-Type':'application/x-www-form-urlencoded',
      },
      body:'grant_type=client_credentials',
    });
    const tJson = await tRes.json();
    if (!tRes.ok) return send(tRes.status, { error: 'PAYPAL_TOKEN_ERROR', details:tJson });

    // Capture (idempotent)
    const cRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${tJson.access_token}`,
        'PayPal-Request-Id': `cap_${orderID}`,
      },
    });
    const cJson = await cRes.json();

    if (!cRes.ok || /INTERNAL/.test(cJson?.name || '')) {
      return send(cRes.status || 502, {
        error:'PAYPAL_CAPTURE_FAILED',
        details:cJson,
        hint: hint(cJson),
      });
    }

    // --- Database Persistence ---
    const { cartItems, userEmail, userId, shippingAddress, customerName } = JSON.parse(event.body || '{}');
    const capture = cJson.purchase_units[0].payments.captures[0];
    const capturedAmount = parseFloat(capture.amount.value);
    const payerEmail = cJson.payer.email_address;
    const finalEmail = userEmail || payerEmail;

    // Server-side calculation to verify amount
    const subtotalCents = (cartItems || []).reduce((sum, i) => sum + i.line_total_cents, 0);
    const taxCents = Math.round(subtotalCents * 0.06); // 6% tax rate
    const totalCents = subtotalCents + taxCents;

    if (Math.round(capturedAmount * 100) !== totalCents) {
      console.error('PayPal amount mismatch:', { expected: totalCents, captured: Math.round(capturedAmount * 100) });
      // TODO: Consider refunding the payment here if amounts mismatch
      return send(400, { error: 'AMOUNT_MISMATCH' });
    }

    const orderId = randomUUID();
    const finalCustomerName = customerName || `${cJson.payer.name.given_name} ${cJson.payer.name.surname}`;

    await sql.transaction(async (tx) => {
      await tx`
        INSERT INTO orders (
          id, user_id, email, subtotal_cents, tax_cents, total_cents, status,
          paypal_order_id, paypal_capture_id, customer_name, shipping_address
        ) VALUES (
          ${orderId}, ${userId || null}, ${finalEmail}, ${subtotalCents}, ${taxCents}, ${totalCents}, 'paid',
          ${orderID}, ${capture.id}, ${finalCustomerName}, ${shippingAddress || null}
        )
      `;

      for (const item of cartItems) {
        await tx`
          INSERT INTO order_items (
            id, order_id, width_in, height_in, quantity, material,
            grommets, rope_feet, pole_pockets, line_total_cents, file_key
          ) VALUES (
            ${randomUUID()}, ${orderId}, ${item.width_in || 0}, ${item.height_in || 0}, ${item.quantity || 1},
            ${item.material || '13oz'}, ${item.grommets || 'none'}, ${item.rope_feet || 0},
            ${item.pole_pockets && item.pole_pockets !== 'none'}, ${item.line_total_cents || 0}, ${item.file_key || null}
          )
        `;
      }
    });

    console.log('✅ PayPal order created in DB successfully:', orderId);

    // Fire-and-forget the notification email.
    // This ensures the user gets a fast response and email issues don't block the order.
    sendOrderNotificationEmail(orderId);

    return send(200, {
      ok: true,
      orderId: orderId,
      data: cJson
    });

  } catch (e) {
    return send(500, { error:'FUNCTION_CRASH', message:e.message || String(e) });
  }
};

function ok(body){ return { statusCode:200, headers:cors(), body }; }
function send(statusCode, body){ return { statusCode, headers:cors(), body:JSON.stringify(body) }; }
function cors(){
  return {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
  };
}
function hint(d){
  const n = d?.name || '';
  if (/INVALID_/i.test(n)) return 'Invalid orderID or payload.';
  if (/AUTHORIZATION/i.test(n)) return 'Check client/secret and PAYPAL_ENV vs client type.';
  return 'Transient gateway error. Safe to retry.';
}

function ok(body){ return { statusCode:200, headers:cors(), body }; }
function send(statusCode, body){ return { statusCode, headers:cors(), body:JSON.stringify(body) }; }
function cors(){
  return {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
  };
}
function hint(d){
  const n = d?.name || '';
  if (/INVALID_/i.test(n)) return 'Invalid orderID or payload.';
  if (/AUTHORIZATION/i.test(n)) return 'Check client/secret and PAYPAL_ENV vs client type.';
  return 'Transient gateway error. Safe to retry.';
}
