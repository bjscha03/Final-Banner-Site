const { neon } = require('@neondatabase/serverless');
const createOrder = require('./create-order-core.cjs');
const { amountToCents, getPayPalWebhookCaptureId, getPayPalWebhookOrderId } = require('../paypalConversionHelpers.cjs');

const headers = { 'Content-Type': 'application/json' };

async function getPayPalAccessToken() {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) throw new Error(`PayPal credentials not configured for environment: ${env}`);
  const baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status}`);
  const data = await res.json();
  return { accessToken: data.access_token, baseUrl };
}

async function verifyWebhookSignature(event, body) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID is not configured');
  const { accessToken, baseUrl } = await getPayPalAccessToken();
  const h = event.headers || {};
  const verificationPayload = {
    auth_algo: h['paypal-auth-algo'] || h['Paypal-Auth-Algo'] || h['PAYPAL-AUTH-ALGO'],
    cert_url: h['paypal-cert-url'] || h['Paypal-Cert-Url'] || h['PAYPAL-CERT-URL'],
    transmission_id: h['paypal-transmission-id'] || h['Paypal-Transmission-Id'] || h['PAYPAL-TRANSMISSION-ID'],
    transmission_sig: h['paypal-transmission-sig'] || h['Paypal-Transmission-Sig'] || h['PAYPAL-TRANSMISSION-SIG'],
    transmission_time: h['paypal-transmission-time'] || h['Paypal-Transmission-Time'] || h['PAYPAL-TRANSMISSION-TIME'],
    webhook_id: webhookId,
    webhook_event: JSON.parse(body || '{}'),
  };
  const res = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(verificationPayload),
  });
  if (!res.ok) throw new Error(`PayPal webhook verification failed: ${res.status}`);
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

async function ensureWebhookTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS paypal_webhook_events (
      paypal_event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      processing_status TEXT NOT NULL DEFAULT 'received',
      error_message TEXT,
      created_order_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }) };
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'DATABASE_NOT_CONFIGURED' }) };
  const body = event.body || '{}';
  const sql = neon(dbUrl);

  try {
    const verified = await verifyWebhookSignature(event, body);
    if (!verified) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'PAYPAL_WEBHOOK_SIGNATURE_INVALID' }) };

    const payload = JSON.parse(body);
    const eventId = String(payload.id || '').trim();
    const eventType = String(payload.event_type || '').trim();
    const resource = payload.resource || {};
    const paypalOrderId = getPayPalWebhookOrderId(resource);
    const paypalCaptureId = getPayPalWebhookCaptureId(resource);

    await ensureWebhookTables(sql);
    if (eventId) {
      const inserted = await sql`
        INSERT INTO paypal_webhook_events (paypal_event_id, event_type, paypal_order_id, paypal_capture_id, processing_status, updated_at)
        VALUES (${eventId}, ${eventType}, ${paypalOrderId || null}, ${paypalCaptureId || null}, 'received', NOW())
        ON CONFLICT (paypal_event_id) DO NOTHING
        RETURNING paypal_event_id
      `;
      if (!inserted.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, duplicate: true }) };
    }

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
      if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'ignored', updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ignored: eventType }) };
    }

    const amountCents = amountToCents(resource?.amount?.value);
    const currency = String(resource?.amount?.currency_code || '').toUpperCase();
    if (!paypalOrderId || !paypalCaptureId || currency !== 'USD' || !Number.isFinite(amountCents) || amountCents <= 0) {
      const message = 'PayPal webhook missing completed capture identifiers or valid USD amount';
      if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'error', error_message = ${message}, updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'PAYPAL_WEBHOOK_CAPTURE_INVALID' }) };
    }

    const existing = await sql`SELECT id, status, total_cents FROM orders WHERE paypal_order_id = ${paypalOrderId} OR paypal_capture_id = ${paypalCaptureId} LIMIT 1`;
    if (existing.length) {
      if (existing[0].status !== 'paid') {
        if (Number(existing[0].total_cents) !== amountCents) {
          const message = 'Captured amount does not match pending internal order';
          if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'error', error_message = ${message}, updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
          return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH' }) };
        }
        await sql`
          UPDATE orders SET status = 'paid', paypal_capture_id = ${paypalCaptureId},
            payment_reconciliation_status = 'complete', updated_at = NOW()
          WHERE id = ${existing[0].id}
        `;
        const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
        const jobSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
        if (siteUrl && jobSecret) {
          await fetch(`${siteUrl}/.netlify/functions/generate-paid-order-pdfs-background`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Job-Secret': jobSecret },
            body: JSON.stringify({ orderId: existing[0].id }),
          });
        }
      }
      if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'deduped', created_order_id = ${existing[0].id}, updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, deduped: true, orderId: existing[0].id }) };
    }

    const sessions = await sql`SELECT order_payload, expected_total_cents FROM paypal_checkout_sessions WHERE paypal_order_id = ${paypalOrderId} LIMIT 1`;
    if (!sessions.length) {
      const message = 'No paypal_checkout_sessions row exists for completed capture';
      if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'unmatched', error_message = ${message}, updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'PAYPAL_CHECKOUT_SESSION_NOT_FOUND' }) };
    }
    if (Number(sessions[0].expected_total_cents) !== amountCents) {
      const message = `Captured amount ${amountCents} does not match expected ${sessions[0].expected_total_cents}`;
      if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'error', error_message = ${message}, updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH' }) };
    }

    const original = sessions[0].order_payload || {};
    const orderBody = {
      ...original,
      total_cents: amountCents,
      subtotal_cents: amountCents,
      currency: 'usd',
      paypal_order_id: paypalOrderId,
      paypal_capture_id: paypalCaptureId,
      paypal_captured_amount_cents: amountCents,
      paypal_captured_currency: 'USD',
      payment_method: 'paypal',
      payment_status: 'paid',
    };
    const createResponse = await createOrder.handler({
      httpMethod: 'POST',
      headers: { 'content-type': 'application/json', host: event.headers.host || event.headers.Host || '' },
      body: JSON.stringify(orderBody),
    }, {});
    const createPayload = JSON.parse(createResponse.body || '{}');
    if (createResponse.statusCode >= 300 || !createPayload.orderId) {
      const message = createPayload.error || 'create-order failed from PayPal webhook';
      if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'error', error_message = ${message}, updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'ORDER_CREATE_FAILED' }) };
    }
    await sql`UPDATE paypal_checkout_sessions SET status = 'completed', updated_at = NOW() WHERE paypal_order_id = ${paypalOrderId}`;
    if (eventId) await sql`UPDATE paypal_webhook_events SET processing_status = 'created_order', created_order_id = ${createPayload.orderId}, updated_at = NOW() WHERE paypal_event_id = ${eventId}`;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, orderId: createPayload.orderId }) };
  } catch (error) {
    console.error('[paypal-webhook] error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'PAYPAL_WEBHOOK_FAILED' }) };
  }
};

exports._test = { verifyWebhookSignature, ensureWebhookTables };

