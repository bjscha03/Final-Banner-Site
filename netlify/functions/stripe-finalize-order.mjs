import '@neondatabase/serverless';
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

const parseInput = (event) => {
  try { return JSON.parse(event.body || '{}'); } catch { return null; }
};

const loadBoundOrder = async (sql, input) => {
  const orderId = String(input?.orderId || input?.internalOrderId || '').trim();
  const checkoutKey = checkoutModule.validateCheckoutKey(input?.checkoutKey);
  const paymentIntentId = String(input?.paymentIntentId || '').trim();
  if (!orderId || !paymentIntentId.startsWith('pi_')) {
    throw new checkoutModule.StripeCheckoutError('PAYMENT_REFERENCE_INVALID', 'Payment verification information is incomplete.', 400);
  }
  const order = await checkoutModule.loadStripeOrder(sql, { orderId, checkoutKey });
  if (!order || order.stripe_payment_intent_id !== paymentIntentId) {
    throw new checkoutModule.StripeCheckoutError('PAYMENT_NOT_FOUND', 'This payment could not be verified.', 404);
  }
  return { checkoutKey, order, paymentIntentId };
};

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  try { runtimeModule.assertSameOrigin(event); } catch (error) {
    return reply(error.statusCode || 403, { ok: false, error: error.code || 'ORIGIN_REJECTED' });
  }
  // Completion stays available after an emergency UI kill switch so an
  // already-authorized payment can never be orphaned.
  const runtime = runtimeModule.resolveStripeRuntime({
    requireInternalJobSecret: true,
    requireEnabledFlag: false,
    event,
  });
  if (!runtime.enabled) return reply(503, { ok: false, error: 'STRIPE_NOT_CONFIGURED' });
  const input = parseInput(event);
  if (!input) return reply(400, { ok: false, error: 'INVALID_JSON' });

  try {
    const stripe = stripeFactory(runtime.secretKey);
    const sql = neonFactory(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
    const bound = await loadBoundOrder(sql, input);
    const intent = await stripe.paymentIntents.retrieve(bound.paymentIntentId, { expand: ['latest_charge'] });
    try {
      checkoutModule.verifyIntentBinding(intent, bound.order, bound.checkoutKey);
    } catch (error) {
      return reply(503, {
        ok: false,
        paid: false,
        finalized: false,
        status: intent?.status || null,
        error: error?.code || 'PAYMENT_BINDING_INVALID',
        message: 'Payment verification needs additional time. Do not submit another payment.',
        retryable: true,
        doNotRetry: true,
        paymentStatusUnknown: true,
      });
    }

    if (intent.status !== 'succeeded') {
      const processing = ['processing', 'requires_action', 'requires_confirmation'].includes(intent.status);
      return reply(processing ? 202 : 409, {
        ok: processing,
        paid: false,
        finalized: false,
        status: intent.status,
        retryable: intent.status === 'requires_payment_method',
        message: processing
          ? 'Your payment is still being verified. Keep this page open.'
          : 'Payment was not completed. Check your payment details and try again.',
      });
    }

    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const finalized = await finalizerModule.finalizeStripeOrder({
      sql,
      intent,
      charge,
      source: 'browser',
    });
    if (!finalized.ok && !finalized.settled) {
      // Stripe has already reported a captured payment. Even a non-retriable
      // reconciliation defect (for example a mode/binding incident requiring
      // operations) must never look like permission to submit another charge.
      return reply(503, {
        ok: false,
        paid: true,
        finalized: false,
        paymentCaptured: true,
        reconciliationRequired: true,
        doNotRetry: true,
        retryable: true,
        status: 'succeeded',
        error: finalized.error,
        message: 'Payment is still being verified. Do not submit another payment.',
      });
    }

    // Payment/order settlement is the browser's success boundary. Queue
    // notification/PDF work, but never hold the wallet UI open while an email
    // provider responds; the signed webhook retries incomplete follow-ups.
    const followupsQueued = await checkoutModule.queuePaidOrderFollowupsInBackground(event, finalized.order.id);
    return reply(200, checkoutModule.canonicalPaidPayload(finalized.order, {
      alreadyPaid: finalized.alreadyPaid === true,
      followupsQueued,
      bookkeepingPending: finalized.ok !== true,
    }));
  } catch (error) {
    if (error instanceof checkoutModule.StripeCheckoutError) {
      return reply(error.statusCode || 409, { ok: false, error: error.code, message: error.message });
    }
    console.error('[stripe-finalize-browser] failed', {
      type: error?.type || error?.name,
      code: error?.code || null,
      requestId: error?.requestId || null,
      message: error?.message || String(error),
    });
    return reply(503, {
      ok: false,
      paid: false,
      finalized: false,
      error: 'PAYMENT_VERIFICATION_DELAYED',
      message: 'Payment verification is taking longer than expected. Keep this page open; do not submit another payment.',
    });
  }
};

export const _test = {
  handler,
  loadBoundOrder,
  resetFactories() {
    stripeFactory = (secretKey) => new Stripe(secretKey);
    neonFactory = neon;
  },
  setStripeFactory(factory) { stripeFactory = factory; },
  setNeonFactory(factory) { neonFactory = factory; },
};
export default withLambda(handler);
