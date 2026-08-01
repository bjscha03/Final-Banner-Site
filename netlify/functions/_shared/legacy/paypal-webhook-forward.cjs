const { neon } = require('@neondatabase/serverless');
const captureModule = require('./paypal-capture-forward.cjs');
const {
  getPayPalWebhookCaptureId,
  getPayPalWebhookOrderId,
} = require('../paypalConversionHelpers.cjs');

const headers = { 'Content-Type': 'application/json' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function getPayPalAccessToken() {
  const env = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) throw new Error(`PayPal credentials not configured for environment: ${env}`);
  const baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PayPal OAuth failed: ${response.status}`);
  const data = await response.json();
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
  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verificationPayload),
  });
  if (!response.ok) throw new Error(`PayPal webhook verification failed: ${response.status}`);
  const data = await response.json();
  return data.verification_status === 'SUCCESS';
}

async function ensureWebhookTable(sql) {
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

async function updateEvent(sql, eventId, status, errorMessage = null, orderId = null) {
  await sql`
    UPDATE paypal_webhook_events
       SET processing_status = ${status},
           error_message = ${errorMessage},
           created_order_id = COALESCE(${orderId}, created_order_id),
           updated_at = NOW()
     WHERE paypal_event_id = ${eventId}
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });

  const body = event.body || '{}';
  const sql = neon(dbUrl);

  try {
    const verified = await verifyWebhookSignature(event, body);
    if (!verified) return reply(401, { ok: false, error: 'PAYPAL_WEBHOOK_SIGNATURE_INVALID' });

    const payload = JSON.parse(body);
    const eventId = String(payload.id || '').trim();
    const eventType = String(payload.event_type || '').trim();
    const resource = payload.resource || {};
    const paypalOrderId = getPayPalWebhookOrderId(resource);
    const paypalCaptureId = getPayPalWebhookCaptureId(resource);

    if (!eventId) return reply(400, { ok: false, error: 'PAYPAL_WEBHOOK_EVENT_ID_REQUIRED' });

    await ensureWebhookTable(sql);
    const priorRows = await sql`
      SELECT processing_status, created_order_id
        FROM paypal_webhook_events
       WHERE paypal_event_id = ${eventId}
       LIMIT 1
    `;
    const prior = priorRows[0] || null;
    if (prior && ['completed', 'ignored'].includes(prior.processing_status)) {
      return reply(200, {
        ok: true,
        duplicate: true,
        orderId: prior.created_order_id || null,
      });
    }

    if (!prior) {
      await sql`
        INSERT INTO paypal_webhook_events (
          paypal_event_id, event_type, paypal_order_id, paypal_capture_id,
          processing_status, updated_at
        ) VALUES (
          ${eventId}, ${eventType}, ${paypalOrderId || null}, ${paypalCaptureId || null},
          'received', NOW()
        )
      `;
    } else {
      await sql`
        UPDATE paypal_webhook_events
           SET event_type = ${eventType},
               paypal_order_id = ${paypalOrderId || null},
               paypal_capture_id = ${paypalCaptureId || null},
               processing_status = 'received',
               error_message = NULL,
               updated_at = NOW()
         WHERE paypal_event_id = ${eventId}
      `;
    }

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
      await updateEvent(sql, eventId, 'ignored');
      return reply(200, { ok: true, ignored: eventType });
    }

    if (!paypalOrderId || !paypalCaptureId) {
      await updateEvent(sql, eventId, 'error', 'Completed webhook is missing PayPal order or capture ID');
      return reply(400, { ok: false, error: 'PAYPAL_WEBHOOK_CAPTURE_INVALID' });
    }

    const orders = await sql`
      SELECT id
        FROM orders
       WHERE paypal_order_id = ${paypalOrderId}
       ORDER BY created_at DESC
       LIMIT 2
    `;

    if (orders.length !== 1) {
      const message = orders.length > 1
        ? 'Multiple internal orders reference the same PayPal order ID'
        : 'No pre-created internal order references the completed PayPal order';
      await updateEvent(sql, eventId, orders.length > 1 ? 'conflict' : 'unmatched', message);
      return reply(503, { ok: false, error: orders.length > 1 ? 'PAYPAL_ORDER_CONFLICT' : 'INTERNAL_ORDER_NOT_FOUND' });
    }

    const internalOrderId = orders[0].id;
    const captureResponse = await captureModule.handler({
      httpMethod: 'POST',
      headers: event.headers || {},
      body: JSON.stringify({ orderID: paypalOrderId, internalOrderId }),
    });

    let capturePayload = {};
    try { capturePayload = JSON.parse(captureResponse?.body || '{}'); } catch { /* no-op */ }

    if (
      captureResponse?.statusCode === 200
      && capturePayload?.paymentCaptured === true
      && capturePayload?.captureStatus === 'COMPLETED'
      && capturePayload?.captureID === paypalCaptureId
    ) {
      await updateEvent(sql, eventId, 'completed', null, internalOrderId);
      return reply(200, {
        ok: true,
        orderId: internalOrderId,
        captureID: paypalCaptureId,
        paymentCaptured: true,
      });
    }

    if (captureResponse?.statusCode === 200 && capturePayload?.captureID !== paypalCaptureId) {
      await updateEvent(sql, eventId, 'conflict', 'Webhook capture ID does not match authoritative PayPal order capture', internalOrderId);
      return reply(503, { ok: false, error: 'PAYPAL_CAPTURE_ID_MISMATCH' });
    }

    const retryable = captureResponse?.statusCode === 202
      || capturePayload?.reconciliationRequired
      || capturePayload?.paymentStatusUnknown
      || Number(captureResponse?.statusCode || 500) >= 500;
    await updateEvent(
      sql,
      eventId,
      retryable ? 'reconciliation' : 'error',
      capturePayload?.error || capturePayload?.message || `Capture finalization returned ${captureResponse?.statusCode || 'no response'}`,
      internalOrderId,
    );
    return reply(retryable ? 503 : 422, {
      ok: false,
      error: capturePayload?.error || 'PAYPAL_WEBHOOK_FINALIZATION_FAILED',
      orderId: internalOrderId,
    });
  } catch (error) {
    console.error('[paypal-webhook] error', error);
    return reply(500, { ok: false, error: 'PAYPAL_WEBHOOK_FAILED' });
  }
};

exports._test = { verifyWebhookSignature, ensureWebhookTable };
