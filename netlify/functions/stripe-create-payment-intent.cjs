// Creates a Stripe PaymentIntent priced server-side from the cart, AND
// persists a pending order in our database BEFORE the PaymentIntent is
// created. This is the critical fix for the "Stripe charged but no
// order in admin" bug: if our database write fails we never call
// Stripe, and once Stripe accepts the charge we already have a row to
// flip from 'pending' to 'paid' (see stripe-finalize-order /
// stripe-webhook).
//
// - Uses STRIPE_SECRET_KEY (server-only, never sent to the browser).
// - Returns the resulting client_secret + the real database orderId.
//   The frontend uses orderId for the success page and finalize call.
// - Apple Pay / Google Pay / cards are all enabled via
//   `automatic_payment_methods` so the wallet support comes for free.
// - Pricing math is identical to paypal-create-order.cjs (shared in
//   _shared/checkoutTotals.cjs) so a customer is charged the same
//   amount regardless of which payment method they choose.

const Stripe = require('stripe');
const { randomUUID } = require('crypto');
const { neon } = require('@neondatabase/serverless');
const {
  reconcileSameDayFlags,
} = require('./_shared/sameDayService.cjs');
const {
  getFeatureFlags,
  computeTotals,
} = require('./_shared/checkoutTotals.cjs');

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

// Guard: only treat a value as a "real" authenticated user id if it is a
// proper non-zero UUID. Placeholder values like the all-zero UUID, the
// literal string "guest", empty strings, etc. are NOT real user ids and
// MUST NOT be forwarded to create-order — doing so causes the pending
// order INSERT to fail with "User <id> not found in database" because
// no matching row exists in the profiles table.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
function isRealUserId(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v === 'guest' || v.startsWith('guest-') || v.startsWith('guest_')) return false;
  if (!UUID_RE.test(v)) return false;
  // Reject the all-zero UUID and the well-known "...0001" placeholder
  // observed in production logs.
  if (v === ZERO_UUID) return false;
  if (v === '00000000-0000-0000-0000-000000000001') return false;
  // Reject any UUID whose non-hyphen characters are all zeros (e.g.
  // 00000000-0000-0000-0000-00000000000X for any single-char tail).
  if (v.replace(/-/g, '').replace(/0/g, '') === '') return false;
  return true;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Internal call to the create-order Netlify function so the pending
// order goes through the exact same INSERT path as a paid order
// (order_items, schema migrations, validation, etc). We pass
// `payment_status: 'pending'` so emails / AI processing / abandoned-
// cart cleanup / discount-code consumption are deferred until finalize.
async function createPendingOrder(orderPayload, cid) {
  const url = `${process.env.URL || 'https://bannersonthefly.com'}/.netlify/functions/create-order`;
  console.log('[stripe-create-payment-intent] POST create-order (pending):', {
    cid,
    url,
    total_cents: orderPayload.total_cents,
    item_count: (orderPayload.items || []).length,
    has_email: !!orderPayload.email,
    has_customer_name: !!orderPayload.customer_name,
    has_user_id: !!orderPayload.user_id,
    has_discount_code: !!(orderPayload.discountCode && orderPayload.discountCode.code),
  });
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...orderPayload,
        payment_status: 'pending',
        // Marker so create-order / downstream processors know this row
        // originated from the Stripe pre-payment hold.
        source: 'stripe',
      }),
    });
  } catch (fetchErr) {
    console.error('[stripe-create-payment-intent] create-order fetch threw', {
      cid,
      message: fetchErr && fetchErr.message,
    });
    return { ok: false, status: 0, body: { error: 'create-order_unreachable', details: fetchErr && fetchErr.message } };
  }
  // Always read the raw body so we can log what create-order actually
  // returned — not just our interpretation of it. This is the log that
  // shows the real reason for "Failed to create order" in Netlify.
  const rawText = await resp.text().catch(() => '');
  let body = {};
  try { body = rawText ? JSON.parse(rawText) : {}; } catch (_e) { body = { raw: rawText }; }
  if (!resp.ok || !body.ok || !body.orderId) {
    console.error('[stripe-create-payment-intent] create-order rejected pending order', {
      cid,
      status: resp.status,
      body_error: body && body.error,
      body_details: body && body.details,
      body_code: body && body.code,
      body_message: body && body.message,
      body_raw_excerpt: typeof rawText === 'string' ? rawText.slice(0, 1000) : null,
    });
    return { ok: false, status: resp.status, body };
  }
  return { ok: true, orderId: body.orderId };
}

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
    console.error('[stripe-create-payment-intent] STRIPE_SECRET_KEY not configured', { cid });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'STRIPE_NOT_CONFIGURED', cid }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_parseErr) {
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
    customer_name: customerName,
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

  let pendingOrderId = null;

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

    // Sanitize the user_id before doing anything else. The frontend may
    // send a placeholder UUID (e.g. 00000000-0000-0000-0000-000000000001)
    // or even the literal string "guest" when the customer is not
    // authenticated. Forwarding those values to create-order causes the
    // pending order INSERT to fail because no matching profiles row
    // exists — which in turn means we never call Stripe and the user
    // sees a generic "could not start checkout" error.
    const safeUserId = isRealUserId(userId) ? userId : null;
    if (userId && !safeUserId) {
      console.log('[stripe-create-payment-intent] Ignoring placeholder/guest user_id; treating as guest checkout', {
        cid,
        provided_user_id_excerpt: String(userId).slice(0, 64),
      });
    }

    // ------------------------------------------------------------------
    // STEP 1: Persist a PENDING order BEFORE asking Stripe for anything.
    // If this fails, we never reach the Stripe API → the customer
    // CANNOT be charged without a corresponding row in our database.
    // ------------------------------------------------------------------
    const pendingResult = await createPendingOrder({
      // Only forward user_id when it is a real authenticated user; for
      // guest checkout we omit it entirely and let create-order persist
      // the order against the guest email below.
      ...(safeUserId ? { user_id: safeUserId } : {}),
      email: email || `guest-${cid}@bannersonthefly.com`,
      customer_name: customerName || null,
      subtotal_cents: totals.adjusted_subtotal_cents,
      tax_cents: totals.tax_cents,
      total_cents: finalAmountCents,
      applied_discount_cents: totals.applied_discount_cents,
      applied_discount_label: totals.applied_discount_type === 'quantity'
        ? `Quantity ${(totals.applied_discount_rate * 100).toFixed(0)}%`
        : (discountCode && discountCode.code) || '',
      applied_discount_type: totals.applied_discount_type,
      currency: 'usd',
      payment_method: 'stripe',
      sameDayHitService: !!reqSameDay,
      saturdayDelivery: !!reqSaturday,
      items,
      discountCode: discountCode || null,
    }, cid);

    if (!pendingResult.ok) {
      console.error('[stripe-create-payment-intent] PENDING order create FAILED — refusing to call Stripe', {
        cid,
        status: pendingResult.status,
        body: pendingResult.body,
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'ORDER_CREATE_FAILED',
          message: 'We could not save your order. Your card was NOT charged. Please try again or contact support.',
          details: (pendingResult.body && (pendingResult.body.error || pendingResult.body.details)) || null,
          cid,
        }),
      };
    }

    pendingOrderId = pendingResult.orderId;
    console.log('[stripe-create-payment-intent] PENDING order created', {
      cid,
      orderId: pendingOrderId,
      total_cents: finalAmountCents,
    });

    // ------------------------------------------------------------------
    // STEP 2: Create the Stripe PaymentIntent. Stash the pending order
    // id in metadata so the webhook can reconcile even if the browser
    // never reports back.
    // ------------------------------------------------------------------
    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

    // Build a short, human-readable product summary for the Stripe
    // dashboard. Truncate aggressively — Stripe metadata values must be
    // ≤500 chars and we want to leave headroom.
    const productSummary = (() => {
      try {
        const parts = (items || []).slice(0, 5).map((it) => {
          const w = it.width_in;
          const h = it.height_in;
          const q = it.quantity;
          const mat = it.material || 'banner';
          const dims = (w && h) ? `${w}x${h}in` : '';
          return `${q || 1}x ${dims} ${mat}`.replace(/\s+/g, ' ').trim();
        });
        if ((items || []).length > 5) parts.push(`+${items.length - 5} more`);
        return parts.join(', ').slice(0, 480);
      } catch (_e) {
        return '';
      }
    })();

    const metadata = {
      cid,
      order_id: pendingOrderId,
      site: 'bannersonthefly.com',
      item_count: String((items || []).reduce((n, it) => n + (Number(it.quantity) || 0), 0) || (items || []).length),
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
    if (productSummary) metadata.product_summary = productSummary;
    if (safeUserId) metadata.user_id = String(safeUserId).slice(0, 200);
    if (email) {
      metadata.email = String(email).slice(0, 200);
      metadata.customer_email = String(email).slice(0, 200);
    }
    if (customerName) metadata.customer_name = String(customerName).slice(0, 200);
    if (discountCode && discountCode.code) {
      metadata.discount_code = String(discountCode.code).slice(0, 100);
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: finalAmountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        receipt_email: email || undefined,
        description: `Banners on the Fly order ${pendingOrderId}${productSummary ? ` — ${productSummary}` : ''}`.slice(0, 350),
        metadata,
      },
      { idempotencyKey: `pi_create_${cid}` }
    );

    console.log('[stripe-create-payment-intent] PaymentIntent created', {
      cid,
      orderId: pendingOrderId,
      paymentIntentId: intent.id,
      amount: finalAmountCents,
    });

    // ------------------------------------------------------------------
    // STEP 3: Attach the PaymentIntent id to the pending order so both
    // the browser callback (stripe-finalize-order) and the webhook
    // (stripe-webhook) can find the row by either orderId or pi.id.
    // ------------------------------------------------------------------
    try {
      await sql`
        UPDATE orders
        SET stripe_payment_intent_id = ${intent.id}
        WHERE id = ${pendingOrderId}
          AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = ${intent.id})
      `;
      console.log('[stripe-create-payment-intent] PaymentIntent id attached to order', {
        cid,
        orderId: pendingOrderId,
        paymentIntentId: intent.id,
      });
    } catch (attachErr) {
      // Non-fatal: the webhook can still find the row via metadata.order_id.
      console.error('[stripe-create-payment-intent] Failed to attach PI id to order:', attachErr.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        orderId: pendingOrderId,
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
    console.error('[stripe-create-payment-intent] error:', err && err.message, { cid, pendingOrderId });
    // Best-effort: mark the pending order as failed so admin can see what happened.
    if (pendingOrderId) {
      try {
        await sql`
          UPDATE orders
          SET status = 'failed'
          WHERE id = ${pendingOrderId} AND status = 'pending'
        `;
        console.log('[stripe-create-payment-intent] Marked pending order as failed', {
          cid,
          orderId: pendingOrderId,
        });
      } catch (_e) { /* ignore */ }
    }
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

