// Shared "mark a Stripe pending order paid + send confirmation emails"
// helper. Used by both:
//   - netlify/functions/stripe-finalize-order.cjs (browser callback)
//   - netlify/functions/stripe-webhook.cjs        (server-side safety net)
//
// Idempotent: if the order is already 'paid' it returns successfully
// without sending duplicate emails.

const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

// Trigger the same notify-order endpoint PayPal uses, which sends both
// the customer confirmation and the admin new-order notification.
async function sendOrderEmails(orderId, source) {
  try {
    console.log(`[finalizeStripeOrder:${source}] Triggering notify-order for order ${orderId}`);
    const url = `${process.env.URL || 'https://bannersonthefly.com'}/.netlify/functions/notify-order`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    let result = {};
    try { result = await response.json(); } catch (_e) { /* ignore */ }
    if (response.ok && result.ok) {
      console.log(`[finalizeStripeOrder:${source}] notify-order OK for order ${orderId}, id=${result.id}`);
      return { ok: true, id: result.id };
    }
    console.error(`[finalizeStripeOrder:${source}] notify-order FAILED for order ${orderId}:`, result);
    return { ok: false, error: result.error || `notify-order returned ${response.status}` };
  } catch (err) {
    console.error(`[finalizeStripeOrder:${source}] notify-order ERROR for order ${orderId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Mark a pending Stripe order paid and trigger order-confirmation emails.
 *
 * @param {object} args
 * @param {string} args.paymentIntentId  - Stripe PaymentIntent id (required)
 * @param {string} [args.orderId]        - Optional order id; if omitted we look it up by paymentIntentId
 * @param {string} [args.chargeId]       - Optional Stripe Charge id (latest_charge on the PaymentIntent)
 * @param {string} [args.walletType]     - Optional wallet type ('apple_pay' | 'google_pay' | 'link')
 * @param {string} [args.receiptEmail]   - Optional receipt email captured by Stripe (used as fallback when guest order has no email)
 * @param {object} [args.shipping]       - Optional shipping object { name, line1, line2, city, state, postal_code, country, phone }
 * @param {object} [args.billing]        - Optional billing object { name, email, phone, address: {...} }
 * @param {string} args.source           - 'browser' | 'webhook' (used in logs)
 * @returns {Promise<{ ok: boolean, orderId?: string, alreadyPaid?: boolean, error?: string }>}
 */
async function finalizeStripeOrder({ paymentIntentId, orderId, chargeId, walletType, receiptEmail, shipping, billing, source }) {
  const tag = `[finalizeStripeOrder:${source || 'unknown'}]`;
  if (!paymentIntentId) {
    return { ok: false, error: 'MISSING_PAYMENT_INTENT_ID' };
  }

  // Locate the pending order. Prefer the orderId hint, fall back to the
  // PaymentIntent id (which is what the webhook has).
  let row = null;
  try {
    if (orderId) {
      const found = await sql`
        SELECT id, status, stripe_payment_intent_id, total_cents, email
        FROM orders
        WHERE id = ${orderId}
        LIMIT 1
      `;
      row = found && found[0];
    }
    if (!row) {
      const found = await sql`
        SELECT id, status, stripe_payment_intent_id, total_cents, email
        FROM orders
        WHERE stripe_payment_intent_id = ${paymentIntentId}
        LIMIT 1
      `;
      row = found && found[0];
    }
  } catch (lookupErr) {
    console.error(`${tag} order lookup failed:`, lookupErr.message);
    return { ok: false, error: 'ORDER_LOOKUP_FAILED' };
  }

  if (!row) {
    console.error(`${tag} no order found for paymentIntentId=${paymentIntentId} orderId=${orderId || 'n/a'}`);
    return { ok: false, error: 'ORDER_NOT_FOUND' };
  }

  // If a different PaymentIntent is on the order than what we were
  // asked to finalize, refuse — never confirm someone else's payment
  // against this order.
  if (row.stripe_payment_intent_id && row.stripe_payment_intent_id !== paymentIntentId) {
    console.error(`${tag} payment intent mismatch for order ${row.id}: stored=${row.stripe_payment_intent_id} got=${paymentIntentId}`);
    return { ok: false, error: 'PAYMENT_INTENT_MISMATCH' };
  }

  // Idempotency: if the order is already paid, no-op.
  if (row.status === 'paid') {
    console.log(`${tag} order ${row.id} is already paid, no-op (alreadyPaid)`);
    return { ok: true, orderId: row.id, alreadyPaid: true };
  }

  // Optional shipping/billing fields. We only update columns the caller
  // actually provided so we never overwrite real data with nulls.
  const shippingName = (shipping && (shipping.name)) || (billing && billing.name) || null;
  const shippingStreet = (shipping && (shipping.line1 || shipping.street)) || null;
  const shippingStreet2 = (shipping && (shipping.line2 || shipping.street2)) || null;
  const shippingCity = (shipping && shipping.city) || null;
  const shippingState = (shipping && shipping.state) || null;
  const shippingZip = (shipping && (shipping.postal_code || shipping.postalCode || shipping.zip)) || null;
  const shippingCountry = (shipping && shipping.country) || null;
  const phone = (shipping && shipping.phone)
    || (billing && billing.phone)
    || null;
  // Use Stripe's billing/receipt email as a fallback for guest orders
  // that were persisted with a synthetic guest-<cid>@... address before
  // the customer entered their real email in the Payment Element.
  const fallbackEmail = (billing && billing.email)
    || receiptEmail
    || null;

  const customerName = shippingName
    || (billing && billing.name)
    || null;
  const customerFirstName = customerName
    ? String(customerName).trim().split(/\s+/)[0]
    : null;

  const normalizedEmail = (fallbackEmail || row.email || '').trim().toLowerCase();
  const looksLikeGuestPlaceholder = normalizedEmail.startsWith('guest-') && normalizedEmail.endsWith('@bannersonthefly.com');
  const hasRequiredCustomerInfo = Boolean(
    customerName
    && normalizedEmail
    && !looksLikeGuestPlaceholder
    && shippingStreet
    && shippingCity
    && shippingState
    && shippingZip
  );
  if (!hasRequiredCustomerInfo) {
    console.error(`${tag} refusing finalize for ${row.id}: missing required customer info`, {
      hasName: !!customerName,
      hasEmail: !!normalizedEmail && !looksLikeGuestPlaceholder,
      hasStreet: !!shippingStreet,
      hasCity: !!shippingCity,
      hasState: !!shippingState,
      hasZip: !!shippingZip,
    });
    return { ok: false, error: 'MISSING_CUSTOMER_INFO' };
  }

  try {
    await sql`
      UPDATE orders
      SET
        status = 'paid',
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ${paymentIntentId}),
        stripe_charge_id = COALESCE(stripe_charge_id, ${chargeId || null}),
        stripe_wallet_type = COALESCE(stripe_wallet_type, ${walletType || null}),
        payment_method = COALESCE(payment_method, 'stripe'),
        customer_name = COALESCE(${customerName}, customer_name),
        customer_first_name = COALESCE(${customerFirstName}, customer_first_name),
        customer_phone = COALESCE(${phone}, customer_phone),
        email = CASE
          WHEN ${fallbackEmail}::text IS NOT NULL
            AND (email IS NULL OR email LIKE 'guest-%@bannersonthefly.com')
          THEN ${fallbackEmail}
          ELSE email
        END,
        shipping_name = COALESCE(${shippingName}, shipping_name),
        shipping_street = COALESCE(${shippingStreet}, shipping_street),
        shipping_street2 = COALESCE(${shippingStreet2}, shipping_street2),
        shipping_city = COALESCE(${shippingCity}, shipping_city),
        shipping_state = COALESCE(${shippingState}, shipping_state),
        shipping_zip = COALESCE(${shippingZip}, shipping_zip),
        shipping_country = COALESCE(${shippingCountry}, shipping_country)
      WHERE id = ${row.id} AND status <> 'paid'
    `;
    console.log(`${tag} order ${row.id} marked PAID`);
  } catch (updateErr) {
    console.error(`${tag} UPDATE to paid failed for order ${row.id}:`, updateErr.message);
    return { ok: false, error: 'ORDER_UPDATE_FAILED' };
  }

  // Re-read to confirm and detect the rare "another writer beat us to
  // it" race (status got set to paid by webhook between SELECT + UPDATE).
  let nowPaid = false;
  try {
    const after = await sql`SELECT status FROM orders WHERE id = ${row.id} LIMIT 1`;
    nowPaid = !!(after && after[0] && after[0].status === 'paid');
  } catch (_e) { /* ignore — assume paid */ nowPaid = true; }

  // Trigger emails. Best-effort: a delivery failure should not unwind
  // the paid status (we'd rather have a paid order with no email than
  // a paid charge with no order, which is the bug we're fixing).
  const emailResult = await sendOrderEmails(row.id, source || 'unknown');

  return {
    ok: true,
    orderId: row.id,
    alreadyPaid: row.status === 'paid' && !nowPaid,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? null : emailResult.error,
  };
}

module.exports = { finalizeStripeOrder };
