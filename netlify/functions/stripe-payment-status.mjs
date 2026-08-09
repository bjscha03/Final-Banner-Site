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

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  try { runtimeModule.assertSameOrigin(event); } catch (error) {
    return reply(error.statusCode || 403, { ok: false, error: error.code || 'ORIGIN_REJECTED' });
  }
  const runtime = runtimeModule.resolveStripeRuntime({ requireInternalJobSecret: true, requireEnabledFlag: false });
  if (!runtime.enabled) {
    return reply(503, {
      ok: false,
      paid: false,
      finalized: false,
      activePayment: true,
      safeToRetry: false,
      doNotRetry: true,
      paymentStatusUnknown: true,
      retryable: true,
      error: 'STRIPE_NOT_CONFIGURED',
    });
  }
  let input;
  try {
    if (Buffer.byteLength(event.body || '', 'utf8') > 64 * 1024) {
      return reply(413, { ok: false, error: 'STATUS_PAYLOAD_TOO_LARGE' });
    }
    input = JSON.parse(event.body || '{}');
  } catch { return reply(400, { ok: false, error: 'INVALID_JSON' }); }

  try {
    const checkoutKey = checkoutModule.validateCheckoutKey(input.checkoutKey);
    const requestedOrderId = String(input.orderId || input.internalOrderId || '').trim();
    const requestedPaymentIntentId = String(input.paymentIntentId || '').trim();
    if (requestedPaymentIntentId && !requestedPaymentIntentId.startsWith('pi_')) {
      return reply(400, { ok: false, error: 'PAYMENT_REFERENCE_INVALID' });
    }
    const sql = neonFactory(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
    let order = await checkoutModule.loadStripeOrder(sql, requestedOrderId
      ? { orderId: requestedOrderId, checkoutKey }
      : { checkoutKey });
    if (!order && !requestedOrderId && !requestedPaymentIntentId) {
      // A key-only recovery check is expected before the first durable payment
      // write when a browser is restoring local checkout state. Return a clean
      // non-error response so the browser can perform its bounded absence check
      // without emitting a misleading 404 in DevTools. Do not reveal whether a
      // different checkout key or order exists.
      return reply(200, {
        ok: true,
        paid: false,
        finalized: false,
        activePayment: false,
        safeToRetry: true,
        status: 'not_started',
        message: 'No payment was completed. Review the order and try again.',
      });
    }
    if (!order
        || (requestedPaymentIntentId && order.stripe_payment_intent_id !== requestedPaymentIntentId)) {
      return reply(404, { ok: false, error: 'PAYMENT_NOT_FOUND' });
    }
    if (String(order.payment_method || '').toLowerCase() !== 'stripe'
        || order.paypal_order_id
        || order.paypal_capture_id) {
      return reply(409, {
        ok: false,
        paid: false,
        finalized: false,
        activePayment: false,
        error: 'PAYMENT_PROVIDER_CONFLICT',
      });
    }

    const paymentIntentId = String(order.stripe_payment_intent_id || '').trim();
    if (!paymentIntentId) {
      return reply(200, {
        ok: true,
        paid: false,
        finalized: false,
        activePayment: false,
        safeToRetry: true,
        status: 'not_started',
        orderId: order.id,
      });
    }

    const stripe = stripeFactory(runtime.secretKey);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    try {
      checkoutModule.verifyIntentBinding(intent, order, checkoutKey);
    } catch (error) {
      // Stripe may already have accepted the payment. A binding discrepancy is
      // an operations/reconciliation incident, never permission to retry and
      // potentially submit a second charge.
      return reply(503, {
        ok: false,
        paid: false,
        finalized: false,
        activePayment: true,
        status: intent?.status || null,
        error: error?.code || 'PAYMENT_BINDING_INVALID',
        message: 'Payment verification needs additional time. Do not submit another payment.',
        retryable: true,
        doNotRetry: true,
        paymentStatusUnknown: true,
      });
    }
    if (intent.status === 'succeeded') {
      const finalized = await finalizerModule.finalizeStripeOrder({
        sql,
        intent,
        charge: typeof intent.latest_charge === 'object' ? intent.latest_charge : null,
        source: 'status',
      });
      if (finalized.settled) {
        order = finalized.order;
        const followupsQueued = await checkoutModule.queuePaidOrderFollowups(event, order.id);
        return reply(200, checkoutModule.canonicalPaidPayload(order, {
          activePayment: false,
          followupsQueued,
          bookkeepingPending: finalized.ok !== true,
        }));
      }
      // A succeeded Intent is a known captured payment even if local
      // reconciliation needs retry/manual repair. Never emit a terminal 409
      // that could re-enable checkout and cause a second charge.
      return reply(503, {
        ok: false,
        paid: true,
        finalized: false,
        activePayment: true,
        paymentCaptured: true,
        paymentStatusUnknown: true,
        reconciliationRequired: true,
        doNotRetry: true,
        safeToRetry: false,
        error: finalized.error,
        status: intent.status,
        retryable: true,
      });
    }

    const pending = ['processing', 'requires_action', 'requires_confirmation'].includes(intent.status);
    const providerErrorCode = intent?.last_payment_error?.code || null;
    const declineCode = intent?.last_payment_error?.decline_code || null;
    return reply(200, {
      ok: true,
      paid: false,
      finalized: false,
      status: intent.status,
      retryable: intent.status === 'requires_payment_method',
      pending,
      activePayment: pending,
      safeToRetry: ['requires_payment_method', 'canceled'].includes(intent.status),
      orderId: order.id,
      paymentIntentId,
      ...(providerErrorCode ? { providerCode: providerErrorCode } : {}),
      ...(declineCode ? { declineCode } : {}),
      // If the server-side confirmation reached Stripe but its response was
      // lost, the browser can discover `requires_action` only through this
      // recovery endpoint. Return the client secret solely after the exact
      // order, checkout-key, PaymentIntent, amount, currency and metadata
      // binding above has passed, so Stripe.js can safely resume 3DS/wallet
      // authentication with handleNextAction instead of starting a new charge.
      ...(intent.status === 'requires_action' && intent.client_secret
        ? { clientSecret: intent.client_secret, requiresAction: true }
        : {}),
      message: pending
        ? 'Your payment is still being verified.'
        : 'Payment was not completed. You can safely try again.',
    });
  } catch (error) {
    if (error instanceof checkoutModule.StripeCheckoutError) {
      return reply(error.statusCode || 409, { ok: false, error: error.code, message: error.message });
    }
    console.error('[stripe-payment-status] failed', {
      type: error?.type || error?.name,
      code: error?.code || null,
      requestId: error?.requestId || null,
      message: error?.message || String(error),
    });
    return reply(503, {
      ok: false,
      paid: false,
      finalized: false,
      activePayment: true,
      safeToRetry: false,
      doNotRetry: true,
      paymentStatusUnknown: true,
      error: 'PAYMENT_STATUS_UNAVAILABLE',
      retryable: true,
    });
  }
};

export const _test = {
  handler,
  resetFactories() {
    stripeFactory = (secretKey) => new Stripe(secretKey);
    neonFactory = neon;
  },
  setStripeFactory(factory) { stripeFactory = factory; },
  setNeonFactory(factory) { neonFactory = factory; },
};
export default withLambda(handler);

// Explicit entrypoint marker prevents an incremental deploy from reusing a
// pre-verification settlement artifact.
