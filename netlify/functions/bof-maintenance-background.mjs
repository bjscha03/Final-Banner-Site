import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import bof from "./_shared/bof-service.cjs";
import email from "./_shared/bof-email.cjs";
import auth from "./_shared/server-auth.cjs";
import runtime from "./_shared/stripe-runtime-config.cjs";
import queries from "./_shared/bof-maintenance-queries.cjs";
import rewardEmail from "./_shared/bof-reward-email.cjs";
// Scheduled functions run on the published deploy only. The request cannot
// turn on this job: launch gates are server configuration, not query/body data.
export default async function handler(request) {
  const expected = Buffer.from(process.env.INTERNAL_JOB_SECRET || ""),
    supplied = Buffer.from(request.headers.get("x-internal-job-secret") || "");
  if (
    !expected.length ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return new Response("Unauthorized", { status: 401 });
  if (
    auth.isDeployPreviewEnvironment({}) ||
    !process.env.BOF_REFERRAL_LAUNCHED_AT
  )
    return new Response("Inactive");
  const sql = neon(
    process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL,
  );
  await bof.sync(sql);
  const refunds = await queries.pendingRefunds(sql);
  for (const r of refunds)
    await bof.reverse(sql, r.order_id, Number(r.cents), Number(r.total_cents));
  // Reconcile refunds before notifying; recover missed sends and announce
  // rewards that have reached their 14-day availability date.
  await rewardEmail.dispatchSafely(sql);
  const held =
    await sql`SELECT o.*,b.capture_started_at FROM bof_order_benefits b JOIN orders o ON o.id=b.order_id WHERE b.state='held' AND o.status='pending' AND NOT coalesce(o.is_test_order,false) AND b.created_at<now()-interval '24 hours' LIMIT 20`;
  const stripeRuntime = runtime.resolveStripeRuntime({
    requireInternalJobSecret: false,
    requireEnabledFlag: false,
  });
  const stripe =
    stripeRuntime.enabled && stripeRuntime.mode === "live"
      ? new Stripe(stripeRuntime.secretKey)
      : null;
  for (const order of held) {
    try {
      if (order.stripe_payment_intent_id && stripe) {
        let intent = await stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id,
        );
        if (
          intent.metadata?.internal_order_id !== order.id ||
          intent.amount !== Number(order.total_cents)
        )
          continue;
        if (
          [
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
          ].includes(intent.status)
        )
          intent = await stripe.paymentIntents.cancel(intent.id);
        if (intent.status === "canceled") await bof.release(sql, order);
      } else if (!order.stripe_payment_intent_id && !order.capture_started_at) {
        // Row locking and the conditional update serialize with begin_payment.
        await sql`UPDATE bof_order_benefits SET state='released' WHERE order_id=${order.id}::uuid AND state='held' AND capture_started_at IS NULL`;
      }
    } catch (error) {
      console.error("[bof-maintenance] reservation retained", {
        orderId: order.id,
        code: error.code || null,
      });
    }
  }
  if (bof.active()) {
    const launched = new Date(process.env.BOF_REFERRAL_LAUNCHED_AT);
    if (Number.isNaN(launched.getTime()))
      throw new Error("BOF_REFERRAL_LAUNCHED_AT must be an ISO timestamp");
    await sql`INSERT INTO bof_order_touchpoints(order_id) SELECT id FROM orders WHERE status IN ('shipped','delivered','fulfilled') AND created_at>=${launched.toISOString()}::timestamptz AND NOT coalesce(is_test_order,false) ON CONFLICT DO NOTHING`;
    const due = await queries.dueInvitations(
      sql,
      launched.toISOString(),
      email.CAMPAIGN,
    );
    for (const customer of due) await email.sendInvitation(sql, customer.email);
  }
  await sql`DELETE FROM bof_rate_limits WHERE expires_at<now()`;
  return new Response("BOF Cash reconciled");
}
