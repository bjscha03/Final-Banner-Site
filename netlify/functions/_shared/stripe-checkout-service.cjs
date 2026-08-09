'use strict';

const crypto = require('crypto');
const createOrderModule = require('./legacy/create-order-core.cjs');
const { repriceStripeCart } = require('./stripe-server-pricing.cjs');
const discountReservation = require('./payment-discount-reservation.cjs');
const { constantTimeEqual, createPaidOrderConfirmationToken } = require('./order-confirmation-token.cjs');
const { queuePaidOrderFollowups } = require('./paid-order-followups.cjs');

const SETTLED_ORDER_STATUSES = new Set(['paid', 'in_production', 'shipped', 'delivered', 'fulfilled']);
const REUSABLE_INTENT_STATUSES = new Set(['requires_action', 'processing', 'succeeded']);
const STRIPE_MIN_AMOUNT_CENTS = 50;
const STRIPE_MAX_AMOUNT_CENTS = 99_999_999;

class StripeCheckoutError extends Error {
  constructor(code, message, statusCode = 500, details = {}) {
    super(message);
    this.name = 'StripeCheckoutError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function checkoutError(code, message, statusCode, details) {
  throw new StripeCheckoutError(code, message, statusCode, details);
}

function cleanText(value, max = 255) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

function cleanEmail(value) {
  const email = cleanText(value, 320)?.toLowerCase() || null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeAddress(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const nested = source.address && typeof source.address === 'object' ? source.address : {};
  return {
    name: cleanText(source.name || source.fullName, 160),
    line1: cleanText(source.line1 || source.street || nested.line1 || nested.street, 200),
    line2: cleanText(source.line2 || source.street2 || nested.line2 || nested.street2, 200),
    city: cleanText(source.city || nested.city, 100),
    state: cleanText(source.state || source.region || nested.state || nested.region, 100),
    postalCode: cleanText(
      source.postalCode || source.postal_code || source.zip || nested.postalCode || nested.postal_code || nested.zip,
      30,
    ),
    country: cleanText(source.country || nested.country || 'US', 2)?.toUpperCase() || 'US',
  };
}

function tokenBillingDetails(token) {
  return token?.payment_method_preview?.billing_details
    || token?.payment_method_preview?.billingDetails
    || {};
}

function tokenShipping(token) {
  const shipping = token?.shipping || {};
  return {
    ...shipping,
    ...(shipping.address || {}),
  };
}

function normalizeCustomer(input, confirmationToken) {
  const customer = input?.customer || input?.customerInfo || {};
  const billing = tokenBillingDetails(confirmationToken);
  const submittedShipping = input?.shippingAddress || customer?.shippingAddress || {};
  const shipping = normalizeAddress(Object.keys(submittedShipping).length ? submittedShipping : tokenShipping(confirmationToken));
  shipping.name ||= cleanText(customer.fullName || customer.name || input?.customer_name || billing.name, 160);
  const email = cleanEmail(customer.email || input?.email || billing.email);
  const fullName = cleanText(customer.fullName || customer.name || input?.customer_name || shipping.name || billing.name, 160);
  const phone = cleanText(customer.phone || input?.customer_phone || billing.phone, 40);

  if (!email) checkoutError('CUSTOMER_EMAIL_REQUIRED', 'Enter a valid email address.', 400);
  if (!fullName) checkoutError('CUSTOMER_NAME_REQUIRED', 'Enter the name for this order.', 400);
  if (!phone || phone.replace(/\D/g, '').length < 7) {
    checkoutError('CUSTOMER_PHONE_REQUIRED', 'Enter a valid phone number.', 400);
  }
  if (!shipping.name) shipping.name = fullName;
  if (!shipping.line1 || !shipping.city || !shipping.state || !shipping.postalCode) {
    checkoutError('SHIPPING_ADDRESS_REQUIRED', 'Enter a complete shipping address.', 400);
  }
  if (shipping.country !== 'US') {
    checkoutError('SHIPPING_COUNTRY_UNSUPPORTED', 'Checkout currently supports United States shipping addresses.', 409);
  }
  return {
    email,
    fullName,
    firstName: fullName.split(/\s+/)[0],
    phone,
    shipping,
  };
}

function validateCheckoutKey(value) {
  const key = cleanText(value, 160);
  if (!key || key.length < 16 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    checkoutError('CHECKOUT_KEY_INVALID', 'Restart checkout and try again.', 400);
  }
  return key;
}

function checkoutKeyHash(checkoutKey) {
  return crypto.createHash('sha256').update(String(checkoutKey)).digest('hex');
}

function stripeOrderReference(orderId) {
  const suffix = String(orderId || '').replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
  return `BOTF-${suffix || 'ORDER'}`;
}

function stripeItemReference(item, index) {
  const quantity = Math.max(1, Number(item?.quantity || 1));
  const product = cleanText(item?.product_type || item?.productType || 'banner', 50) || 'banner';
  const width = Number(item?.width_in || item?.widthIn || 0);
  const height = Number(item?.height_in || item?.heightIn || 0);
  const parts = [
    `${index + 1}. ${product}`,
    width > 0 && height > 0 ? `${width}x${height}in` : null,
    cleanText(item?.material, 80) || null,
    `qty ${quantity}`,
  ];

  if (product === 'banner') {
    parts.push(`grommets ${cleanText(item?.grommets || 'none', 50)}`);
    if (item?.rope_placement) {
      parts.push(`rope ${cleanText(item.rope_placement, 30)} ${Number(item.rope_feet || 0)}ft`);
    }
    const pocket = item?.pole_pocket_position || item?.pole_pockets;
    if (pocket && pocket !== 'none') {
      parts.push(`pocket ${cleanText(pocket, 30)} ${cleanText(item?.pole_pocket_size || '2', 10)}in`);
    }
  } else if (product === 'yard_sign') {
    parts.push(`${cleanText(item?.yard_sign_sidedness || 'single', 20)} sided`);
    parts.push(`stakes ${Number(item?.yard_sign_step_stakes_qty || 0)}`);
    parts.push(`designs ${Number(item?.yard_sign_design_count || 0)}`);
  } else if (product === 'car_magnet') {
    parts.push(`corners ${cleanText(item?.rounded_corners || 'none', 30)}`);
  }

  parts.push(`line ${Number(item?.line_total_cents || 0)}c`);
  return parts.filter(Boolean).join(' | ').slice(0, 500);
}

function stripeOrderMetadata(order, items = []) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const unitCount = normalizedItems.reduce(
    (sum, item) => sum + Math.max(1, Number(item?.quantity || 1)),
    0,
  );
  const itemReferences = normalizedItems.slice(0, 10).map(stripeItemReference);
  const itemSummary = itemReferences.join('; ').slice(0, 500);
  const itemMetadata = Object.fromEntries(
    itemReferences.map((value, index) => [`item_${String(index + 1).padStart(2, '0')}`, value]),
  );

  return {
    bof_checkout: 'v2',
    internal_order_id: String(order.id),
    order_reference: stripeOrderReference(order.id),
    item_count: String(normalizedItems.length),
    unit_count: String(unitCount),
    item_summary: itemSummary || 'Banners On The Fly order',
    ...itemMetadata,
    subtotal_cents: String(Number(order.subtotal_cents || 0)),
    tax_cents: String(Number(order.tax_cents || 0)),
    discount_cents: String(Number(order.applied_discount_cents || 0)),
    same_day_fee_cents: String(Number(order.same_day_fee_cents || 0)),
    saturday_fee_cents: String(Number(order.saturday_fee_cents || 0)),
  };
}

function stripePaymentDescription(order, items = []) {
  const metadata = stripeOrderMetadata(order, items);
  return `Banners On The Fly ${stripeOrderReference(order.id)} — ${metadata.item_summary}`.slice(0, 500);
}

function validateExpectedTotal(value) {
  const total = Number(value);
  if (!Number.isSafeInteger(total)
      || total < STRIPE_MIN_AMOUNT_CENTS
      || total > STRIPE_MAX_AMOUNT_CENTS) {
    checkoutError('EXPECTED_TOTAL_INVALID', 'Refresh checkout and review the order total.', 400);
  }
  return total;
}

function validateStripeAmount(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)
      || amount < STRIPE_MIN_AMOUNT_CENTS
      || amount > STRIPE_MAX_AMOUNT_CENTS) {
    checkoutError(
      'ORDER_AMOUNT_UNSUPPORTED',
      'This order total cannot be paid online. Contact us for a custom quote.',
      409,
    );
  }
  return amount;
}

function stripeIdempotencyKey(orderId, confirmationTokenId, previousIntentId = null) {
  const digest = crypto.createHash('sha256')
    .update(`${orderId}:${confirmationTokenId}:${previousIntentId || 'initial'}`)
    .digest('hex');
  return `bof-pi-${digest}`;
}

function stripeConfirmationIdempotencyKey(orderId, confirmationTokenId) {
  const digest = crypto.createHash('sha256')
    .update(`${orderId}:${confirmationTokenId}`)
    .digest('hex');
  return `bof-confirm-${digest}`;
}

function parseFunctionPayload(response) {
  try {
    return JSON.parse(response?.body || '{}');
  } catch {
    return {};
  }
}

async function createPendingOrderDirect({ input, items, customer, checkoutKey, mode }) {
  const discountCode = input?.discountCode?.code || input?.discount_code || input?.coupon || null;
  const orderData = {
    user_id: input?.userId || input?.user_id || null,
    email: customer.email,
    customer_name: customer.fullName,
    customer_first_name: customer.firstName,
    customer_phone: customer.phone,
    shipping_name: customer.shipping.name,
    shipping_street: customer.shipping.line1,
    shipping_street2: customer.shipping.line2,
    shipping_city: customer.shipping.city,
    shipping_state: customer.shipping.state,
    shipping_zip: customer.shipping.postalCode,
    shipping_country: customer.shipping.country,
    shippingAddress: {
      name: customer.shipping.name,
      street: customer.shipping.line1,
      street2: customer.shipping.line2,
      city: customer.shipping.city,
      state: customer.shipping.state,
      zip: customer.shipping.postalCode,
      country: customer.shipping.country,
    },
    currency: 'usd',
    payment_method: 'stripe',
    payment_status: 'pending',
    checkout_idempotency_key: checkoutKey,
    items,
    discountCode: discountCode ? { code: String(discountCode) } : null,
    sameDayHitService: input?.sameDayHitService === true,
    saturdayDelivery: input?.saturdayDelivery === true,
    attribution: input?.attribution || null,
  };
  const response = await createOrderModule.handler(
    { httpMethod: 'POST', headers: {}, body: JSON.stringify(orderData) },
    createOrderModule.createTrustedStripeContext(mode),
  );
  const payload = parseFunctionPayload(response);
  const statusCode = Number(response?.statusCode || 500);
  if (statusCode >= 400 || !payload?.orderId) {
    const publicMessage = typeof payload?.message === 'string'
      ? payload.message
      : typeof payload?.details === 'string'
        ? payload.details
        : (payload?.code && typeof payload?.error === 'string' ? payload.error : null);
    checkoutError(
      payload?.code || payload?.error || 'ORDER_CREATE_FAILED',
      statusCode < 500
        ? (publicMessage || 'The order could not be safely saved before payment.')
        : 'The order could not be safely saved before payment.',
      statusCode,
      payload?.integrity || {},
    );
  }
  return payload;
}

async function loadStripeOrder(sql, { orderId, checkoutKey, paymentIntentId } = {}) {
  let rows;
  if (paymentIntentId) {
    rows = await sql`
      SELECT id, user_id, status, subtotal_cents, tax_cents, total_cents, email,
             customer_name, customer_phone, shipping_name, shipping_street,
             shipping_street2, shipping_city, shipping_state, shipping_zip,
             shipping_country, discount_code, applied_discount_cents,
             applied_discount_label, applied_discount_type, 0::integer AS shipping_cents,
             same_day_fee_cents, saturday_fee_cents, checkout_idempotency_key,
             stripe_payment_intent_id, stripe_charge_id, stripe_wallet_type,
             paypal_order_id, paypal_capture_id, payment_method, payment_reconciliation_status,
             to_jsonb(orders)->>'confirmation_email_status' AS confirmation_email_status,
             to_jsonb(orders)->>'admin_notification_status' AS admin_notification_status,
             is_test_order, created_at
        FROM orders
       WHERE stripe_payment_intent_id = ${paymentIntentId}
       LIMIT 1
    `;
  } else if (orderId) {
    rows = await sql`
      SELECT id, user_id, status, subtotal_cents, tax_cents, total_cents, email,
             customer_name, customer_phone, shipping_name, shipping_street,
             shipping_street2, shipping_city, shipping_state, shipping_zip,
             shipping_country, discount_code, applied_discount_cents,
             applied_discount_label, applied_discount_type, 0::integer AS shipping_cents,
             same_day_fee_cents, saturday_fee_cents, checkout_idempotency_key,
             stripe_payment_intent_id, stripe_charge_id, stripe_wallet_type,
             paypal_order_id, paypal_capture_id, payment_method, payment_reconciliation_status,
             to_jsonb(orders)->>'confirmation_email_status' AS confirmation_email_status,
             to_jsonb(orders)->>'admin_notification_status' AS admin_notification_status,
             is_test_order, created_at
        FROM orders
       WHERE id = ${orderId}
       LIMIT 1
    `;
  } else if (checkoutKey) {
    rows = await sql`
      SELECT id, user_id, status, subtotal_cents, tax_cents, total_cents, email,
             customer_name, customer_phone, shipping_name, shipping_street,
             shipping_street2, shipping_city, shipping_state, shipping_zip,
             shipping_country, discount_code, applied_discount_cents,
             applied_discount_label, applied_discount_type, 0::integer AS shipping_cents,
             same_day_fee_cents, saturday_fee_cents, checkout_idempotency_key,
             stripe_payment_intent_id, stripe_charge_id, stripe_wallet_type,
             paypal_order_id, paypal_capture_id, payment_method, payment_reconciliation_status,
             to_jsonb(orders)->>'confirmation_email_status' AS confirmation_email_status,
             to_jsonb(orders)->>'admin_notification_status' AS admin_notification_status,
             is_test_order, created_at
        FROM orders
       WHERE checkout_idempotency_key = ${checkoutKey}
       LIMIT 1
    `;
  } else {
    return null;
  }
  const order = rows[0] || null;
  if (!order) return null;
  if (checkoutKey && !constantTimeEqual(checkoutKey, order.checkout_idempotency_key)) return null;
  return order;
}

function verifyIntentBinding(intent, order, checkoutKey) {
  if (!intent || !order) checkoutError('PAYMENT_BINDING_MISSING', 'Payment verification failed.', 500);
  if (String(intent.currency || '').toLowerCase() !== 'usd') {
    checkoutError('PAYMENT_CURRENCY_MISMATCH', 'Payment currency does not match this order.', 409);
  }
  if (Number(intent.amount) !== Number(order.total_cents)) {
    checkoutError('PAYMENT_AMOUNT_MISMATCH', 'The order total changed before payment. Review the total and try again.', 409, {
      orderTotalCents: Number(order.total_cents),
    });
  }
  const metadata = intent.metadata || {};
  if (!constantTimeEqual(metadata.internal_order_id, order.id) || metadata.bof_checkout !== 'v2') {
    checkoutError('PAYMENT_ORDER_MISMATCH', 'Payment verification failed.', 409);
  }
  if (checkoutKey && !constantTimeEqual(metadata.checkout_key_hash, checkoutKeyHash(checkoutKey))) {
    checkoutError('PAYMENT_CHECKOUT_MISMATCH', 'This payment belongs to another checkout session.', 409);
  }
  return true;
}

function intentShipping(customer) {
  return {
    name: customer.shipping.name,
    phone: customer.phone,
    address: {
      line1: customer.shipping.line1,
      line2: customer.shipping.line2 || undefined,
      city: customer.shipping.city,
      state: customer.shipping.state,
      postal_code: customer.shipping.postalCode,
      country: customer.shipping.country,
    },
  };
}

function comparableText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function canonicalCustomerFromOrder(order) {
  return {
    email: cleanEmail(order?.email),
    fullName: cleanText(order?.customer_name || order?.shipping_name, 160),
    phone: cleanText(order?.customer_phone, 40),
    shipping: {
      name: cleanText(order?.shipping_name || order?.customer_name, 160),
      line1: cleanText(order?.shipping_street, 200),
      line2: cleanText(order?.shipping_street2, 200),
      city: cleanText(order?.shipping_city, 100),
      state: cleanText(order?.shipping_state, 100),
      postalCode: cleanText(order?.shipping_zip, 30),
      country: cleanText(order?.shipping_country || 'US', 2)?.toUpperCase() || 'US',
    },
  };
}

function pendingCustomerDetailsMatch(order, customer) {
  const canonical = canonicalCustomerFromOrder(order);
  const textPairs = [
    [canonical.fullName, customer?.fullName],
    [canonical.shipping.name, customer?.shipping?.name],
    [canonical.shipping.line1, customer?.shipping?.line1],
    [canonical.shipping.line2, customer?.shipping?.line2],
    [canonical.shipping.city, customer?.shipping?.city],
    [canonical.shipping.state, customer?.shipping?.state],
    [canonical.shipping.postalCode, customer?.shipping?.postalCode],
    [canonical.shipping.country, customer?.shipping?.country],
  ];
  if (textPairs.some(([left, right]) => comparableText(left) !== comparableText(right))) return false;
  return String(canonical.phone || '').replace(/\D/g, '')
    === String(customer?.phone || '').replace(/\D/g, '');
}

function canonicalQuoteForCheckout(items, order) {
  return {
    items: items.map((item, index) => ({
      index,
      cartItemId: cleanText(item?.id, 160),
      productType: item?.product_type || 'banner',
      unitPriceCents: Number(item?.unit_price_cents || 0),
      lineTotalCents: Number(item?.line_total_cents || 0),
      ropeFeet: Number(item?.rope_feet || 0),
      ropeCostCents: Number(item?.rope_cost_cents || 0),
      polePocketCostCents: Number(item?.pole_pocket_cost_cents || 0),
      yardSignSignsSubtotalCents: Number(item?.yard_sign_signs_subtotal_cents || 0),
      yardSignStakesSubtotalCents: Number(item?.yard_sign_stakes_subtotal_cents || 0),
    })),
    subtotalCents: Number(order?.subtotal_cents || 0),
    taxCents: Number(order?.tax_cents || 0),
    shippingCents: Number(order?.shipping_cents || 0),
    totalCents: Number(order?.total_cents || 0),
    appliedDiscountCents: Number(order?.applied_discount_cents || 0),
    appliedDiscountLabel: order?.applied_discount_label || '',
    appliedDiscountType: order?.applied_discount_type || 'none',
    discountCode: order?.discount_code || null,
    sameDayFeeCents: Number(order?.same_day_fee_cents || 0),
    saturdayFeeCents: Number(order?.saturday_fee_cents || 0),
  };
}

async function attachPaymentIntent(sql, { order, checkoutKey, previousIntentId, intentId }) {
  const updated = await sql`
    UPDATE orders
       SET stripe_payment_intent_id = ${intentId},
           payment_method = 'stripe',
           payment_reconciliation_status = 'awaiting_confirmation',
           updated_at = NOW()
     WHERE id = ${order.id}
       AND status = 'pending'
       AND checkout_idempotency_key = ${checkoutKey}
       AND total_cents = ${Number(order.total_cents)}
       AND payment_method = 'stripe'
       AND paypal_order_id IS NULL
       AND paypal_capture_id IS NULL
       AND (${previousIntentId || null}::text IS NULL
            AND stripe_payment_intent_id IS NULL
            OR stripe_payment_intent_id = ${previousIntentId || null})
    RETURNING id, stripe_payment_intent_id
  `;
  return updated[0] || null;
}

async function safeCancelIntent(stripe, intentId) {
  if (!intentId) return;
  try {
    await stripe.paymentIntents.cancel(intentId);
  } catch (error) {
    console.warn('[stripe-checkout] could not cancel unattached PaymentIntent', {
      paymentIntentId: intentId,
      error: error?.message || String(error),
    });
  }
}

async function claimOrderDiscountForPayment(sql, order) {
  const result = await discountReservation.claimPaymentDiscount(sql, order);
  if (!result.ok) {
    checkoutError('CHECKOUT_DETAILS_CHANGED', result.message, 409, result.details);
  }
  return result;
}

async function releaseOrderDiscountClaim(sql, order, reconciliationStatus = 'payment_failed') {
  return discountReservation.releasePaymentDiscount(sql, order, reconciliationStatus);
}

async function safeReleaseOrderDiscountClaim(sql, order, reconciliationStatus = 'payment_failed') {
  try {
    await releaseOrderDiscountClaim(sql, order, reconciliationStatus);
  } catch (error) {
    // A failed release cannot create a duplicate charge: same-order retries
    // remain allowed and other orders stay blocked until recovery/reclamation.
    console.error('[stripe-checkout] discount reservation release failed', {
      orderId: order?.id || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }
}

async function confirmBoundPaymentIntent({ stripe, sql, order, intent, confirmationTokenId }) {
  try {
    await claimOrderDiscountForPayment(sql, order);
  } catch (error) {
    if (error instanceof StripeCheckoutError && error.code === 'CHECKOUT_DETAILS_CHANGED') {
      await safeCancelIntent(stripe, intent.id);
      await safeReleaseOrderDiscountClaim(sql, order, 'canceled');
    }
    throw error;
  }
  try {
    const confirmed = await stripe.paymentIntents.confirm(intent.id, {
      confirmation_token: confirmationTokenId,
      use_stripe_sdk: true,
    }, {
      idempotencyKey: stripeConfirmationIdempotencyKey(order.id, confirmationTokenId),
    });
    if (['requires_payment_method', 'canceled'].includes(confirmed?.status)) {
      await safeReleaseOrderDiscountClaim(
        sql,
        order,
        confirmed.status === 'canceled' ? 'canceled' : 'payment_failed',
      );
      checkoutError(
        'PAYMENT_CONFIRMATION_FAILED',
        'Payment was not completed. Check the payment details and try again.',
        402,
        {
          orderId: order.id,
          paymentIntentId: intent.id,
          status: confirmed.status,
          providerCode: confirmed?.last_payment_error?.code || null,
          declineCode: confirmed?.last_payment_error?.decline_code || null,
        },
      );
    }
    if (!REUSABLE_INTENT_STATUSES.has(confirmed?.status)) {
      checkoutError(
        'PAYMENT_CONFIRMATION_UNKNOWN',
        'The payment is still being verified. Do not submit another payment.',
        503,
        {
          orderId: order.id,
          paymentIntentId: intent.id,
          status: confirmed?.status || null,
          paymentStatusUnknown: true,
          doNotRetry: true,
        },
      );
    }
    return confirmed;
  } catch (error) {
    if (error instanceof StripeCheckoutError) throw error;
    const providerIntent = error?.payment_intent || error?.paymentIntent || null;
    const providerStatus = String(providerIntent?.status || '').toLowerCase();
    if (providerIntent?.id === intent.id && ['requires_payment_method', 'canceled'].includes(providerStatus)) {
      await safeReleaseOrderDiscountClaim(
        sql,
        order,
        providerStatus === 'canceled' ? 'canceled' : 'payment_failed',
      );
      checkoutError(
        'PAYMENT_CONFIRMATION_FAILED',
        error?.message || 'Payment was not completed. Check the payment details and try again.',
        402,
        {
          orderId: order.id,
          paymentIntentId: intent.id,
          status: providerStatus,
          providerCode: error?.code || providerIntent?.last_payment_error?.code || null,
          declineCode: error?.decline_code || providerIntent?.last_payment_error?.decline_code || null,
        },
      );
    }
    // The confirmation request may have reached Stripe even when the network
    // response did not reach us. The order is already bound to this Intent, so
    // preserve that binding and force status recovery instead of allowing a
    // second payment attempt.
    checkoutError(
      'PAYMENT_CONFIRMATION_UNKNOWN',
      'The payment is still being verified. Do not submit another payment.',
      503,
      {
        orderId: order.id,
        paymentIntentId: intent.id,
        status: providerStatus || null,
        paymentStatusUnknown: true,
        doNotRetry: true,
        providerCode: error?.code || null,
      },
    );
  }
}

async function createOrReusePaymentIntent({ stripe, sql, order, confirmationTokenId, checkoutKey, customer, items = [] }) {
  let previousIntentId = order.stripe_payment_intent_id || null;
  if (previousIntentId) {
    let existing;
    try {
      existing = await stripe.paymentIntents.retrieve(previousIntentId);
    } catch (error) {
      checkoutError(
        'PAYMENT_STATUS_UNKNOWN',
        'The existing payment is still being verified. Do not submit another payment.',
        503,
        {
          orderId: order.id,
          paymentIntentId: previousIntentId,
          paymentStatusUnknown: true,
          doNotRetry: true,
          providerCode: error?.code || null,
        },
      );
    }
    try {
      verifyIntentBinding(existing, order, checkoutKey);
    } catch (error) {
      checkoutError(
        'PAYMENT_BINDING_INVALID',
        'The existing payment needs manual verification. Do not submit another payment.',
        503,
        {
          orderId: order.id,
          paymentIntentId: previousIntentId,
          status: existing?.status || null,
          bindingError: error?.code || null,
          paymentStatusUnknown: true,
          doNotRetry: true,
        },
      );
    }
    if (REUSABLE_INTENT_STATUSES.has(existing.status)) return existing;
    if (['requires_confirmation', 'requires_payment_method'].includes(existing.status)) {
      // Keep one durable provider binding across payment-method retries. A
      // PaymentIntent can settle at most once, so retrying confirmation on the
      // same Intent is safer than displacing it while an older browser still
      // holds its client secret.
      let enriched = existing;
      try {
        enriched = await stripe.paymentIntents.update(existing.id, {
          description: stripePaymentDescription(order, items),
          metadata: {
            ...stripeOrderMetadata(order, items),
            checkout_key_hash: checkoutKeyHash(checkoutKey),
          },
        });
        verifyIntentBinding(enriched, order, checkoutKey);
      } catch (error) {
        checkoutError(
          'PAYMENT_REFERENCE_UPDATE_FAILED',
          'Payment details could not be prepared. No charge was attempted; try again.',
          503,
          {
            orderId: order.id,
            paymentIntentId: existing.id,
            status: existing.status,
            safeToRetry: true,
            providerCode: error?.code || null,
          },
        );
      }
      return confirmBoundPaymentIntent({ stripe, sql, order, intent: enriched, confirmationTokenId });
    }
    if (existing.status !== 'canceled') {
      checkoutError('PAYMENT_ALREADY_IN_PROGRESS', 'This payment is already being processed. Do not submit another payment.', 503, {
        orderId: order.id,
        paymentIntentId: existing.id,
        status: existing.status,
        paymentStatusUnknown: true,
        doNotRetry: true,
      });
    }
  }

  const intent = await stripe.paymentIntents.create({
    amount: Number(order.total_cents),
    currency: 'usd',
    capture_method: 'automatic',
    payment_method_types: ['card'],
    description: stripePaymentDescription(order, items),
    metadata: {
      ...stripeOrderMetadata(order, items),
      checkout_key_hash: checkoutKeyHash(checkoutKey),
    },
    shipping: intentShipping(customer),
  }, {
    idempotencyKey: stripeIdempotencyKey(order.id, confirmationTokenId, previousIntentId),
  });

  try {
    verifyIntentBinding(intent, order, checkoutKey);
  } catch (error) {
    // A just-created, unconfirmed Intent is safe to cancel. This is defensive
    // against an unexpected provider/idempotency response and prevents an
    // invalid reference from ever being attached to the order.
    await safeCancelIntent(stripe, intent?.id);
    checkoutError('PAYMENT_INTENT_INVALID', 'Payment setup could not be verified. Please try again.', 503, {
      bindingError: error?.code || null,
    });
  }

  let attached;
  let attachError = null;
  try {
    attached = await attachPaymentIntent(sql, {
      order,
      checkoutKey,
      previousIntentId,
      intentId: intent.id,
    });
  } catch (error) {
    attachError = error;
  }

  // The UPDATE result can be empty when two duplicate requests receive the
  // same Stripe idempotency result and race to attach it. A database response
  // can also be lost after the UPDATE committed. Reload before canceling: the
  // just-created Intent may already be the durable order binding, in which
  // case canceling it here would break the other request after a double tap.
  if (!attached || attached.stripe_payment_intent_id !== intent.id) {
    let currentOrder = null;
    let reloadFailed = false;
    try {
      currentOrder = await loadStripeOrder(sql, { orderId: order.id, checkoutKey });
    } catch {
      reloadFailed = true;
    }

    if (currentOrder?.stripe_payment_intent_id === intent.id) {
      attached = { id: currentOrder.id, stripe_payment_intent_id: intent.id };
    } else if (currentOrder?.stripe_payment_intent_id) {
      // Another, different Intent won the compare-and-set. This Intent was
      // never confirmed by this request, so it is safe to cancel.
      await safeCancelIntent(stripe, intent.id);
      checkoutError(
        'PAYMENT_ATTACH_CONFLICT',
        'Another payment attempt already owns this checkout. Refresh and try again.',
        409,
      );
    } else if (!reloadFailed) {
      // The write definitely did not become durable and confirmation has not
      // started, so cleanup is safe. Retrying the same checkout key remains
      // idempotent and cannot authorize a second charge.
      await safeCancelIntent(stripe, intent.id);
      checkoutError('PAYMENT_ATTACH_FAILED', 'Payment setup could not be saved. Please try again.', 503, {
        databaseCode: attachError?.code || null,
      });
    } else {
      // We cannot distinguish a committed write from a database outage. Do
      // not cancel and do not confirm. A retry with the same checkout key will
      // safely recover either state before it can authorize payment.
      checkoutError('PAYMENT_ATTACH_STATUS_UNKNOWN', 'Payment setup could not be verified. Please try again.', 503, {
        databaseCode: attachError?.code || null,
      });
    }
  }
  // Persist the exact provider binding before confirmation. A webhook can now
  // always recover the order even if this invocation stops after Stripe has
  // accepted the confirmation request.
  return confirmBoundPaymentIntent({
    stripe,
    sql,
    order: { ...order, stripe_payment_intent_id: intent.id },
    intent,
    confirmationTokenId,
    items,
  });
}

async function startStripeCheckout({ input, runtime, stripe, sql }) {
  const checkoutKey = validateCheckoutKey(input?.checkoutKey || input?.checkout_idempotency_key);
  const expectedTotal = validateExpectedTotal(input?.expectedTotalCents ?? input?.totalCents);
  const confirmationTokenId = cleanText(input?.confirmationTokenId || input?.confirmation_token, 255);
  if (!confirmationTokenId || !confirmationTokenId.startsWith('ctoken_')) {
    checkoutError('CONFIRMATION_TOKEN_REQUIRED', 'Payment details were not submitted. Try again.', 400);
  }
  const confirmationToken = await stripe.confirmationTokens.retrieve(confirmationTokenId);
  if (!confirmationToken || confirmationToken.livemode !== (runtime.mode === 'live')) {
    checkoutError('CONFIRMATION_TOKEN_MODE_MISMATCH', 'Payment details belong to the wrong Stripe environment.', 409);
  }
  const customer = normalizeCustomer(input, confirmationToken);
  const items = repriceStripeCart(input?.items || input?.cartItems);
  // Stripe accepts USD amounts from 50 through 99,999,999 cents. Enforce the
  // provider/database-safe ceiling before creating a pending order; the final
  // post-discount/service total is checked again from the canonical row.
  validateStripeAmount(items.reduce((sum, item) => sum + Number(item.line_total_cents || 0), 0));
  const pending = await createPendingOrderDirect({ input, items, customer, checkoutKey, mode: runtime.mode });
  let order = await loadStripeOrder(sql, { orderId: pending.orderId, checkoutKey });
  if (!order) checkoutError('PENDING_ORDER_NOT_FOUND', 'The saved order could not be verified.', 500);

  validateStripeAmount(Number(order.total_cents));

  if (expectedTotal !== Number(order.total_cents)) {
    checkoutError('STALE_CART_TOTAL', 'Your order total changed. Review the updated total before paying.', 409, {
      restartCheckout: true,
      safeToRetry: false,
      bindingState: 'restart_required',
      serverTotalCents: Number(order.total_cents),
      canonicalQuote: canonicalQuoteForCheckout(items, order),
    });
  }
  const orderIsTest = order.is_test_order === true || order.is_test_order === 'true';
  if (orderIsTest !== (runtime.mode === 'test')) {
    checkoutError('ORDER_MODE_MISMATCH', 'This order belongs to a different payment environment.', 409);
  }
  if (SETTLED_ORDER_STATUSES.has(String(order.status || '').toLowerCase())) {
    return { alreadyPaid: true, order };
  }
  if (String(order.status || '').toLowerCase() !== 'pending') {
    checkoutError('ORDER_NOT_PAYABLE', 'This order can no longer be paid.', 409);
  }
  if (String(order.payment_method || '').toLowerCase() !== 'stripe'
      || order.paypal_order_id
      || order.paypal_capture_id) {
    checkoutError('ORDER_PAYMENT_METHOD_MISMATCH', 'This checkout is bound to another payment method.', 409);
  }

  // The legacy order idempotency guard predates wallet checkout and binds
  // items/amount/email, but not all fulfillment fields. Never let a retry
  // attach a PaymentIntent carrying a newer address to an older order row.
  // A deliberate customer/shipping edit receives a fresh checkout key/order;
  // an ordinary card retry keeps the existing one-Intent binding.
  if (!pendingCustomerDetailsMatch(order, customer)) {
    checkoutError(
      'CHECKOUT_DETAILS_CHANGED',
      'Customer or shipping details changed. Restart secure checkout and try again.',
      409,
      { restartCheckout: true },
    );
  }

  const intent = await createOrReusePaymentIntent({
    stripe,
    sql,
    order,
    confirmationTokenId,
    checkoutKey,
    // Stripe shipping is copied from the already-persisted canonical order,
    // never directly from a retrying browser payload.
    customer: canonicalCustomerFromOrder(order),
    items,
  });
  order = { ...order, stripe_payment_intent_id: intent.id };
  return { alreadyPaid: intent.status === 'succeeded', checkoutKey, intent, order };
}

function canonicalPaidPayload(order, extra = {}) {
  const orderConfirmationToken = createPaidOrderConfirmationToken(order);
  return {
    ok: true,
    success: true,
    paid: true,
    finalized: true,
    paymentCaptured: true,
    reconciliationRequired: false,
    paymentStatusUnknown: false,
    doNotRetry: false,
    orderId: order.id,
    internalOrderId: order.id,
    paymentIntentId: order.stripe_payment_intent_id,
    orderConfirmationToken,
    confirmationToken: orderConfirmationToken,
    status: 'succeeded',
    customerEmail: order.email || null,
    customerName: order.customer_name || order.shipping_name || null,
    customerPhone: order.customer_phone || null,
    shippingAddress: {
      name: order.shipping_name || order.customer_name || null,
      street: order.shipping_street || null,
      street2: order.shipping_street2 || null,
      city: order.shipping_city || null,
      state: order.shipping_state || null,
      zip: order.shipping_zip || null,
      country: order.shipping_country || 'US',
    },
    subtotal_cents: Number(order.subtotal_cents || 0),
    tax_cents: Number(order.tax_cents || 0),
    shipping_cents: Number(order.shipping_cents || 0),
    total_cents: Number(order.total_cents || 0),
    applied_discount_cents: Number(order.applied_discount_cents || 0),
    applied_discount_label: order.applied_discount_label || '',
    applied_discount_type: order.applied_discount_type || 'none',
    discount_code: order.discount_code || null,
    same_day_fee_cents: Number(order.same_day_fee_cents || 0),
    saturday_fee_cents: Number(order.saturday_fee_cents || 0),
    confirmationEmailStatus: order.confirmation_email_status || null,
    adminNotificationStatus: order.admin_notification_status || null,
    order: {
      id: order.id,
      status: order.status,
      subtotal_cents: Number(order.subtotal_cents || 0),
      tax_cents: Number(order.tax_cents || 0),
      shipping_cents: Number(order.shipping_cents || 0),
      total_cents: Number(order.total_cents || 0),
      applied_discount_cents: Number(order.applied_discount_cents || 0),
      applied_discount_label: order.applied_discount_label || '',
      applied_discount_type: order.applied_discount_type || 'none',
      discount_code: order.discount_code || null,
      payment_method: order.payment_method || 'stripe',
      stripe_wallet_type: order.stripe_wallet_type || null,
    },
    ...extra,
  };
}

module.exports = {
  REUSABLE_INTENT_STATUSES,
  SETTLED_ORDER_STATUSES,
  STRIPE_MAX_AMOUNT_CENTS,
  STRIPE_MIN_AMOUNT_CENTS,
  StripeCheckoutError,
  canonicalPaidPayload,
  canonicalCustomerFromOrder,
  canonicalQuoteForCheckout,
  claimOrderDiscountForPayment,
  checkoutKeyHash,
  confirmBoundPaymentIntent,
  createOrReusePaymentIntent,
  createPendingOrderDirect,
  loadStripeOrder,
  normalizeAddress,
  normalizeCustomer,
  pendingCustomerDetailsMatch,
  queuePaidOrderFollowups,
  releaseOrderDiscountClaim,
  startStripeCheckout,
  stripeConfirmationIdempotencyKey,
  stripeOrderMetadata,
  stripeOrderReference,
  stripePaymentDescription,
  validateCheckoutKey,
  validateExpectedTotal,
  validateStripeAmount,
  verifyIntentBinding,
};
