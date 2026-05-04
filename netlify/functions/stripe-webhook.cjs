// Stripe webhook receiver.
//
// Configure this function's URL in the Stripe dashboard:
//   https://<site>/.netlify/functions/stripe-webhook
// and copy the resulting "Signing secret" into STRIPE_WEBHOOK_SECRET.
//
// On payment_intent.succeeded we look up the matching pending order
// (via stripe_payment_intent_id, falling back to metadata.order_id)
// and idempotently mark it 'paid' + send confirmation emails. This is
// the safety net for cases where the browser's confirmPayment callback
// never fires (tab closed, network drop, etc.) — the order still
// becomes visible in admin.
//
// Stripe requires the RAW request body to verify signatures. Netlify
// passes the body through `event.body`; if the request was base64
// encoded (`event.isBase64Encoded`) we decode to a Buffer first.

const Stripe = require('stripe');
const { finalizeStripeOrder } = require('./_shared/finalizeStripeOrder.cjs');

const responseHeaders = {
  'Content-Type': 'application/json',
};

function shippingFromIntent(intent) {
  const s = intent && intent.shipping;
  if (!s) return null;
  return {
    name: s.name || null,
    line1: s.address && s.address.line1,
    line2: s.address && s.address.line2,
    city: s.address && s.address.city,
    state: s.address && s.address.state,
    postal_code: s.address && s.address.postal_code,
    country: s.address && s.address.country,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    console.error('[stripe-webhook] missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: 'STRIPE_NOT_CONFIGURED' }),
    };
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!sigHeader) {
    return {
      statusCode: 400,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: 'MISSING_SIGNATURE' }),
    };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : event.body || '';

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err && err.message);
    return {
      statusCode: 400,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: 'INVALID_SIGNATURE' }),
    };
  }

  console.log('[stripe-webhook] received', {
    type: stripeEvent.type,
    id: stripeEvent.id,
  });

  try {
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded': {
        const pi = stripeEvent.data.object;
        const orderId = (pi.metadata && pi.metadata.order_id) || null;
        console.log('[stripe-webhook] payment_intent.succeeded', {
          paymentIntentId: pi.id,
          orderId,
          amount: pi.amount,
        });

        const result = await finalizeStripeOrder({
          paymentIntentId: pi.id,
          orderId,
          shipping: shippingFromIntent(pi),
          billing: pi.charges && pi.charges.data && pi.charges.data[0]
            ? pi.charges.data[0].billing_details || null
            : null,
          source: 'webhook',
        });

        if (!result.ok) {
          console.error('[stripe-webhook] finalizeStripeOrder failed:', result);
          // Return 200 anyway so Stripe doesn't infinitely retry on
          // configuration errors (e.g. ORDER_NOT_FOUND when the
          // PaymentIntent was created outside our normal flow). Real
          // outages will surface in our logs.
        } else {
          console.log('[stripe-webhook] order finalized', {
            paymentIntentId: pi.id,
            orderId: result.orderId,
            alreadyPaid: !!result.alreadyPaid,
            emailSent: !!result.emailSent,
          });
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = stripeEvent.data.object;
        console.warn('[stripe-webhook] payment_intent.payment_failed', {
          paymentIntentId: pi.id,
          orderId: pi.metadata && pi.metadata.order_id,
          lastPaymentError: pi.last_payment_error && pi.last_payment_error.message,
        });
        break;
      }
      default:
        console.log('[stripe-webhook] unhandled event type', stripeEvent.type);
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: 'HANDLER_ERROR' }),
    };
  }
};
