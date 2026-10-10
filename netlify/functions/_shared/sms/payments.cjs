'use strict';

const crypto = require('node:crypto');
const Stripe = require('stripe');
const checkout = require('../stripe-checkout-service.cjs');
const finalizer = require('../finalizeStripeOrder.cjs');
const runtimeModule = require('../stripe-runtime-config.cjs');
const { getSession, queueReply } = require('./store.cjs');
const { itemFor, quoteFor } = require('./conversation.cjs');
const { orderUrl, settings } = require('./runtime.cjs');

function fail(code, message, statusCode = 409) { throw Object.assign(new Error(message), { code, statusCode }); }
function stripeRuntime(event = {}) {
  const runtime = runtimeModule.resolveStripeRuntime({ requireEnabledFlag: false, requireInternalJobSecret: true, event });
  if (!runtime.enabled) fail('SMS_PAYMENT_UNAVAILABLE', 'Secure payment is temporarily unavailable. Please try again shortly.', 503);
  return runtime;
}
function stripeClient(event) {
  const runtime = stripeRuntime(event);
  return { runtime, stripe: new Stripe(runtime.secretKey, { apiVersion: '2026-08-26.dahlia' }) };
}
async function salesTaxRate(stripe) {
  const existing = await stripe.taxRates.list({ active: true, limit: 100 });
  const rate = existing.data.find((item) => item.metadata?.bof_sms === 'v1' && !item.inclusive && Number(item.percentage) === 6);
  if (rate) return rate.id;
  return (await stripe.taxRates.create({ display_name: 'Sales tax', percentage: 6, inclusive: false, metadata: { bof_sms: 'v1' } },
    { idempotencyKey: 'bof-sms-sales-tax-six-percent-v1' })).id;
}
function integrationIdentifier(id) {
  const suffix = crypto.createHash('sha256').update(id).digest('hex').slice(0, 8)
    .split('').map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16))).join('');
  return `bof_sms_checkout_${suffix}`;
}
function hostedParameters({ session, order, item, customer, taxRate, config }) {
  const metadata = { bof_sms: 'v1', sms_session_id: session.id, internal_order_id: order.id, approved_revision: String(session.revision) };
  const discountedSubtotal = Number(order.subtotal_cents) - Number(order.applied_discount_cents || 0);
  const url = orderUrl(session, config);
  return {
    mode: 'payment', customer_email: customer.email,
    integration_identifier: integrationIdentifier(session.id),
    client_reference_id: order.id, metadata,
    line_items: [{ quantity: 1, tax_rates: [taxRate], price_data: {
      currency: 'usd', unit_amount: discountedSubtotal,
      product_data: { name: `${item.quantity} banner${item.quantity > 1 ? 's' : ''}: ${item.width_in} x ${item.height_in} in`,
        description: `${item.material} vinyl${item.material === 'mesh' ? ' (mesh)' : ''}. Your approved artwork. U.S. shipping included.`,
        images: [session.artwork.previewUrl] },
    } }],
    payment_intent_data: {
      description: checkout.stripePaymentDescription(order, [item]),
      metadata: { ...checkout.stripeOrderMetadata(order, [item]), ...metadata,
        checkout_key_hash: checkout.checkoutKeyHash(session.checkout_key) },
      shipping: { name: customer.shipping.name, phone: session.phone, address: {
        line1: customer.shipping.line1, ...(customer.shipping.line2 ? { line2: customer.shipping.line2 } : {}),
        city: customer.shipping.city, state: customer.shipping.state, postal_code: customer.shipping.postalCode, country: 'US',
      } },
    },
    success_url: `${url}?payment=received`, cancel_url: url,
  };
}

async function createCheckout({ sql, session, input, event, config = settings(), stripe: suppliedStripe, runtime: suppliedRuntime }) {
  if (!['APPROVED', 'PAYMENT'].includes(session.step) || session.approved_revision !== session.revision || !session.artwork) {
    fail('SMS_ARTWORK_APPROVAL_REQUIRED', 'Approve the current artwork before payment.');
  }
  const acquired = await sql`UPDATE bof_sms_sessions SET checkout_lock_until = NOW() + INTERVAL '2 minutes'
    WHERE id = ${session.id} AND step IN ('APPROVED', 'PAYMENT') AND approved_revision = revision
      AND revision = ${session.revision} AND (checkout_lock_until IS NULL OR checkout_lock_until < NOW())
      AND NOT EXISTS (SELECT 1 FROM bof_sms_inbound WHERE phone = ${session.phone} AND status IN ('pending', 'processing')) RETURNING id`;
  if (!acquired[0]) fail('SMS_CHECKOUT_IN_PROGRESS', 'Payment is being prepared. Please wait a moment and try again.');
  try {
    const { stripe, runtime } = suppliedStripe ? { stripe: suppliedStripe, runtime: suppliedRuntime } : stripeClient(event);
    if (runtime.mode !== config.mode) fail('SMS_PAYMENT_MODE_MISMATCH', 'Payment mode does not match this text-order environment.', 503);
    if (session.stripe_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(session.stripe_session_id, { expand: ['payment_intent'] });
      if (existing.status === 'complete') {
        const intent = typeof existing.payment_intent === 'string'
          ? await stripe.paymentIntents.retrieve(existing.payment_intent) : existing.payment_intent;
        if (existing.payment_status !== 'unpaid' || !['requires_payment_method', 'canceled'].includes(intent?.status)) {
          fail('SMS_PAYMENT_ALREADY_SUBMITTED', 'Your payment is being confirmed. Please refresh shortly.');
        }
        // A definitive asynchronous failure may need a new Checkout Session.
        // Make the previous intent terminal before permitting another attempt.
        if (intent.status !== 'canceled') await stripe.paymentIntents.cancel(intent.id);
      }
      if (existing.status === 'open') return { url: existing.url };
      const next = await sql`UPDATE bof_sms_sessions SET stripe_session_id = NULL, payment_url = NULL,
        checkout_attempt = checkout_attempt + 1 WHERE id = ${session.id} AND stripe_session_id = ${session.stripe_session_id} RETURNING *`;
      session = next[0] || await getSession(sql, session.id);
    }
    const item = itemFor(session);
    const expected = quoteFor(session);
    const customer = checkout.normalizeCustomer({ ...input, customer: { ...input.customer, phone: session.phone } });
    if (!session.order_id) {
      const pending = await checkout.createPendingOrderDirect({
        input: { attribution: { utm_source: 'twilio', utm_medium: 'sms', utm_campaign: 'text-to-order' } },
        items: [item], customer, checkoutKey: session.checkout_key, mode: runtime.mode,
      });
      const bound = await sql`UPDATE bof_sms_sessions SET order_id = ${pending.orderId}
        WHERE id = ${session.id} AND (order_id IS NULL OR order_id = ${pending.orderId}) RETURNING *`;
      if (!bound[0]) fail('SMS_ORDER_BINDING_CONFLICT', 'The saved order could not be verified.', 503);
      session = bound[0];
    }
    const order = await checkout.loadStripeOrder(sql, { orderId: session.order_id, checkoutKey: session.checkout_key });
    if (!order || order.status !== 'pending' || Number(order.total_cents) !== expected.total_cents) {
      fail('SMS_ORDER_TOTAL_CHANGED', 'The saved order total changed. Please restart your text order.');
    }
    if (!checkout.pendingCustomerDetailsMatch(order, customer) || order.email !== customer.email) {
      fail('SMS_CUSTOMER_DETAILS_CHANGED', 'Reply RESTART in your text conversation to change shipping details and prepare a fresh order.');
    }
    const taxRate = await salesTaxRate(stripe);
    const hosted = await stripe.checkout.sessions.create(hostedParameters({ session, order, item, customer, taxRate, config }), {
      idempotencyKey: `bof-sms:${session.id}:${session.revision}:${session.checkout_attempt}`,
    });
    if (!hosted.url || hosted.amount_total !== Number(order.total_cents) || hosted.livemode !== (runtime.mode === 'live')) {
      if (hosted.status === 'open') await stripe.checkout.sessions.expire(hosted.id);
      fail('SMS_PROVIDER_TOTAL_MISMATCH', 'Payment could not be safely prepared. No charge was attempted.', 503);
    }
    await sql`UPDATE bof_sms_sessions SET stripe_session_id = ${hosted.id}, payment_url = ${hosted.url},
      step = 'PAYMENT', updated_at = NOW() WHERE id = ${session.id} AND approved_revision = ${session.revision}`;
    return { url: hosted.url };
  } finally {
    await sql`UPDATE bof_sms_sessions SET checkout_lock_until = NULL WHERE id = ${session.id}`;
  }
}

async function cancelCheckout(sql, session, event) {
  if (session.checkout_lock_until && new Date(session.checkout_lock_until).getTime() > Date.now()) {
    fail('SMS_CHECKOUT_IN_PROGRESS', 'Payment is being prepared. Please wait a moment before changing the order.');
  }
  if (session.stripe_session_id) {
    const { stripe } = stripeClient(event);
    const hosted = await stripe.checkout.sessions.retrieve(session.stripe_session_id);
    if (hosted.status === 'complete') fail('SMS_PAYMENT_ALREADY_SUBMITTED', 'Payment has been submitted. Email support@bannersonthefly.com for order changes.');
    if (hosted.status === 'open') await stripe.checkout.sessions.expire(hosted.id);
  }
  if (session.order_id) await sql`UPDATE orders SET status = 'cancelled', updated_at = NOW()
    WHERE id = ${session.order_id} AND status = 'pending' AND stripe_payment_intent_id IS NULL`;
  await sql`UPDATE bof_sms_sessions SET step = 'CANCELED', updated_at = NOW() WHERE id = ${session.id} AND step != 'PAID'`;
}

function matchesProviderSession(session, hosted, intent, runtime) {
  return hosted.id === session.stripe_session_id && hosted.metadata?.bof_sms === 'v1'
    && hosted.metadata.sms_session_id === session.id && hosted.metadata.internal_order_id === session.order_id
    && Number(hosted.metadata.approved_revision) === session.approved_revision
    && session.approved_revision === session.revision && hosted.livemode === (runtime.mode === 'live')
    && intent?.metadata?.bof_sms === 'v1' && intent.metadata.sms_session_id === session.id
    && Number(intent.metadata.approved_revision) === session.approved_revision
    && intent.metadata.internal_order_id === session.order_id && intent.livemode === hosted.livemode
    && intent.currency === 'usd' && hosted.currency === 'usd' && hosted.amount_total === intent.amount
    && intent.metadata.checkout_key_hash === checkout.checkoutKeyHash(session.checkout_key);
}

async function handleStripeEvent({ sql, stripe, stripeEvent, runtime, event, config = settings(), finalize = finalizer.finalizeStripeOrder, queueFollowups = checkout.queuePaidOrderFollowups }) {
  const object = stripeEvent.data.object;
  const sessionId = object.metadata?.sms_session_id;
  if (!sessionId || object.metadata?.bof_sms !== 'v1') return false;
  const session = await getSession(sql, sessionId);
  if (!session?.stripe_session_id || !session.order_id) fail('SMS_PAYMENT_SESSION_NOT_SAVED', 'Payment session is not yet saved.', 503);
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded', 'checkout.session.async_payment_failed'].includes(stripeEvent.type)) return true;
  const hosted = await stripe.checkout.sessions.retrieve(session.stripe_session_id, { expand: ['payment_intent.latest_charge'] });
  const intent = typeof hosted.payment_intent === 'string'
    ? await stripe.paymentIntents.retrieve(hosted.payment_intent, { expand: ['latest_charge'] }) : hosted.payment_intent;
  if (!matchesProviderSession(session, hosted, intent, runtime)) fail('SMS_PAYMENT_BINDING_INVALID', 'Payment binding does not match the approved order.');
  if (stripeEvent.type === 'checkout.session.async_payment_failed') {
    if (hosted.payment_status !== 'paid') await queueReply(sql, { key: `payment-failed:${hosted.id}`, session,
      body: `BOF: Your payment was unsuccessful. Reply PAY to try again: ${orderUrl(session, config)}` });
    return true;
  }
  if (hosted.payment_status !== 'paid' || intent.status !== 'succeeded') return true;
  const order = await checkout.loadStripeOrder(sql, { orderId: session.order_id, checkoutKey: session.checkout_key });
  if (!order || Number(order.total_cents) !== intent.amount) fail('SMS_PAYMENT_AMOUNT_MISMATCH', 'Payment does not match the saved total.');
  const attached = await sql`UPDATE orders SET stripe_payment_intent_id = ${intent.id}, payment_reconciliation_status = 'awaiting_confirmation', updated_at = NOW()
    WHERE id = ${order.id} AND payment_method = 'stripe' AND paypal_order_id IS NULL AND paypal_capture_id IS NULL
      AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = ${intent.id}) RETURNING id`;
  if (!attached[0]) fail('SMS_PAYMENT_ATTACH_CONFLICT', 'Another payment is already bound to this order.');
  const result = await finalize({ sql, intent, charge: typeof intent.latest_charge === 'object' ? intent.latest_charge : null,
    source: 'sms-webhook', paymentEventId: stripeEvent.id });
  if (!result.settled || !result.ok) fail(result.error || 'SMS_PAYMENT_FINALIZE_RETRY', 'Order confirmation will retry.', 503);
  if (!await queueFollowups(event, order.id)) fail('SMS_PAYMENT_FOLLOWUPS_RETRY', 'Order notifications will retry.', 503);
  const numbers = await sql`SELECT order_number FROM orders WHERE id = ${order.id}`;
  const rawNumber = String(numbers[0]?.order_number || '');
  const reference = rawNumber ? (rawNumber.startsWith('BOF-') ? rawNumber : `BOF-${rawNumber.padStart(6, '0')}`) : checkout.stripeOrderReference(order.id);
  await queueReply(sql, { key: `payment-confirmed:${order.id}`, session,
    body: `Banners On The Fly: Payment received! Order ${reference} is confirmed. Your receipt is on its way by email. We will print the artwork you approved.` });
  await sql`UPDATE bof_sms_sessions SET step = 'PAID', error_code = NULL, updated_at = NOW() WHERE id = ${session.id}`;
  return true;
}

module.exports = { stripeRuntime, stripeClient, hostedParameters, integrationIdentifier, createCheckout, cancelCheckout, matchesProviderSession, handleStripeEvent };
