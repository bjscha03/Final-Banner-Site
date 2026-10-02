"use strict";
const bof = require("./bof-service.cjs");
const runtime = require("./stripe-runtime-config.cjs");
async function cancelReservation(sql, memberId, orderId, event) {
  if (!/^[a-f0-9-]{36}$/i.test(String(orderId)))
    throw Object.assign(new Error("Choose a reserved checkout."), {
      statusCode: 400,
    });
  const rows =
    await sql`SELECT o.*,b.capture_started_at FROM bof_order_benefits b JOIN orders o ON o.id=b.order_id WHERE b.order_id=${orderId}::uuid AND b.wallet_member_id=${memberId}::uuid AND b.state='held'`;
  const order = rows[0];
  if (!order) return { ok: true };
  if (order.status !== "pending")
    throw Object.assign(
      new Error(
        "This payment is being completed. Refresh your balance shortly.",
      ),
      { statusCode: 409 },
    );
  if (order.stripe_payment_intent_id) {
    const config = runtime.resolveStripeRuntime({
      requireInternalJobSecret: false,
      requireEnabledFlag: false,
      event,
    });
    if (!config.enabled || config.mode !== "live")
      throw Object.assign(
        new Error(
          "Payment verification is temporarily unavailable. Your credit remains reserved.",
        ),
        { statusCode: 503 },
      );
    const Stripe = require("stripe");
    const stripe = new Stripe(config.secretKey);
    let intent = await stripe.paymentIntents.retrieve(
      order.stripe_payment_intent_id,
    );
    if (
      intent.metadata?.internal_order_id !== order.id ||
      Number(intent.amount) !== Number(order.total_cents)
    )
      throw new Error("BOF_PAYMENT_BINDING_MISMATCH");
    if (
      [
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
      ].includes(intent.status)
    )
      intent = await stripe.paymentIntents.cancel(intent.id);
    if (intent.status !== "canceled")
      throw Object.assign(
        new Error(
          "Your payment is still being verified. Please wait before starting another payment.",
        ),
        { statusCode: 409 },
      );
    await bof.release(sql, order);
  } else {
    const released =
      await sql`UPDATE bof_order_benefits SET state='released' WHERE order_id=${order.id}::uuid AND state='held' AND capture_started_at IS NULL RETURNING order_id`;
    if (!released.length)
      throw Object.assign(
        new Error(
          "Your payment is still being verified. Please wait before starting another payment.",
        ),
        { statusCode: 409 },
      );
  }
  return { ok: true };
}
module.exports = { cancelReservation };
