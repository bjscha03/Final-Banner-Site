// Creates a Stripe PaymentIntent priced server-side from the cart.
//
// - Uses STRIPE_SECRET_KEY (server-only, never sent to the browser).
// - Returns the resulting client_secret, which the frontend hands to
//   Stripe Elements (PaymentElement) to confirm the payment in the
//   browser. Apple Pay / Google Pay / cards are all enabled via
//   `automatic_payment_methods` so the wallet support comes for free.
// - Pricing math is identical to paypal-create-order.cjs (shared in
//   _shared/checkoutTotals.cjs) so a customer is charged the same
//   amount regardless of which payment method they choose.

const Stripe = require('stripe');
const { randomUUID } = require('crypto');
const {
  reconcileSameDayFlags,
} = require('./_shared/sameDayService.cjs');
const {
  getFeatureFlags,
  computeTotals,
} = require('./_shared/checkoutTotals.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  const cid = randomUUID();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED', cid }),
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('stripe-create-payment-intent: STRIPE_SECRET_KEY not configured', { cid });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'STRIPE_NOT_CONFIGURED', cid }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (parseErr) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'INVALID_JSON', cid }),
    };
  }

  const {
    items,
    discountCode,
    email,
    user_id: userId,
    sameDayHitService: reqSameDay,
    saturdayDelivery: reqSaturday,
  } = payload;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'MISSING_ITEMS', cid }),
    };
  }

  try {
    const flags = getFeatureFlags();
    const taxRate = 0.06;
    const pricingOptions = {
      freeShipping: flags.freeShipping,
      minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0,
      shippingMethodLabel: flags.shippingMethodLabel,
    };

    const totals = computeTotals(items, taxRate, pricingOptions, discountCode);

    // Same-day Hit Service is server-authoritative: re-evaluate the ET
    // window and product eligibility, and reject if the client requested
    // it but the window has closed.
    const sameDayResult = reconcileSameDayFlags({
      now: new Date(),
      items,
      requestedSameDay: !!reqSameDay,
      requestedSaturday: !!reqSaturday,
    });

    if (reqSameDay && !sameDayResult.sameDay) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'SAME_DAY_NOT_AVAILABLE',
          message: 'Same-Day Hit Service is no longer available for today’s production window.',
          reason: sameDayResult.rejectionReason,
          cid,
        }),
      };
    }

    const sameDayFeeCents = sameDayResult.fees.sameDayFeeCents;
    const saturdayFeeCents = sameDayResult.fees.saturdayFeeCents;
    const finalAmountCents = totals.total_cents + sameDayFeeCents + saturdayFeeCents;

    if (!Number.isFinite(finalAmountCents) || finalAmountCents < 50) {
      // Stripe minimum charge is $0.50 in USD.
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'AMOUNT_TOO_SMALL',
          finalAmountCents,
          cid,
        }),
      };
    }

    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

    // Metadata must be string-valued. Keep it small (Stripe limits at
    // 50 entries / 500 chars per value). Anything larger lives in our
    // own database via create-order at confirmation time.
    const metadata = {
      cid,
      banner_subtotal_cents: String(totals.adjusted_subtotal_cents),
      tax_cents: String(totals.tax_cents),
      same_day_fee_cents: String(sameDayFeeCents),
      saturday_fee_cents: String(saturdayFeeCents),
      total_cents: String(finalAmountCents),
      applied_discount_type: totals.applied_discount_type,
      applied_discount_cents: String(totals.applied_discount_cents),
      same_day_requested: reqSameDay ? '1' : '0',
      same_day_applied: sameDayResult.sameDay ? '1' : '0',
    };
    if (userId) metadata.user_id = String(userId).slice(0, 200);
    if (email) metadata.email = String(email).slice(0, 200);
    if (discountCode && discountCode.code) {
      metadata.discount_code = String(discountCode.code).slice(0, 100);
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: finalAmountCents,
        currency: 'usd',
        // Enables cards, Apple Pay, Google Pay, Link, etc. based on what
        // the merchant has activated in the Stripe dashboard.
        automatic_payment_methods: { enabled: true },
        receipt_email: email || undefined,
        description: 'Banners On The Fly order',
        metadata,
      },
      // Per-request idempotency key derived from our cid so accidental
      // double-submits return the same PaymentIntent.
      { idempotencyKey: `pi_create_${cid}` }
    );

    console.log('stripe-create-payment-intent: created', {
      cid,
      paymentIntentId: intent.id,
      amount: finalAmountCents,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount: finalAmountCents,
        currency: 'usd',
        sameDay: sameDayResult.sameDay,
        saturday: sameDayResult.saturday,
        cid,
      }),
    };
  } catch (err) {
    console.error('stripe-create-payment-intent error:', err && err.message, { cid });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'STRIPE_CREATE_INTENT_FAILED',
        message: err && err.message,
        cid,
      }),
    };
  }
};
