// Stripe webhook receiver.
//
// Configure this function's URL in the Stripe dashboard:
//   https://<site>/.netlify/functions/stripe-webhook
// and copy the resulting "Signing secret" into STRIPE_WEBHOOK_SECRET.
//
// Primary purpose: confirm payment_intent.succeeded events from Stripe
// as a backup safety net. The browser-side `confirmPayment` flow is
// what normally calls /create-order to mark the order paid; this
// webhook just logs / can be extended to trigger reconciliation if
// the browser callback never fires (network drop, tab close, etc.).
//
// Stripe requires the RAW request body to verify signatures. Netlify
// passes the body through `event.body`; if the request was base64
// encoded (`event.isBase64Encoded`) we decode to a Buffer first.

const Stripe = require('stripe');

const responseHeaders = {
  'Content-Type': 'application/json',
};

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
    console.error('stripe-webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
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
    console.error('stripe-webhook: signature verification failed:', err && err.message);
    return {
      statusCode: 400,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: 'INVALID_SIGNATURE' }),
    };
  }

  console.log('stripe-webhook: received', {
    type: stripeEvent.type,
    id: stripeEvent.id,
  });

  try {
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded': {
        const pi = stripeEvent.data.object;
        console.log('stripe-webhook: payment_intent.succeeded', {
          paymentIntentId: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          email: (pi.receipt_email || (pi.metadata && pi.metadata.email)) || null,
        });
        // Order creation is performed from the browser after
        // stripe.confirmPayment resolves. The browser callback hits
        // /.netlify/functions/create-order with stripe_payment_intent_id
        // and that endpoint is idempotent on stripe_payment_intent_id, so
        // a duplicate attempt here would no-op. Reconciliation logic can
        // be added in the future if needed.
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = stripeEvent.data.object;
        console.warn('stripe-webhook: payment_intent.payment_failed', {
          paymentIntentId: pi.id,
          lastPaymentError: pi.last_payment_error && pi.last_payment_error.message,
        });
        break;
      }
      default:
        // Acknowledge unhandled events so Stripe stops retrying.
        console.log('stripe-webhook: unhandled event type', stripeEvent.type);
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error('stripe-webhook: handler error:', err);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: 'HANDLER_ERROR' }),
    };
  }
};
