const { neon } = require('@neondatabase/serverless');
const { getPayPalDescription } = require('./product-display-helpers.cjs');
const { buildDetailedPayPalOrderRequest } = require('./paypal-order-details.cjs');
const { repriceStripeCart: repriceCheckoutCart } = require('../stripe-server-pricing.cjs');
const { constantTimeEqual } = require('../order-confirmation-token.cjs');
const {
  ACTIVE_ORDER_STATUSES,
  canBindPayPalOrder,
  captureFromOrder,
  matchesInternalOrder,
  orderIdentity,
  recordAttempt,
} = require('./paypal-payment-safety.cjs');

let neonFactory = neon;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

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
  if (!response.ok) throw new Error('PAYPAL_AUTH_FAILED');
  return (await response.json()).access_token;
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
  if (!response.ok) {
    const error = new Error(`PAYPAL_RETRIEVE_FAILED_${response.status}`);
    error.status = response.status;
    error.paypalData = data;
    throw error;
  }
  return data;
}

function hasCompleteLineItemDetails(paypalOrder, expectedItemsOrCount) {
  const items = paypalOrder?.purchase_units?.[0]?.items;
  const expectedItems = Array.isArray(expectedItemsOrCount) ? expectedItemsOrCount : null;
  const expectedItemCount = expectedItems ? expectedItems.length : expectedItemsOrCount;
  if (expectedItems) {
    if (!Array.isArray(items) || items.length !== expectedItems.length) return false;
    const receivedBySku = new Map(items.map((item) => [String(item?.sku || ''), item]));
    return expectedItems.every((expected) => {
      const item = receivedBySku.get(String(expected?.sku || ''));
      return item
        && item.name === expected.name
        && item.description === expected.description
        && item.quantity === expected.quantity
        && item.category === expected.category
        && item.unit_amount?.currency_code === expected.unit_amount?.currency_code
        && item.unit_amount?.value === expected.unit_amount?.value;
    });
  }
  return Array.isArray(items)
    && items.length === expectedItemCount
    && items.every((item) => {
      const description = String(item?.description || '');
      return String(item?.name || '').trim().length > 0
        && description.includes('Size:')
        && description.includes('Material:')
        && description.includes('Qty:');
    });
}

function hasCompleteOrderDetails(paypalOrder, expectedRequest) {
  const actualUnit = paypalOrder?.purchase_units?.[0];
  const expectedUnit = expectedRequest?.purchase_units?.[0];
  if (!actualUnit || !expectedUnit) return false;
  if (!hasCompleteLineItemDetails(paypalOrder, expectedUnit.items || [])) return false;
  const actualBreakdown = actualUnit.amount?.breakdown || {};
  const expectedBreakdown = expectedUnit.amount?.breakdown || {};
  const breakdownMatches = Object.entries(expectedBreakdown).every(([key, money]) => (
    actualBreakdown[key]?.currency_code === money.currency_code
      && actualBreakdown[key]?.value === money.value
  ));
  if (!breakdownMatches) return false;

  if (expectedUnit.shipping) {
    const actualShipping = actualUnit.shipping || {};
    const expectedAddress = expectedUnit.shipping.address || {};
    const actualAddress = actualShipping.address || {};
    if (actualShipping.name?.full_name !== expectedUnit.shipping.name?.full_name) return false;
    if (!Object.entries(expectedAddress).every(([key, value]) => actualAddress[key] === value)) return false;
  }
  return true;
}

function clean(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function persistedPayPalShipping(order) {
  const fullName = clean(order?.shipping_name || order?.customer_name, 300);
  const line1 = clean(order?.shipping_street, 300);
  const city = clean(order?.shipping_city, 120);
  const state = clean(order?.shipping_state, 300);
  const postalCode = clean(order?.shipping_zip, 60);
  const countryCode = clean(order?.shipping_country || 'US', 2)?.toUpperCase();
  if (!fullName || !line1 || !city || !state || !postalCode || !/^[A-Z]{2}$/.test(countryCode || '')) {
    return null;
  }
  const line2 = clean(order?.shipping_street2, 300);
  return {
    name: { full_name: fullName },
    address: {
      address_line_1: line1,
      ...(line2 ? { address_line_2: line2 } : {}),
      admin_area_2: city,
      admin_area_1: state,
      postal_code: postalCode,
      country_code: countryCode,
    },
  };
}

async function safeRecordAttempt(sql, attempt) {
  try {
    await recordAttempt(sql, attempt);
  } catch (error) {
    console.error('[paypal-create-order] could not record payment attempt', {
      internalOrderId: attempt.internalOrderId,
      paypalOrderId: attempt.paypalOrderId,
      error: error?.message,
    });
  }
}

async function lockForReconciliation(sql, order, error) {
  try {
    await sql`
      UPDATE orders
         SET payment_reconciliation_status = 'required', updated_at = NOW()
       WHERE id = ${order.id}
         AND status = 'pending'
    `;
  } catch (dbError) {
    console.error('[paypal-create-order] could not mark reconciliation required', {
      internalOrderId: order.id,
      error: dbError?.message,
    });
  }

  await safeRecordAttempt(sql, {
    internalOrderId: order.id,
    checkoutKey: order.checkout_idempotency_key,
    paypalOrderId: order.paypal_order_id,
    source: 'reconciliation',
    processingStatus: 'required',
    errorCode: 'PAYPAL_ORDER_LOOKUP_UNCERTAIN',
    errorMessage: error?.message || 'Unable to verify existing PayPal order',
    raw: error?.paypalData,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  if (process.env.FEATURE_PAYPAL !== '1') {
    return reply(503, {
      ok: false,
      error: 'PAYPAL_DISABLED',
      message: 'PayPal payments are temporarily unavailable.',
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { ok: false, error: 'INVALID_JSON' });
  }

  const internalOrderId = String(payload.internalOrderId || '').trim();
  if (!internalOrderId) return reply(400, { ok: false, error: 'INTERNAL_ORDER_REQUIRED' });

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });

  try {
    const sql = neonFactory(dbUrl);
    const rows = await sql`
      SELECT id, status, subtotal_cents, tax_cents, total_cents, currency,
             applied_discount_cents, same_day_fee_cents, saturday_fee_cents,
             0::integer AS shipping_cents, paypal_order_id, paypal_capture_id,
             stripe_payment_intent_id, payment_method, checkout_idempotency_key,
             email, customer_name, shipping_name, shipping_street,
             shipping_street2, shipping_city, shipping_state, shipping_zip,
             shipping_country
        FROM orders
       WHERE id = ${internalOrderId}
       LIMIT 1
    `;
    if (!rows.length) return reply(404, { ok: false, error: 'INTERNAL_ORDER_NOT_FOUND' });

    const order = rows[0];
    const checkoutKey = String(payload.checkoutKey || '').trim();
    if (!checkoutKey || !constantTimeEqual(checkoutKey, order.checkout_idempotency_key)) {
      return reply(401, { ok: false, error: 'CHECKOUT_CONFIRMATION_REQUIRED' });
    }
    if (!canBindPayPalOrder(order)) {
      return reply(409, {
        ok: false,
        error: 'PAYMENT_PROVIDER_CONFLICT',
        message: 'This order is already bound to another payment method.',
      });
    }
    if (!['pending', 'paid'].includes(order.status)) {
      return reply(409, { ok: false, error: 'INTERNAL_ORDER_NOT_PAYABLE' });
    }
    if (
      !Number.isInteger(Number(order.total_cents))
      || Number(order.total_cents) <= 0
      || String(order.currency || 'usd').toUpperCase() !== 'USD'
    ) {
      return reply(409, { ok: false, error: 'AUTHORITATIVE_TOTAL_INVALID' });
    }
    if (payload.totalCents != null && Number(payload.totalCents) !== Number(order.total_cents)) {
      return reply(409, { ok: false, error: 'PAYPAL_AMOUNT_MISMATCH' });
    }

    // Use the order items that were persisted before checkout. The browser
    // payload is intentionally not trusted here: it can be stale, incomplete,
    // or omitted on a retry, while these rows are the production source of
    // truth for the order and its customer-facing PayPal receipt.
    const persistedItems = await sql`
      SELECT id, product_type, width_in, height_in, quantity, material,
             grommets, rounded_corners, rope_feet, rope_placement,
             pole_pockets, pole_pocket_position, pole_pocket_size,
             line_total_cents, design_service_enabled,
             yard_sign_sidedness, yard_sign_step_stakes_enabled,
             yard_sign_step_stakes_qty, yard_sign_design_count,
             yard_sign_designs
        FROM order_items
       WHERE order_id = ${internalOrderId}
       ORDER BY created_at ASC, id ASC
    `;
    if (!persistedItems.length) {
      return reply(409, {
        ok: false,
        error: 'PAYPAL_ORDER_ITEMS_MISSING',
        message: 'The saved order items are unavailable. PayPal checkout was not started.',
      });
    }
    let authoritativeItems;
    try {
      authoritativeItems = repriceCheckoutCart(persistedItems);
    } catch (error) {
      return reply(error?.statusCode || 409, {
        ok: false,
        error: error?.code || 'PAYPAL_ORDER_ITEMS_INVALID',
        message: error?.message || 'The saved order items are no longer payable.',
        ...(error?.details ? { details: error.details } : {}),
      });
    }
    const lineMismatch = authoritativeItems.some((item, index) => (
      Number(item.line_total_cents) !== Number(persistedItems[index]?.line_total_cents)
    ));
    const rawMerchandiseSubtotalCents = authoritativeItems.reduce(
      (sum, item) => sum + Number(item.line_total_cents || 0),
      0,
    );
    const configuredMinimumCents = process.env.FEATURE_MIN_ORDER_FLOOR === '1'
      ? Math.max(0, Number.parseInt(process.env.MIN_ORDER_CENTS || '2000', 10) || 0)
      : 0;
    const expectedSubtotalCents = Math.max(rawMerchandiseSubtotalCents, configuredMinimumCents);
    const minimumOrderAdjustmentCents = expectedSubtotalCents - rawMerchandiseSubtotalCents;
    if (lineMismatch || Number(order.subtotal_cents || 0) !== expectedSubtotalCents) {
      return reply(409, {
        ok: false,
        error: 'STALE_CART_TOTAL',
        message: 'The saved order price is no longer current. Restart checkout before paying.',
        details: {
          restartCheckout: true,
          safeToRetry: false,
          serverMerchandiseSubtotalCents: rawMerchandiseSubtotalCents,
        },
      });
    }

    const serviceLabels = [
      Number(order.same_day_fee_cents || 0) > 0
        ? `Same-Day Hit $${(Number(order.same_day_fee_cents) / 100).toFixed(2)}`
        : null,
      Number(order.saturday_fee_cents || 0) > 0
        ? `Saturday Service $${(Number(order.saturday_fee_cents) / 100).toFixed(2)}`
        : null,
      minimumOrderAdjustmentCents > 0
        ? `Minimum Order Adjustment $${(minimumOrderAdjustmentCents / 100).toFixed(2)}`
        : null,
    ].filter(Boolean);
    const purchaseDescription = [
      serviceLabels.join(', '),
      getPayPalDescription(authoritativeItems),
    ].filter(Boolean).join(' | ').slice(0, 127);

    const paypalShipping = persistedPayPalShipping(order);
    if (!paypalShipping) {
      return reply(409, {
        ok: false,
        error: 'PAYPAL_SHIPPING_INCOMPLETE',
        message: 'Complete the shipping address before starting PayPal checkout.',
      });
    }

    const body = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: (Number(order.total_cents) / 100).toFixed(2),
        },
        description: purchaseDescription,
        custom_id: internalOrderId,
        invoice_id: `BOTF-${internalOrderId}`,
        shipping: paypalShipping,
      }],
      application_context: {
        brand_name: 'Banners On The Fly',
        user_action: 'PAY_NOW',
        shipping_preference: 'GET_FROM_FILE',
      },
    };
    const detailedBody = buildDetailedPayPalOrderRequest(body, authoritativeItems, {
      subtotalCents: rawMerchandiseSubtotalCents,
      taxCents: Number(order.tax_cents || 0),
      shippingCents: Number(order.shipping_cents || 0),
      discountCents: Number(order.applied_discount_cents || 0),
      handlingCents: minimumOrderAdjustmentCents
        + Number(order.same_day_fee_cents || 0)
        + Number(order.saturday_fee_cents || 0),
    });
    if (!detailedBody) {
      return reply(409, {
        ok: false,
        error: 'PAYPAL_LINE_ITEMS_INVALID',
        message: 'The saved order items could not produce a complete PayPal invoice.',
      });
    }

    const config = credentials();
    const accessToken = await token(config);

    if (order.paypal_order_id) {
      let existing;
      try {
        existing = await retrieve(config.baseUrl, accessToken, order.paypal_order_id);
      } catch (error) {
        console.error('[paypal-create-order] existing PayPal order lookup is uncertain', {
          internalOrderId,
          paypalOrderId: order.paypal_order_id,
          status: error?.status || null,
          error: error?.message,
        });
        await lockForReconciliation(sql, order, error);
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

      if (!matchesInternalOrder(existing, order)) {
        return reply(409, { ok: false, error: 'PAYPAL_ORDER_IDENTITY_MISMATCH' });
      }

      const completed = captureFromOrder(existing);
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

      if (ACTIVE_ORDER_STATUSES.has(existing.status)) {
        if (hasCompleteOrderDetails(existing, detailedBody)) {
          return reply(200, {
            ok: true,
            reused: true,
            paypalOrderId: existing.id,
            internalOrderId,
          });
        }

        // An unpaid legacy PayPal order may have been created by the old
        // summary-only fallback. It is safe to replace because no completed
        // capture exists, and the conditional database update below prevents
        // a stale provider order from winning the link race.
        console.warn('[paypal-create-order] replacing active PayPal order without complete line items', {
          internalOrderId,
          paypalOrderId: existing.id,
          status: existing.status,
        });
      }

      if (!ACTIVE_ORDER_STATUSES.has(existing.status) && !['VOIDED', 'EXPIRED'].includes(existing.status)) {
        return reply(409, { ok: false, error: 'PAYPAL_ORDER_NOT_REPLACEABLE' });
      }
    }

    const requestId = order.paypal_order_id
      ? `create-${internalOrderId}-after-${order.paypal_order_id}`.slice(0, 108)
      : `create-${internalOrderId}`;

    const requestHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
      'PayPal-Request-Id': requestId,
    };
    const response = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(detailedBody),
    });

    const paypalOrder = await response.json().catch(() => ({}));
    const hasCompleteItems = hasCompleteOrderDetails(paypalOrder, detailedBody);
    const identityMatches = matchesInternalOrder(paypalOrder, order);
    const creationAccepted = response.ok
      && Boolean(paypalOrder.id)
      && hasCompleteItems
      && identityMatches;
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
      processingStatus: creationAccepted ? 'created' : 'error',
      errorCode: !response.ok
        ? 'PAYPAL_CREATE_FAILED'
        : !identityMatches
          ? 'PAYPAL_ORDER_IDENTITY_MISMATCH'
          : hasCompleteItems
            ? null
            : 'PAYPAL_LINE_ITEMS_MISSING',
      raw: paypalOrder,
    });

    if (!creationAccepted) {
      console.error('[paypal-create-order] PayPal rejected order creation', {
        status: response.status,
        name: paypalOrder?.name || null,
        message: paypalOrder?.message || null,
        details: paypalOrder?.details || null,
        debugId: paypalOrder?.debug_id || null,
      });
      return reply(502, {
        ok: false,
        error: response.ok
          ? (identityMatches ? 'PAYPAL_LINE_ITEMS_MISSING' : 'PAYPAL_ORDER_IDENTITY_MISMATCH')
          : 'PAYPAL_CREATE_FAILED',
        providerCode: paypalOrder?.details?.[0]?.issue || paypalOrder?.name || null,
        message: response.ok
          ? (identityMatches
            ? 'PayPal did not preserve the complete invoice details. Checkout was not started.'
            : 'PayPal returned an order that did not match this checkout. Checkout was not started.')
          : 'PayPal could not start checkout. Please try again.',
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
         AND (payment_method IS NULL OR payment_method = 'paypal')
         AND stripe_payment_intent_id IS NULL
         AND (paypal_order_id IS NULL OR paypal_order_id = ${order.paypal_order_id || null})
      RETURNING paypal_order_id
    `;

    if (linked.length) {
      return reply(200, {
        ok: true,
        paypalOrderId: linked[0].paypal_order_id,
        internalOrderId,
      });
    }

    const winner = await sql`
      SELECT paypal_order_id, paypal_capture_id, stripe_payment_intent_id,
             payment_method, status
        FROM orders
       WHERE id = ${internalOrderId}
       LIMIT 1
    `;
    if (winner[0]?.paypal_order_id
        && !winner[0]?.stripe_payment_intent_id
        && String(winner[0]?.payment_method || 'paypal').toLowerCase() === 'paypal') {
      return reply(200, {
        ok: true,
        reused: true,
        paypalOrderId: winner[0].paypal_order_id,
        internalOrderId,
      });
    }

    return reply(409, { ok: false, error: 'PAYPAL_ORDER_LINK_CONFLICT' });
  } catch (error) {
    console.error('[paypal-create-order]', error);
    return reply(500, {
      ok: false,
      error: 'PAYPAL_CREATE_INTERNAL_ERROR',
      message: 'Secure checkout could not be started. Please try again.',
    });
  }
};

exports._test = {
  hasCompleteLineItemDetails,
  hasCompleteOrderDetails,
  persistedPayPalShipping,
  retrieve,
  resetNeonFactory() {
    neonFactory = neon;
  },
  setNeonFactory(factory) {
    neonFactory = factory;
  },
};
