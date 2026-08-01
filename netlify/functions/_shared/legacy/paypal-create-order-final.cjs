'use strict';

const { neon } = require('@neondatabase/serverless');
const { getPayPalDescription } = require('./product-display-helpers.cjs');
const {
  ACTIVE_ORDER_STATUSES,
  captureFromOrder,
  matchesInternalOrder,
  orderIdentity,
  recordAttempt,
} = require('./paypal-payment-safety.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
};

const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

function clean(value, max = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function normalizeEmail(value) {
  const email = clean(value, 320)?.toLowerCase() || null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeCustomerInfo(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const fullName = clean(raw.fullName || raw.name, 200);
  return {
    fullName,
    firstName: fullName ? fullName.split(/\s+/)[0] : null,
    email: normalizeEmail(raw.email),
    phone: clean(raw.phone, 40),
    address1: clean(raw.address1 || raw.street || raw.line1, 300),
    address2: clean(raw.address2 || raw.street2 || raw.line2, 300),
    city: clean(raw.city, 160),
    state: clean(raw.state, 80)?.toUpperCase() || null,
    postalCode: clean(raw.postalCode || raw.zip, 40),
    country: clean(raw.country, 8)?.toUpperCase() || 'US',
  };
}

function credentials() {
  const env = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) throw new Error('PAYPAL_NOT_CONFIGURED');
  return {
    env,
    clientId,
    secret,
    baseUrl: env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  };
}

async function token(config) {
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PAYPAL_AUTH_FAILED_${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error('PAYPAL_AUTH_TOKEN_MISSING');
  return payload.access_token;
}

async function retrieve(baseUrl, accessToken, id) {
  const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function safeRecordAttempt(sql, attempt) {
  try {
    await recordAttempt(sql, attempt);
  } catch (error) {
    console.error('[paypal-create-order] ledger write failed', {
      internalOrderId: attempt.internalOrderId,
      paypalOrderId: attempt.paypalOrderId,
      error: error?.message,
    });
  }
}

async function saveSubmittedCustomer(sql, orderId, input) {
  const customer = normalizeCustomerInfo(input);
  if (!customer.email || !customer.fullName || !customer.address1
    || !customer.city || !customer.state || !customer.postalCode) {
    return null;
  }
  const rows = await sql`
    UPDATE orders
       SET email = ${customer.email},
           customer_name = ${customer.fullName},
           customer_first_name = ${customer.firstName},
           customer_phone = COALESCE(${customer.phone}, customer_phone),
           shipping_name = ${customer.fullName},
           shipping_street = ${customer.address1},
           shipping_street2 = ${customer.address2},
           shipping_city = ${customer.city},
           shipping_state = ${customer.state},
           shipping_zip = ${customer.postalCode},
           shipping_country = ${customer.country},
           updated_at = NOW()
     WHERE id = ${orderId}
       AND status = 'pending'
    RETURNING id
  `;
  return rows[0] || null;
}

function shippingFromOrder(order) {
  const name = clean(order.shipping_name || order.customer_name, 300);
  const address1 = clean(order.shipping_street, 300);
  const city = clean(order.shipping_city, 160);
  const state = clean(order.shipping_state, 80);
  const postalCode = clean(order.shipping_zip, 40);
  if (!name || !address1 || !city || !state || !postalCode) return null;
  const address = {
    address_line_1: address1,
    admin_area_2: city,
    admin_area_1: state,
    postal_code: postalCode,
    country_code: clean(order.shipping_country, 8) || 'US',
  };
  if (clean(order.shipping_street2, 300)) address.address_line_2 = clean(order.shipping_street2, 300);
  return {
    name: { full_name: name },
    address,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (process.env.FEATURE_PAYPAL !== '1') return reply(503, { ok: false, error: 'PAYPAL_DISABLED' });

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'INVALID_JSON' }); }
  const internalOrderId = clean(payload.internalOrderId, 100);
  if (!internalOrderId) return reply(400, { ok: false, error: 'INTERNAL_ORDER_REQUIRED' });

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const sql = neon(dbUrl);

  try {
    await saveSubmittedCustomer(sql, internalOrderId, payload.customerInfo);

    const rows = await sql`
      SELECT id, status, total_cents, currency, email, customer_name, customer_phone,
             shipping_name, shipping_street, shipping_street2, shipping_city,
             shipping_state, shipping_zip, shipping_country,
             paypal_order_id, paypal_capture_id, checkout_idempotency_key,
             payment_reconciliation_status
        FROM orders
       WHERE id = ${internalOrderId}
       LIMIT 1
    `;
    if (!rows.length) return reply(404, { ok: false, error: 'INTERNAL_ORDER_NOT_FOUND' });
    const order = rows[0];
    if (!['pending', 'paid'].includes(order.status)) return reply(409, { ok: false, error: 'INTERNAL_ORDER_NOT_PAYABLE' });
    if (!Number.isInteger(Number(order.total_cents)) || Number(order.total_cents) <= 0
      || String(order.currency || 'usd').toUpperCase() !== 'USD') {
      return reply(409, { ok: false, error: 'AUTHORITATIVE_TOTAL_INVALID' });
    }
    if (payload.totalCents != null && Number(payload.totalCents) !== Number(order.total_cents)) {
      return reply(409, { ok: false, error: 'PAYPAL_AMOUNT_MISMATCH' });
    }

    const config = credentials();
    const accessToken = await token(config);

    if (order.paypal_order_id) {
      const existing = await retrieve(config.baseUrl, accessToken, order.paypal_order_id);
      if (!existing.ok) {
        await sql`
          UPDATE orders
             SET payment_reconciliation_status = 'required', updated_at = NOW()
           WHERE id = ${internalOrderId}
             AND status = 'pending'
        `;
        await safeRecordAttempt(sql, {
          internalOrderId,
          checkoutKey: order.checkout_idempotency_key,
          paypalOrderId: order.paypal_order_id,
          source: 'reconciliation',
          processingStatus: 'required',
          errorCode: `PAYPAL_ORDER_LOOKUP_${existing.status}`,
          raw: existing.data,
        });
        return reply(202, {
          ok: true,
          paymentStatusUnknown: true,
          reconciliationRequired: true,
          doNotRetry: true,
          paypalOrderId: order.paypal_order_id,
          internalOrderId,
          message: 'We are confirming your previous payment attempt. Do not submit another payment.',
        });
      }

      if (!matchesInternalOrder(existing.data, order)) {
        return reply(409, { ok: false, error: 'PAYPAL_ORDER_IDENTITY_MISMATCH' });
      }
      const completed = captureFromOrder(existing.data);
      if (completed || (order.status === 'paid' && order.paypal_capture_id)) {
        return reply(200, {
          ok: true,
          alreadyPaid: true,
          paymentCaptured: true,
          paypalOrderId: order.paypal_order_id,
          captureID: completed?.id || order.paypal_capture_id,
          internalOrderId,
        });
      }
      if (ACTIVE_ORDER_STATUSES.has(existing.data.status)) {
        return reply(200, {
          ok: true,
          reused: true,
          paypalOrderId: existing.data.id,
          internalOrderId,
        });
      }
      if (!['VOIDED', 'EXPIRED'].includes(String(existing.data.status || '').toUpperCase())) {
        return reply(409, { ok: false, error: 'PAYPAL_ORDER_NOT_REPLACEABLE' });
      }
    }

    const requestId = order.paypal_order_id
      ? `create-${internalOrderId}-after-${order.paypal_order_id}`.slice(0, 108)
      : `create-${internalOrderId}`;
    const shipping = shippingFromOrder(order);
    const purchaseUnit = {
      amount: {
        currency_code: 'USD',
        value: (Number(order.total_cents) / 100).toFixed(2),
      },
      description: getPayPalDescription(Array.isArray(payload.items) ? payload.items : []).slice(0, 127),
      custom_id: internalOrderId,
      invoice_id: `BOTF-${internalOrderId}`,
    };
    if (shipping) purchaseUnit.shipping = shipping;

    const body = {
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      application_context: {
        brand_name: 'Banners On The Fly',
        user_action: 'PAY_NOW',
        shipping_preference: shipping ? 'SET_PROVIDED_ADDRESS' : 'GET_FROM_FILE',
      },
    };

    const response = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'PayPal-Request-Id': requestId,
      },
      body: JSON.stringify(body),
    });
    const paypalOrder = await response.json().catch(() => ({}));
    const identity = orderIdentity(paypalOrder);

    await safeRecordAttempt(sql, {
      internalOrderId,
      checkoutKey: order.checkout_idempotency_key,
      paypalOrderId: paypalOrder.id,
      requestId,
      source: 'create',
      orderStatus: paypalOrder.status,
      amountCents: identity.amountCents,
      currency: identity.currency,
      invoiceId: identity.invoiceId,
      customId: identity.customId,
      processingStatus: response.ok ? 'created' : 'error',
      errorCode: response.ok ? null : 'PAYPAL_CREATE_FAILED',
      raw: paypalOrder,
    });

    if (!response.ok || !paypalOrder.id) {
      console.error('[paypal-create-order] PayPal rejected order creation', {
        status: response.status,
        name: paypalOrder?.name || null,
        message: paypalOrder?.message || null,
        details: paypalOrder?.details || null,
        debugId: paypalOrder?.debug_id || null,
      });
      return reply(502, {
        ok: false,
        error: 'PAYPAL_CREATE_FAILED',
        providerCode: paypalOrder?.details?.[0]?.issue || paypalOrder?.name || null,
        message: 'PayPal could not start checkout. Please try again.',
      });
    }

    const linked = await sql`
      UPDATE orders
         SET paypal_order_id = ${paypalOrder.id},
             payment_method = 'paypal',
             payment_reconciliation_status = 'awaiting_capture',
             updated_at = NOW()
       WHERE id = ${internalOrderId}
         AND status = 'pending'
         AND (paypal_order_id IS NULL OR paypal_order_id = ${order.paypal_order_id || null})
      RETURNING paypal_order_id
    `;
    if (linked.length) return reply(200, { ok: true, paypalOrderId: linked[0].paypal_order_id, internalOrderId });

    const winner = await sql`
      SELECT paypal_order_id, paypal_capture_id, status
        FROM orders
       WHERE id = ${internalOrderId}
       LIMIT 1
    `;
    if (winner[0]?.paypal_order_id) {
      return reply(200, {
        ok: true,
        reused: true,
        paypalOrderId: winner[0].paypal_order_id,
        internalOrderId,
      });
    }
    return reply(409, { ok: false, error: 'PAYPAL_ORDER_LINK_CONFLICT' });
  } catch (error) {
    console.error('[paypal-create-order] unexpected error', error);
    return reply(500, {
      ok: false,
      error: 'PAYPAL_CREATE_INTERNAL_ERROR',
      message: 'Secure checkout could not be started. Please try again.',
    });
  }
};

exports._test = { normalizeCustomerInfo, shippingFromOrder, retrieve };
