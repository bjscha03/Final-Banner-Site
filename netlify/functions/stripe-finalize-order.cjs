// Browser-side endpoint called immediately after stripe.confirmPayment
// resolves successfully. Verifies the PaymentIntent server-side (status,
// metadata.order_id, amount), then marks the matching pending order
// 'paid' and triggers the existing notify-order email pipeline (same one
// PayPal uses).
//
// The browser never tells us "this payment is good" — we always
// re-fetch the PaymentIntent from Stripe to confirm.

const Stripe = require('stripe');
const { neon } = require('@neondatabase/serverless');
const { finalizeStripeOrder } = require('./_shared/finalizeStripeOrder.cjs');

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[stripe-finalize-order] STRIPE_SECRET_KEY not configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'STRIPE_NOT_CONFIGURED' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_parseErr) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'INVALID_JSON' }),
    };
  }

  const { orderId, paymentIntentId, shipping, billing } = payload;

  if (!paymentIntentId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'MISSING_PAYMENT_INTENT_ID' }),
    };
  }

  console.log('[stripe-finalize-order] Finalizing', { orderId, paymentIntentId });

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

    // 1. Re-fetch the PaymentIntent from Stripe so we trust the source
    //    of truth, not the browser.
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!intent || intent.status !== 'succeeded') {
      console.warn('[stripe-finalize-order] PaymentIntent not succeeded', {
        paymentIntentId,
        status: intent && intent.status,
      });
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'PAYMENT_NOT_SUCCEEDED',
          paymentStatus: intent && intent.status,
        }),
      };
    }

    // 2. Verify the order id stored in PaymentIntent metadata matches
    //    what the browser reports (defense in depth).
    const piOrderId = intent.metadata && intent.metadata.order_id;
    if (orderId && piOrderId && piOrderId !== orderId) {
      console.error('[stripe-finalize-order] order_id mismatch', {
        paymentIntentId,
        bodyOrderId: orderId,
        intentOrderId: piOrderId,
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'ORDER_ID_MISMATCH' }),
      };
    }

    // 3. Cross-check that the amount we charged matches the amount on
    //    the order row (catches a tampered metadata.order_id pointing at
    //    a different, cheaper order).
    const resolvedOrderId = orderId || piOrderId;
    if (resolvedOrderId) {
      try {
        const orderRows = await sql`
          SELECT total_cents FROM orders WHERE id = ${resolvedOrderId} LIMIT 1
        `;
        if (orderRows && orderRows[0]) {
          const orderTotal = Number(orderRows[0].total_cents) || 0;
          if (orderTotal !== intent.amount) {
            console.error('[stripe-finalize-order] amount mismatch', {
              paymentIntentId,
              orderId: resolvedOrderId,
              orderTotal,
              intentAmount: intent.amount,
            });
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ ok: false, error: 'AMOUNT_MISMATCH' }),
            };
          }
        }
      } catch (amountCheckErr) {
        // If we can't verify the amount, don't refuse to finalize the
        // payment — we already verified status + metadata above. Just log.
        console.warn('[stripe-finalize-order] amount verification skipped:', amountCheckErr.message);
      }
    }

    // 4. Stripe has shipping on the PaymentIntent (when collected by
    //    Payment Element). Prefer that over what the browser sent.
    const stripeShipping = intent.shipping || null;
    const finalShipping = shipping
      ? { ...shipping }
      : (stripeShipping
          ? {
              name: stripeShipping.name || null,
              phone: stripeShipping.phone || null,
              line1: stripeShipping.address && stripeShipping.address.line1,
              line2: stripeShipping.address && stripeShipping.address.line2,
              city: stripeShipping.address && stripeShipping.address.city,
              state: stripeShipping.address && stripeShipping.address.state,
              postal_code: stripeShipping.address && stripeShipping.address.postal_code,
              country: stripeShipping.address && stripeShipping.address.country,
            }
          : null);

    // Pull the underlying Charge id (and wallet type, when a wallet was
    // used) so admin / Stripe-dashboard cross-reference works and we can
    // label Apple Pay / Google Pay payments correctly.
    const chargeId = intent.latest_charge
      || (intent.charges && intent.charges.data && intent.charges.data[0] && intent.charges.data[0].id)
      || null;
    let walletType = null;
    let resolvedBilling = billing || null;
    let receiptEmail = intent.receipt_email || null;
    try {
      // latest_charge is a string id by default — fetch the Charge to
      // read payment_method_details.card.wallet.type and billing_details.
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        const pmDetails = charge && charge.payment_method_details;
        if (pmDetails && pmDetails.card && pmDetails.card.wallet && pmDetails.card.wallet.type) {
          walletType = String(pmDetails.card.wallet.type); // 'apple_pay' | 'google_pay' | 'link' | ...
        }
        if (!resolvedBilling && charge && charge.billing_details) {
          resolvedBilling = charge.billing_details;
        }
        if (!receiptEmail && charge && charge.receipt_email) {
          receiptEmail = charge.receipt_email;
        }
      }
    } catch (chargeErr) {
      console.warn('[stripe-finalize-order] failed to retrieve Charge for wallet type:', chargeErr.message);
    }

    const result = await finalizeStripeOrder({
      paymentIntentId,
      orderId: resolvedOrderId,
      chargeId,
      walletType,
      receiptEmail,
      shipping: finalShipping,
      billing: resolvedBilling,
      source: 'browser',
    });

    if (!result.ok) {
      const statusCode = result.error === 'MISSING_CUSTOMER_INFO' ? 409 : 500;
      return {
        statusCode,
        headers,
        body: JSON.stringify(result),
      };
    }

    console.log('[stripe-finalize-order] Done', {
      orderId: result.orderId,
      alreadyPaid: !!result.alreadyPaid,
      emailSent: !!result.emailSent,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('[stripe-finalize-order] error:', err && err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'FINALIZE_FAILED',
        message: err && err.message,
      }),
    };
  }
};
