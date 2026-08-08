'use strict';

const { loadStripeOrder, verifyIntentBinding } = require('./stripe-checkout-service.cjs');
const { completePaymentDiscount } = require('./payment-discount-reservation.cjs');

const SETTLED = new Set(['paid', 'in_production', 'shipped', 'delivered', 'fulfilled']);
const ALLOWED_WALLETS = new Set(['apple_pay', 'google_pay', 'link']);

function walletTypeFromCharge(charge) {
  const wallet = String(charge?.payment_method_details?.card?.wallet?.type || '').trim().toLowerCase();
  return ALLOWED_WALLETS.has(wallet) ? wallet : null;
}

function chargeIdFromIntent(intent, charge) {
  if (typeof charge?.id === 'string') return charge.id;
  if (typeof intent?.latest_charge === 'string') return intent.latest_charge;
  if (typeof intent?.latest_charge?.id === 'string') return intent.latest_charge.id;
  return null;
}

function isStripeExclusiveOrder(order) {
  return String(order?.payment_method || '').trim().toLowerCase() === 'stripe'
    && !order?.paypal_order_id
    && !order?.paypal_capture_id;
}

async function runPostPaymentBookkeeping(sql, order) {
  const failures = [];
  // Preview/test-mode orders must exercise the paid lifecycle without
  // consuming production promotion inventory or customer abandoned carts.
  if (order?.is_test_order === true || order?.is_test_order === 'true') return failures;
  try {
    const completion = await completePaymentDiscount(sql, order);
    if (!completion.ok) failures.push(`discount:${completion.code || 'completion-conflict'}`);
  } catch (error) {
    if (String(error?.code || '') !== '42P01') failures.push(`discount:${error?.message || error}`);
  }

  try {
    await sql`
      UPDATE abandoned_carts
         SET recovery_status = 'recovered',
             recovered_at = COALESCE(recovered_at, NOW()),
             recovered_order_id = COALESCE(recovered_order_id, ${order.id})
       WHERE recovery_status IN ('active', 'abandoned')
         AND (${order.user_id || null}::uuid IS NOT NULL AND user_id = ${order.user_id || null}::uuid
              OR ${order.email || null}::text IS NOT NULL AND LOWER(email) = LOWER(${order.email || null}))
    `;
  } catch (error) {
    // Abandoned-cart recovery is optional in older databases; checkout must
    // not acquire a new schema dependency merely to settle a paid order.
    if (!['42P01', '42703'].includes(String(error?.code || ''))) {
      failures.push(`abandoned-cart:${error?.message || error}`);
    }
  }

  return failures;
}

async function finalizeStripeOrder({ sql, intent, charge = null, source = 'unknown', paymentEventId = null }) {
  const paymentIntentId = String(intent?.id || '').trim();
  if (!paymentIntentId) return { ok: false, error: 'PAYMENT_INTENT_REQUIRED', retriable: false };
  if (String(intent?.status || '').toLowerCase() !== 'succeeded') {
    return {
      ok: false,
      error: 'PAYMENT_NOT_SUCCEEDED',
      paymentStatus: intent?.status || null,
      retriable: ['processing', 'requires_action'].includes(String(intent?.status || '').toLowerCase()),
    };
  }

  let order = await loadStripeOrder(sql, { paymentIntentId });
  if (!order && intent?.metadata?.internal_order_id) {
    order = await loadStripeOrder(sql, { orderId: intent.metadata.internal_order_id });
  }
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND', retriable: true };
  if (String(order.stripe_payment_intent_id || '') !== paymentIntentId) {
    // Metadata alone never authorizes settlement. The provider reference must
    // already be durably attached to the order; a mismatch can indicate an
    // older/displaced Intent and requires manual reconciliation.
    return { ok: false, error: 'PAYMENT_INTENT_MISMATCH', retriable: false };
  }
  if (!isStripeExclusiveOrder(order)) {
    return { ok: false, error: 'PAYMENT_PROVIDER_CONFLICT', retriable: false };
  }

  try {
    verifyIntentBinding(intent, order);
  } catch (error) {
    return {
      ok: false,
      error: error.code || 'PAYMENT_BINDING_INVALID',
      message: error.message,
      retriable: false,
    };
  }

  const orderIsTest = order.is_test_order === true || order.is_test_order === 'true';
  if (orderIsTest === Boolean(intent.livemode)) {
    return { ok: false, error: 'PAYMENT_MODE_MISMATCH', retriable: false };
  }

  const chargeId = chargeIdFromIntent(intent, charge);
  const walletType = walletTypeFromCharge(charge);
  const beforeStatus = String(order.status || '').toLowerCase();
  let transitioned = false;

  if (!SETTLED.has(beforeStatus)) {
    const updated = await sql`
      UPDATE orders
         SET status = 'paid',
             stripe_charge_id = COALESCE(stripe_charge_id, ${chargeId}),
             stripe_wallet_type = COALESCE(stripe_wallet_type, ${walletType}),
             payment_method = 'stripe',
             payment_reconciliation_status = 'complete',
             updated_at = NOW()
       WHERE id = ${order.id}
         AND status = 'pending'
         AND stripe_payment_intent_id = ${paymentIntentId}
         AND payment_method = 'stripe'
         AND paypal_order_id IS NULL
         AND paypal_capture_id IS NULL
         AND total_cents = ${Number(intent.amount)}
       RETURNING id
    `;
    transitioned = Boolean(updated[0]);
    order = await loadStripeOrder(sql, { orderId: order.id });
    if (!order || !isStripeExclusiveOrder(order)) {
      return { ok: false, error: 'PAYMENT_PROVIDER_CONFLICT', retriable: false };
    }
    if (!transitioned && !SETTLED.has(String(order.status || '').toLowerCase())) {
      return { ok: false, error: 'ORDER_FINALIZE_CONFLICT', retriable: true };
    }
  } else if (chargeId || walletType || order.payment_reconciliation_status !== 'complete') {
    await sql`
      UPDATE orders
         SET stripe_charge_id = COALESCE(stripe_charge_id, ${chargeId}),
             stripe_wallet_type = COALESCE(stripe_wallet_type, ${walletType}),
             payment_method = 'stripe',
             payment_reconciliation_status = 'complete',
             updated_at = NOW()
       WHERE id = ${order.id}
         AND stripe_payment_intent_id = ${paymentIntentId}
         AND payment_method = 'stripe'
         AND paypal_order_id IS NULL
         AND paypal_capture_id IS NULL
    `;
    order = await loadStripeOrder(sql, { orderId: order.id }) || order;
  }

  const bookkeepingFailures = await runPostPaymentBookkeeping(sql, order);
  if (bookkeepingFailures.length) {
    console.error('[stripe-finalize] settled order bookkeeping incomplete', {
      source,
      paymentEventId,
      orderId: order.id,
      paymentIntentId,
      failures: bookkeepingFailures,
    });
    return {
      ok: false,
      settled: true,
      order,
      transitioned,
      error: 'POST_PAYMENT_BOOKKEEPING_INCOMPLETE',
      retriable: true,
    };
  }

  console.log('[stripe-finalize] order settled', {
    source,
    paymentEventId,
    orderId: order.id,
    paymentIntentId,
    transitioned,
    walletType: order.stripe_wallet_type || null,
  });
  return {
    ok: true,
    settled: true,
    order,
    orderId: order.id,
    transitioned,
    alreadyPaid: !transitioned,
  };
}

module.exports = {
  SETTLED,
  chargeIdFromIntent,
  finalizeStripeOrder,
  isStripeExclusiveOrder,
  runPostPaymentBookkeeping,
  walletTypeFromCharge,
};
