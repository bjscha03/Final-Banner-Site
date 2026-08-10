import '@neondatabase/serverless';
// notify-order loads Resend dynamically from the shared CommonJS handler.
// This direct entrypoint import makes Netlify include the package in the
// webhook artifact instead of failing every paid-order notification at runtime.
import 'resend';
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import runtimeModule from './_shared/stripe-runtime-config.cjs';
import checkoutModule from './_shared/stripe-checkout-service.cjs';
import finalizerModule from './_shared/finalizeStripeOrder.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
  'X-BOTF-Payment-Build': 'verified-followups-v3',
};
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
let stripeFactory = (secretKey) => new Stripe(secretKey);
let neonFactory = neon;

const headerValue = (headersObject, wanted) => {
  const key = Object.keys(headersObject || {}).find((candidate) => candidate.toLowerCase() === wanted.toLowerCase());
  return key ? String(headersObject[key] || '').trim() : '';
};

const rawWebhookBody = (event) => (
  event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : event.body || ''
);

const handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  const runtime = runtimeModule.resolveStripeRuntime({
    requireInternalJobSecret: true,
    requireEnabledFlag: false,
  });
  if (!runtime.enabled) {
    console.error('[stripe-webhook] configuration unavailable', {
      context: runtime.context,
      mode: runtime.mode,
      errors: runtime.errors,
    });
    return reply(503, { ok: false, error: 'STRIPE_NOT_CONFIGURED' });
  }

  const signature = headerValue(event.headers, 'stripe-signature');
  if (!signature) return reply(400, { ok: false, error: 'MISSING_SIGNATURE' });

  const stripe = stripeFactory(runtime.secretKey);
  let stripeEvent;
  try {
    // Netlify passes the unparsed request payload through event.body. Signature
    // verification must happen before any JSON parsing or mutation.
    stripeEvent = stripe.webhooks.constructEvent(
      rawWebhookBody(event),
      signature,
      runtime.webhookSecret,
    );
  } catch (error) {
    console.warn('[stripe-webhook] signature rejected', { message: error?.message || String(error) });
    return reply(400, { ok: false, error: 'INVALID_SIGNATURE' });
  }

  const eventIntent = stripeEvent?.data?.object;
  const isBofCheckout = eventIntent?.metadata?.bof_checkout === 'v2';
  if (!isBofCheckout) {
    // The Stripe account can host other products. Authenticated events without
    // our metadata namespace are deliberately acknowledged and ignored.
    return reply(200, { received: true, ignored: true });
  }

  const sql = neonFactory(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
  try {
    if (stripeEvent.type === 'payment_intent.succeeded') {
      const intent = await stripe.paymentIntents.retrieve(eventIntent.id, { expand: ['latest_charge'] });
      const finalized = await finalizerModule.finalizeStripeOrder({
        sql,
        intent,
        charge: typeof intent.latest_charge === 'object' ? intent.latest_charge : null,
        source: 'webhook',
        paymentEventId: stripeEvent.id,
      });
      if (!finalized.settled) {
        console.error('[stripe-webhook] paid intent could not be fulfilled', {
          eventId: stripeEvent.id,
          paymentIntentId: eventIntent.id,
          error: finalized.error,
          retriable: finalized.retriable,
        });
        return reply(finalized.retriable ? 503 : 409, { ok: false, error: finalized.error });
      }

      const followupsQueued = await checkoutModule.queuePaidOrderFollowups(event, finalized.order.id);
      if (!finalized.ok || !followupsQueued) {
        // A paid order exists, but returning non-2xx asks Stripe to retry until
        // all fulfillment bookkeeping has been safely queued/completed.
        return reply(503, {
          ok: false,
          error: !finalized.ok ? finalized.error : 'FOLLOWUPS_NOT_QUEUED',
          settled: true,
        });
      }
      return reply(200, {
        received: true,
        orderId: finalized.order.id,
        alreadyPaid: finalized.alreadyPaid === true,
      });
    }

    if (['payment_intent.payment_failed', 'payment_intent.canceled'].includes(stripeEvent.type)) {
      let order = await checkoutModule.loadStripeOrder(sql, { paymentIntentId: eventIntent.id });
      if (!order && eventIntent?.metadata?.internal_order_id) {
        const currentOrder = await checkoutModule.loadStripeOrder(sql, {
          orderId: eventIntent.metadata.internal_order_id,
        });
        if (currentOrder && currentOrder.stripe_payment_intent_id !== eventIntent.id) {
          // A canceled terminal Intent can be replaced after the customer
          // retries. Its delayed failure/cancel webhook must not overwrite the
          // reconciliation state of the newer bound Intent or retry forever.
          return reply(200, { received: true, ignored: true, displaced: true });
        }
        order = currentOrder;
      }
      if (!order) return reply(503, { ok: false, error: 'ORDER_NOT_FOUND' });
      checkoutModule.verifyIntentBinding(eventIntent, order);
      if (stripeEvent.type === 'payment_intent.payment_failed') {
        // PaymentIntents are intentionally reused after a decline. A delayed
        // failure event from attempt A can arrive after attempt B has already
        // reclaimed the same reservation and begun authentication. Releasing
        // from the historical event would let a different checkout claim the
        // code while B can still succeed. Preserve the reservation; the
        // synchronous definitive response handles immediate release, and the
        // same owning order is always allowed to retry.
        return reply(200, { received: true, reservationPreserved: true });
      }

      // Cancellation is terminal, but retrieve the current canonical state so
      // a stale/out-of-order snapshot can never release an active reservation.
      const currentIntent = await stripe.paymentIntents.retrieve(eventIntent.id);
      checkoutModule.verifyIntentBinding(currentIntent, order);
      if (currentIntent.status !== 'canceled') {
        return reply(200, { received: true, ignored: true, stale: true });
      }
      await checkoutModule.releaseOrderDiscountClaim(sql, order, 'canceled');
      return reply(200, { received: true });
    }

    return reply(200, { received: true, ignored: true });
  } catch (error) {
    console.error('[stripe-webhook] retriable processing failure', {
      eventId: stripeEvent?.id || null,
      type: stripeEvent?.type || null,
      paymentIntentId: eventIntent?.id || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
    return reply(503, { ok: false, error: 'WEBHOOK_PROCESSING_FAILED' });
  }
};

export const _test = {
  handler,
  headerValue,
  rawWebhookBody,
  resetFactories() {
    stripeFactory = (secretKey) => new Stripe(secretKey);
    neonFactory = neon;
  },
  setStripeFactory(factory) { stripeFactory = factory; },
  setNeonFactory(factory) { neonFactory = factory; },
};
export default withLambda(handler);
