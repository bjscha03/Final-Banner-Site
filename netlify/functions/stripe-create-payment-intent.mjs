import '@neondatabase/serverless';
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import runtimeModule from './_shared/stripe-runtime-config.cjs';
import checkoutModule from './_shared/stripe-checkout-service.cjs';
import authModule from './_shared/server-auth.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
  'X-BOTF-Payment-Build': 'verified-followups-v2',
};
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

let stripeFactory = (secretKey) => new Stripe(secretKey);
let neonFactory = neon;

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  try {
    runtimeModule.assertSameOrigin(event);
  } catch (error) {
    return reply(error.statusCode || 403, { ok: false, error: error.code || 'ORIGIN_REJECTED' });
  }

  const runtime = runtimeModule.resolveStripeRuntime({ requireInternalJobSecret: true });
  if (!runtime.enabled) {
    console.error('[stripe-create] checkout configuration is not ready', {
      context: runtime.context,
      mode: runtime.mode,
      errors: runtime.errors,
    });
    return reply(503, { ok: false, error: 'STRIPE_NOT_CONFIGURED', message: 'Card and wallet checkout is temporarily unavailable.' });
  }

  let input;
  try {
    if (Buffer.byteLength(event.body || '', 'utf8') > 8 * 1024 * 1024) {
      return reply(413, { ok: false, error: 'CHECKOUT_PAYLOAD_TOO_LARGE' });
    }
    input = JSON.parse(event.body || '{}');
    // A browser-provided userId is not proof of account ownership. Bind the
    // pending order only to a signed server session; otherwise create a guest
    // order using the verified checkout email.
    const sessionUserId = authModule.getSession(event)?.sub || null;
    input = {
      ...input,
      userId: sessionUserId,
      user_id: sessionUserId,
    };
  } catch {
    return reply(400, { ok: false, error: 'INVALID_JSON' });
  }

  try {
    const stripe = stripeFactory(runtime.secretKey);
    const sql = neonFactory(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
    const result = await checkoutModule.startStripeCheckout({ input, runtime, stripe, sql });
    if (result.alreadyPaid && !result.intent) {
      return reply(200, checkoutModule.canonicalPaidPayload(result.order, { alreadyPaid: true }));
    }
    return reply(200, {
      ok: true,
      clientSecret: result.intent.client_secret,
      paymentIntentId: result.intent.id,
      orderId: result.order.id,
      internalOrderId: result.order.id,
      checkoutKey: result.checkoutKey,
      amount: Number(result.order.total_cents),
      currency: 'usd',
      status: result.intent.status,
    });
  } catch (error) {
    if (error instanceof checkoutModule.StripeCheckoutError || error?.name === 'StripePricingError') {
      return reply(error.statusCode || 409, {
        ok: false,
        error: error.code || 'CHECKOUT_REJECTED',
        message: error.message,
        ...(error.details && Object.keys(error.details).length ? { details: error.details } : {}),
      });
    }
    console.error('[stripe-create] failed', {
      type: error?.type || error?.name,
      code: error?.code || null,
      requestId: error?.requestId || null,
      message: error?.message || String(error),
    });
    return reply(500, {
      ok: false,
      error: 'STRIPE_CHECKOUT_START_FAILED',
      message: 'Payment could not be started. No confirmed charge was recorded; please try again.',
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
