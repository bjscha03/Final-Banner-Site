"use strict";
const bof = require("./bof-service.cjs");
const STRIPE_ADJUSTMENT_TYPES = Object.freeze([
  "charge.refunded",
  "charge.dispute.created",
  "refund.updated",
  "refund.failed",
]);
const stripeObjectId = (value) => typeof value === "string" ? value : value?.id;
async function confirmedStripeRefunds(stripe, charge) {
  // amount_refunded includes pending refunds and can decrease if a refund
  // later fails. Only the current, canonical succeeded refunds return credit.
  let total = 0, after;
  const seen = new Set();
  for (;;) {
    const page = await stripe.refunds.list({
      charge: charge.id,
      limit: 100,
      ...(after ? { starting_after: after } : {}),
    });
    if (!Array.isArray(page?.data)) throw new Error("BOF_REFUND_LIST_INVALID");
    for (const refund of page.data) {
      if (!refund.id || seen.has(refund.id)) throw new Error("BOF_REFUND_PAGINATION_INVALID");
      seen.add(refund.id);
      if (stripeObjectId(refund.charge) !== charge.id || refund.currency !== "usd" ||
        !Number.isSafeInteger(refund.amount) || refund.amount <= 0)
        throw new Error("BOF_REFUND_BINDING_MISMATCH");
      if (refund.status === "succeeded") total += refund.amount;
    }
    if (total > Number(charge.amount)) throw new Error("BOF_REFUND_AMOUNT_INVALID");
    if (!page.has_more) return total;
    if (!page.data.length) throw new Error("BOF_REFUND_PAGINATION_INVALID");
    after = page.data.at(-1).id;
  }
}
async function stripeAdjustment(sql, stripe, event) {
  const dispute = event.type === "charge.dispute.created";
  if (!STRIPE_ADJUSTMENT_TYPES.includes(event.type)) return false;
  const resource = event.data.object;
  const chargeId = event.type === "charge.refunded" ? resource.id : stripeObjectId(resource.charge);
  if (!/^ch_[A-Za-z0-9]+$/.test(chargeId || "")) throw new Error("BOF_CHARGE_ID_INVALID");
  const charge = await stripe.charges.retrieve(
    chargeId,
  );
  if (charge.id !== chargeId) throw new Error("BOF_REFUND_BINDING_MISMATCH");
  const intentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!intentId) return true;
  const rows =
    await sql`SELECT * FROM orders WHERE stripe_payment_intent_id=${intentId} AND NOT coalesce(is_test_order,false) LIMIT 1`;
  const order = rows[0];
  if (!order) return true;
  if (order.status === "pending")
    throw new Error("BOF_PAYMENT_BOOKKEEPING_PENDING");
  const verifyCharge = (current) => {
    if (current.id !== chargeId || stripeObjectId(current.payment_intent) !== intentId ||
      current.currency !== "usd" || Number(current.amount) !== Number(order.total_cents))
      throw new Error("BOF_REFUND_BINDING_MISMATCH");
  };
  verifyCharge(charge);
  // A refund can arrive before payment bookkeeping. Settlement and reversal are
  // retried together; the verified provider remains authoritative.
  if (dispute) {
    await bof.settle(sql, order);
    await bof.reverse(sql, order.id, 0, Number(charge.amount), true);
    return true;
  }
  const eventCreated = Number.isSafeInteger(event.created) && event.created >= 0 ? event.created : 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    // The first charge lookup only resolves the owning order. Read a database
    // revision BEFORE taking the authoritative provider snapshot. Concurrent
    // same-second events must never commit an older successful-refund snapshot
    // after a later failed refund has already removed its credit.
    const rows = await sql`SELECT bof_stripe_refund_revision(${order.id}::uuid) AS revision`;
    if (rows[0]?.revision == null) return true;
    const revision = String(rows[0].revision);
    const current = await stripe.charges.retrieve(chargeId);
    verifyCharge(current);
    const confirmed = await confirmedStripeRefunds(stripe, current);
    await bof.settle(sql, order);
    try {
      await sql`SELECT bof_reconcile_stripe_refund(${order.id}::uuid,${confirmed},${Number(current.amount)},${eventCreated}::bigint,${revision}::bigint)`;
      return true;
    } catch (error) {
      if (!String(error?.message || "").includes("BOF_REFUND_SNAPSHOT_CHANGED") || attempt === 2) throw error;
      // Refetch both the revision and provider state; never resubmit the stale
      // aggregate with a newer revision. A busy order returns webhook 503.
    }
  }
}
const cents = (value) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value)))
    throw new Error("BOF_REFUND_AMOUNT_INVALID");
  return Math.round(Number(value) * 100);
};
function linkedCapture(resource) {
  const direct = resource?.supplementary_data?.related_ids?.capture_id;
  if (direct && /^[A-Z0-9]+$/i.test(direct)) return direct;
  for (const link of resource?.links || []) {
    if (link.rel !== "up") continue;
    try {
      const url = new URL(link.href);
      if (
        ![
          "api.paypal.com",
          "api-m.paypal.com",
          "api.sandbox.paypal.com",
          "api-m.sandbox.paypal.com",
        ].includes(url.hostname)
      )
        continue;
      const match = url.pathname.match(
        /^\/v2\/payments\/captures\/([A-Z0-9]+)$/i,
      );
      if (match) return match[1];
    } catch {}
  }
  return null;
}
async function paypalAdjustment(sql, payload, getAccess) {
  if (
    ![
      "PAYMENT.CAPTURE.REFUNDED",
      "PAYMENT.CAPTURE.REVERSED",
      "CUSTOMER.DISPUTE.CREATED",
    ].includes(payload.event_type)
  )
    return false;
  const dispute = payload.event_type !== "PAYMENT.CAPTURE.REFUNDED";
  const resource = payload.resource || {};
  const { accessToken, baseUrl } = await getAccess();
  const get = async (path) => {
    const r = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error("BOF_PAYPAL_ADJUSTMENT_RETRY");
    return r.json();
  };
  let refund = null,
    captureId = null;
  if (!dispute) {
    if (!/^[A-Z0-9]+$/i.test(resource.id || ""))
      throw new Error("BOF_REFUND_ID_INVALID");
    refund = await get(`/v2/payments/refunds/${resource.id}`);
    if (refund.status !== "COMPLETED") return true;
    captureId = linkedCapture(refund);
  } else
    captureId =
      payload.event_type === "CUSTOMER.DISPUTE.CREATED"
        ? resource.disputed_transactions?.[0]?.seller_transaction_id
        : resource.id;
  if (!/^[A-Z0-9]+$/i.test(captureId || ""))
    throw new Error("BOF_CAPTURE_ID_MISSING");
  const capture = await get(`/v2/payments/captures/${captureId}`);
  const providerOrder =
    capture.supplementary_data?.related_ids?.order_id || null;
  const rows =
    await sql`SELECT * FROM orders WHERE (paypal_capture_id=${captureId} OR (${providerOrder}::text IS NOT NULL AND paypal_order_id=${providerOrder})) AND NOT coalesce(is_test_order,false) LIMIT 1`;
  const order = rows[0];
  if (!order) return true;
  if (order.status === "pending")
    throw new Error("BOF_PAYMENT_BOOKKEEPING_PENDING");
  if (
    capture.amount?.currency_code !== "USD" ||
    cents(capture.amount?.value) !== Number(order.total_cents)
  )
    throw new Error("BOF_REFUND_BINDING_MISMATCH");
  let refunded = 0;
  if (refund) {
    if (refund.amount?.currency_code !== "USD")
      throw new Error("BOF_REFUND_CURRENCY_INVALID");
    const amount = cents(refund.amount.value);
    await sql`INSERT INTO bof_provider_refunds(provider,refund_id,order_id,amount_cents) VALUES('paypal',${refund.id},${order.id}::uuid,${amount}) ON CONFLICT DO NOTHING`;
    const sum =
      await sql`SELECT sum(amount_cents)::integer AS cents FROM bof_provider_refunds WHERE provider='paypal' AND order_id=${order.id}::uuid`;
    refunded = Number(sum[0].cents);
  }
  await bof.settle(sql, order);
  await bof.reverse(
    sql,
    order.id,
    refunded,
    Number(order.total_cents),
    dispute,
  );
  return true;
}
module.exports = { stripeAdjustment, paypalAdjustment, linkedCapture, cents, confirmedStripeRefunds, STRIPE_ADJUSTMENT_TYPES };
