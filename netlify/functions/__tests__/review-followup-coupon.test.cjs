'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { _test: { createDataAccess, ensureReviewRequestSchema, processReviewRequest, sendReviewEmailWithRetry } } = require('../_shared/review-request-handler.cjs');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const { claimPaymentDiscount, completePaymentDiscount } = require('../_shared/payment-discount-reservation.cjs');
const { createReviewRequestEmailData, REVIEW_URL } = require('../_shared/review-request-email.cjs');
const orderId = '2ad3018b-680a-463e-b761-9fdcf8a0d993';
const checkoutId = '11111111-1111-4111-8111-111111111111';
const emailConfig = { from: 'orders@example.com', replyTo: 'support@example.com' };
let db, sql, data;
test.before(async () => {
  db = new PGlite();
  sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  await db.exec(`
    CREATE TABLE profiles (id uuid primary key, email text, full_name text);
    CREATE TABLE orders (id uuid primary key, user_id uuid, email text, customer_name text, status text,
      partial_refund_cents integer default 0, payment_method text, is_test_order boolean default false, checkout_idempotency_key text,
      payment_reconciliation_status text, abandoned_cart_id uuid, updated_at timestamptz,
      discount_code text, applied_discount_type text, applied_discount_cents integer);
    CREATE TABLE discount_codes (id uuid primary key default gen_random_uuid(), code text unique not null,
      discount_percentage integer, discount_amount_cents integer, email text, single_use boolean,
      used boolean, used_at timestamptz, used_by_user_id uuid, used_by_email text[],
      max_uses_per_customer integer, max_total_uses integer, campaign text, cart_id uuid,
      order_id uuid, discount_scope text, activated_at timestamptz, eligible_cart_item_ids jsonb, max_discount_amount_cents integer, expires_at timestamptz not null, created_at timestamptz default now(), updated_at timestamptz);
    CREATE TABLE abandoned_carts (id uuid primary key, recovery_status text);
    CREATE TABLE email_events (type text, to_email text, order_id uuid, status text, provider_msg_id text, error_message text, created_at timestamptz);
  `);
  await ensureReviewRequestSchema(sql);
  data = createDataAccess(sql);
});
test.after(async () => { await db.close(); });
test.beforeEach(async () => {
  await db.exec('TRUNCATE review_request_history, review_coupon_rewards, discount_codes, orders, email_events CASCADE');
  await sql`INSERT INTO orders (id, email, customer_name, status, payment_method) VALUES (${orderId}, 'buyer@example.com', 'Jamie Customer', 'shipped', 'stripe')`;
});
const send = async (overrides = {}) => processReviewRequest({
  orderId, data, emailConfig, adminIdentifier: 'admin@example.com',
  sendEmail: async () => ({ data: { id: 'email-accepted' } }), ...overrides,
});
async function legacyRequest() {
  // An old row intentionally has no new fields; default migration must infer 25%.
  await sql`INSERT INTO review_request_history (order_id, customer_email, status, sent_at) VALUES (${orderId}, 'buyer@example.com', 'sent', '2026-09-01T12:00:00Z')`;
  return (await data.loadLatestSent(orderId)).sent_at;
}

test('old 25% requests receive a real email-bound single-use coupon; repeated clicks send nothing extra', async () => {
  const sentAt = await legacyRequest();
  let payload, calls = 0;
  const first = await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: sentAt,
    sendEmail: async (value) => { payload = value; calls++; return { data: { id: 'coupon-25' } }; } });
  assert.equal(first.offerPercentage, 25);
  assert.match(first.couponCode, /^THANKS25-[A-F0-9]{12}$/);
  assert.match(payload.text, /25% off/);
  assert.ok(payload.text.includes(first.couponCode));
  assert.ok(first.couponSentAt);
  const rows = await sql`SELECT * FROM discount_codes`;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].single_use, true);
  assert.equal(rows[0].email, 'buyer@example.com');
  assert.equal(rows[0].max_total_uses, 1);
  assert.equal(rows[0].order_id, null);
  const second = await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: sentAt,
    sendEmail: async () => { calls++; throw new Error('must not send'); } });
  assert.equal(calls, 1);
  assert.equal(second.alreadySent, true);
  assert.equal(second.couponCode, first.couponCode);
});

test('30% follow-up upgrades the saved offer; repeat follow-up and later 25% requests cannot downgrade it', async () => {
  const initialAt = await legacyRequest();
  let payload;
  const followup = await send({ action: 'followup', confirmedPreviousSentAt: initialAt,
    sendEmail: async (value) => { payload = value; return { data: { id: 'followup-30' } }; } });
  assert.equal(followup.offerPercentage, 30);
  assert.match(payload.text, /25% to 30%/);
  assert.match(payload.text, /gentle follow-up/);
  assert.match(payload.html, /honest experience/);
  assert.equal((await data.loadLatestSent(orderId)).offer_percentage, 30);
  const duplicate = await send({ action: 'followup', confirmedPreviousSentAt: followup.sentAt, sendEmail: async () => assert.fail('duplicate') });
  assert.equal(duplicate.alreadySent, true);
  await assert.rejects(send({ confirmedPreviousSentAt: followup.sentAt }), { code: 'REVIEW_FOLLOWUP_ALREADY_SENT' });
  await assert.rejects(send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt }), { code: 'REVIEW_REQUEST_ALREADY_SENT' });
  const coupon = await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: followup.sentAt });
  assert.equal(coupon.offerPercentage, 30);
  assert.match(coupon.couponCode, /^THANKS30-/);
});

test('failed follow-up leaves 25% eligibility intact', async () => {
  const initialAt = await legacyRequest();
  await assert.rejects(send({ action: 'followup', confirmedPreviousSentAt: initialAt,
    sendEmail: async () => { throw Object.assign(new Error('rejected'), { statusCode: 422 }); } }), { code: 'REVIEW_REQUEST_SEND_FAILED' });
  assert.equal((await data.loadLatestSent(orderId)).offer_percentage, 25);
  const coupon = await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt });
  assert.equal(coupon.offerPercentage, 25);
});

test('definitive coupon delivery failure retries the same code, never a second coupon', async () => {
  const initialAt = await legacyRequest();
  await assert.rejects(send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt,
    sendEmail: async () => { throw Object.assign(new Error('rejected'), { statusCode: 422 }); } }));
  const before = await data.loadCoupon(orderId);
  assert.equal(before.sent_at, null);
  await assert.rejects(send({ action: 'followup', confirmedPreviousSentAt: initialAt }), { code: 'REVIEW_COUPON_ALREADY_CREATED' });
  const retry = await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt });
  assert.equal(retry.couponCode, before.code);
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
});

test('unknown provider result safely resumes identical payload and idempotency key', async () => {
  const initialAt = await legacyRequest();
  let firstPayload, firstOptions;
  await assert.rejects(send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt,
    sendEmail: async (payload, options) => { firstPayload = payload; firstOptions = options; throw new Error('network timeout'); } }));
  await assert.rejects(send({ action: 'followup', confirmedPreviousSentAt: initialAt }));
  await sql`UPDATE review_request_history SET requested_at = NOW() - INTERVAL '3 minutes' WHERE status = 'sending'`;
  await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt,
    sendEmail: async (payload, options) => {
      assert.deepEqual(payload, firstPayload); assert.deepEqual(options, firstOptions);
      return { data: { id: 'same-provider-message' } };
    } });
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
});

test('accepted email with audit outage recovers without issuing or sending a new message', async () => {
  const initialAt = await legacyRequest();
  let key;
  const brokenData = { ...data, completeAttempt: async () => { throw new Error('database temporarily unavailable'); } };
  await assert.rejects(send({ data: brokenData, action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt,
    sendEmail: async (_, options) => { key = options.idempotencyKey; return { data: { id: 'accepted-before-outage' } }; } }), { code: 'REVIEW_REQUEST_AUDIT_FAILED' });
  await sql`UPDATE review_request_history SET requested_at = NOW() - INTERVAL '3 minutes' WHERE status = 'sending'`;
  const result = await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt,
    sendEmail: async (_, options) => { assert.equal(options.idempotencyKey, key); return { data: { id: 'accepted-before-outage' } }; } });
  assert.ok(result.couponSentAt);
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
});

test('uncertain delivery older than the provider window fails closed', async () => {
  const initialAt = await legacyRequest();
  await assert.rejects(send({ action: 'followup', confirmedPreviousSentAt: initialAt, sendEmail: async () => { throw new Error('timeout'); } }));
  await sql`UPDATE review_request_history SET requested_at = NOW() - INTERVAL '25 hours', provider_started_at = NOW() - INTERVAL '25 hours' WHERE status = 'sending'`;
  await assert.rejects(send({ action: 'followup', confirmedPreviousSentAt: initialAt, sendEmail: async () => assert.fail('unsafe retry') }), { code: 'REVIEW_REQUEST_IN_PROGRESS' });
});

test('verification, prior request, paid status and test-order guards block inappropriate sends', async () => {
  await assert.rejects(send({ action: 'followup' }), { code: 'INITIAL_REVIEW_REQUIRED' });
  const initialAt = await legacyRequest();
  await assert.rejects(send({ action: 'coupon', confirmedPreviousSentAt: initialAt }), { code: 'REVIEW_VERIFICATION_REQUIRED' });
  await sql`UPDATE orders SET is_test_order = TRUE WHERE id = ${orderId}`;
  await assert.rejects(send({ confirmedPreviousSentAt: initialAt }), { code: 'TEST_ORDER' });
  await sql`UPDATE orders SET is_test_order = FALSE, status = 'refunded' WHERE id = ${orderId}`;
  await assert.rejects(send({ confirmedPreviousSentAt: initialAt }), { code: 'ORDER_NOT_PAID' });
});

test('concurrent coupon clicks have one provider send and one coupon', async () => {
  const initialAt = await legacyRequest();
  let release, entered;
  const enteredPromise = new Promise((r) => { entered = r; });
  const gate = new Promise((r) => { release = r; });
  let sends = 0;
  const args = { action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt,
    sendEmail: async () => { sends++; entered(); await gate; return { data: { id: 'one-email' } }; } };
  const first = send(args);
  await enteredPromise;
  await assert.rejects(send(args), { code: 'REVIEW_REQUEST_IN_PROGRESS' });
  release(); await first;
  assert.equal(sends, 1);
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
});

test('real issued coupon validates, rejects a different email, and cannot pay for two orders', async () => {
  const initialAt = await legacyRequest();
  const reward = await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: initialAt });
  const valid = await validateDiscountForCheckout({ sql, code: reward.couponCode, email: 'buyer@example.com' });
  assert.equal(valid.valid, true); assert.equal(valid.discount.discountPercentage, 25);
  assert.equal(valid.discount.discountScope, 'order', 'Review coupons cover every product, not selected lines');
  assert.equal((await validateDiscountForCheckout({ sql, code: reward.couponCode, email: 'other@example.com' })).valid, false);
  await sql`INSERT INTO orders (id, email, status) VALUES (${checkoutId}, 'buyer@example.com', 'pending')`;
  const purchase = { id: checkoutId, status: 'pending', email: 'buyer@example.com', discount_code: reward.couponCode, applied_discount_type: 'promo', applied_discount_cents: 2500 };
  assert.equal((await claimPaymentDiscount(sql, purchase)).ok, true);
  const secondId = '22222222-2222-4222-8222-222222222222';
  await sql`INSERT INTO orders (id, email, status) VALUES (${secondId}, 'buyer@example.com', 'pending')`;
  assert.equal((await claimPaymentDiscount(sql, { ...purchase, id: secondId })).ok, false);
  await completePaymentDiscount(sql, purchase);
  assert.equal((await validateDiscountForCheckout({ sql, code: reward.couponCode, email: 'buyer@example.com' })).valid, false);
});

test('provider retries pass the same idempotency key', async () => {
  const seen = [];
  await sendReviewEmailWithRetry({ emails: { send: async (_, options) => { seen.push(options); return { data: { id: 'one' } }; } } }, {}, 1, { idempotencyKey: 'review-request-123' });
  assert.deepEqual(seen, [{ idempotencyKey: 'review-request-123' }]);
});

test('both coupon variants are escaped and include matching HTML and text', () => {
  for (const percentage of [25, 30]) {
    const payload = createReviewRequestEmailData({ action: 'coupon', order: { id: orderId, customer_name: '<script>alert(1)</script>' }, customerEmail: 'buyer@example.com', ...emailConfig,
      coupon: { code: `THANKS${percentage}-TEST`, offer_percentage: percentage } });
    assert.ok(payload.html.includes(`${percentage}%`)); assert.ok(payload.text.includes(`${percentage}%`));
    assert.doesNotMatch(payload.html, /<script>/); assert.match(payload.text, /one order/);
  }
});


async function secondRequest(sentAt = '2026-10-20T12:00:00Z') {
  await legacyRequest();
  await sql`INSERT INTO review_request_history (order_id, customer_email, status, sent_at, email_kind, offer_percentage)
    VALUES (${orderId}, 'buyer@example.com', 'sent', ${sentAt}, 'followup', 30)`;
  return (await data.loadLatestSent(orderId)).sent_at;
}

test('final reminder at 72 hours includes one usable 30% code and optional Google review link in a single email', async () => {
  const secondAt = await secondRequest();
  const boundary = new Date(secondAt).getTime() + 72 * 60 * 60 * 1000;
  let calls = 0;
  const args = { action: 'final', confirmedPreviousSentAt: secondAt,
    sendEmail: async (payload) => {
      calls++;
      assert.match(payload.text, /one last time/);
      assert.match(payload.text, /30% off your next order/);
      assert.match(payload.text, /whether or not you leave a review/);
      assert.ok(payload.text.includes(REVIEW_URL));
      assert.ok(payload.html.includes(`href="${REVIEW_URL}"`));
      assert.doesNotMatch(payload.text, /reply|verify/i);
      assert.doesNotMatch(payload.html, /reply|verify/i);
      const saved = await data.loadCoupon(orderId);
      assert.ok(payload.text.includes(saved.code));
      assert.ok(payload.html.includes(saved.code));
      assert.equal(saved.sent_at, null, 'Mark delivered only after provider acceptance');
      assert.match(payload.html, /small business/);
      assert.equal(payload.tags[0].value, 'review_final');
      return { data: { id: 'final-accepted' } };
    } };
  await assert.rejects(send({ ...args, now: () => boundary - 1 }), { code: 'REVIEW_FINAL_TOO_EARLY' });
  assert.equal(calls, 0);
  assert.equal((await sql`SELECT * FROM review_request_history WHERE email_kind = 'final'`).length, 0);
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 0);
  const final = await send({ ...args, now: () => boundary });
  assert.equal(calls, 1);
  assert.equal(final.offerPercentage, 30);
  assert.equal(new Date(final.followupSentAt).getTime(), new Date(secondAt).getTime());
  assert.ok(final.finalSentAt);
  assert.match(final.couponCode, /^THANKS30-[A-F0-9]{12}$/);
  assert.ok(final.couponSentAt);
  const saved = await data.loadCoupon(orderId);
  assert.equal(saved.review_verified_at, null);
  assert.equal(new Date(saved.sent_at).getTime(), new Date(final.sentAt).getTime());
  const valid = await validateDiscountForCheckout({ sql, code: final.couponCode, email: 'buyer@example.com' });
  assert.equal(valid.valid, true);
  assert.equal(valid.discount.discountPercentage, 30);
  assert.equal(valid.discount.discountScope, 'order');
  const repeat = await send({ ...args, confirmedPreviousSentAt: final.sentAt });
  assert.equal(repeat.alreadySent, true); assert.equal(calls, 1);
  for (const action of ['initial', 'followup']) {
    await assert.rejects(send({ action, confirmedPreviousSentAt: final.sentAt }), { code: 'REVIEW_FINAL_ALREADY_SENT' });
  }
  const coupon = await send({ action: 'coupon', confirmedPreviousSentAt: final.sentAt, sendEmail: async () => assert.fail('No separate coupon email needed') });
  assert.equal(coupon.alreadySent, true);
  assert.equal(coupon.couponCode, final.couponCode);
  assert.equal(coupon.offerPercentage, 30);
  assert.equal((await data.loadCoupon(orderId)).review_verified_at, null);
  assert.equal(new Date(coupon.followupSentAt).getTime(), new Date(secondAt).getTime());
  assert.equal(new Date(coupon.finalSentAt).getTime(), new Date(final.sentAt).getTime());
});

test('initial email alone and failed second email cannot unlock a final attempt', async () => {
  const firstAt = await legacyRequest();
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: firstAt }), { code: 'REVIEW_FOLLOWUP_REQUIRED' });
  await assert.rejects(send({ action: 'followup', confirmedPreviousSentAt: firstAt,
    sendEmail: async () => { throw Object.assign(new Error('rejected'), { statusCode: 422 }); } }));
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: firstAt }), { code: 'REVIEW_FOLLOWUP_REQUIRED' });
});

test('a coupon already issued after a review prevents the final reminder', async () => {
  const secondAt = await secondRequest();
  await send({ action: 'coupon', reviewVerified: true, confirmedPreviousSentAt: secondAt });
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: secondAt }), { code: 'REVIEW_COUPON_ALREADY_CREATED' });
});

test('final delivery failure retries safely with the same payload and provider key', async () => {
  const secondAt = await secondRequest();
  let original, key;
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: secondAt,
    sendEmail: async (payload, options) => { original = payload; key = options.idempotencyKey; throw new Error('timeout'); } }), { code: 'REVIEW_REQUEST_SEND_FAILED' });
  await sql`UPDATE review_request_history SET requested_at = NOW() - INTERVAL '3 minutes' WHERE status = 'sending'`;
  const final = await send({ action: 'final', confirmedPreviousSentAt: secondAt,
    sendEmail: async (payload, options) => { assert.deepEqual(payload, original); assert.equal(options.idempotencyKey, key); return { data: { id: 'recovered-final' } }; } });
  assert.ok(final.finalSentAt);
  assert.ok(final.couponSentAt);
  assert.ok(original.text.includes(final.couponCode));
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
  assert.equal((await sql`SELECT * FROM review_request_history WHERE email_kind = 'final'`).length, 1);
});

test('concurrent final attempts send one email', async () => {
  const secondAt = await secondRequest();
  let release, entered, sends = 0;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const args = { action: 'final', confirmedPreviousSentAt: secondAt,
    sendEmail: async () => { sends++; entered(); await gate; return { data: { id: 'single-final' } }; } };
  const first = send(args);
  await ready;
  await assert.rejects(send(args), { code: 'REVIEW_REQUEST_IN_PROGRESS' });
  release(); await first; assert.equal(sends, 1);
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
});

test('rejected final delivery reuses the code and leaves it unsent until successful retry', async () => {
  const secondAt = await secondRequest();
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: secondAt,
    sendEmail: async () => { throw Object.assign(new Error('rejected'), { statusCode: 422 }); } }), { code: 'REVIEW_REQUEST_SEND_FAILED' });
  const before = await data.loadCoupon(orderId);
  assert.equal(before.sent_at, null);
  const retry = await send({ action: 'final', confirmedPreviousSentAt: secondAt });
  assert.equal(retry.couponCode, before.code);
  assert.ok(retry.couponSentAt);
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
});

test('final acceptance with audit failure recovers one coupon using the original payload and key', async () => {
  const secondAt = await secondRequest();
  let original, key;
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: secondAt,
    data: { ...data, completeAttempt: async () => { throw new Error('database unavailable'); } },
    sendEmail: async (payload, options) => { original = payload; key = options.idempotencyKey; return { data: { id: 'accepted' } }; } }), { code: 'REVIEW_REQUEST_AUDIT_FAILED' });
  await sql`UPDATE review_request_history SET requested_at = NOW() - INTERVAL '3 minutes' WHERE status = 'sending'`;
  const recovered = await send({ action: 'final', confirmedPreviousSentAt: secondAt,
    sendEmail: async (payload, options) => { assert.deepEqual(payload, original); assert.equal(options.idempotencyKey, key); return { data: { id: 'accepted' } }; } });
  assert.ok(recovered.couponSentAt);
  assert.equal((await sql`SELECT * FROM discount_codes`).length, 1);
});

test('a legacy final without a code can still deliver its unconditional coupon separately', async () => {
  await secondRequest();
  await sql`INSERT INTO review_request_history (order_id, customer_email, status, sent_at, email_kind, offer_percentage)
    VALUES (${orderId}, 'buyer@example.com', 'sent', '2026-09-06T12:00:00Z', 'final', 30)`;
  const finalAt = (await data.loadLatestSent(orderId)).sent_at;
  const coupon = await send({ action: 'coupon', confirmedPreviousSentAt: finalAt });
  assert.match(coupon.couponCode, /^THANKS30-/);
  assert.ok(coupon.couponSentAt);
  assert.equal((await data.loadCoupon(orderId)).review_verified_at, null);
});

test('redeemed review code suppresses original, redemption, and future guest/account orders across pages', async () => {
  const secondAt = await secondRequest();
  const reward = await send({ action: 'final', confirmedPreviousSentAt: secondAt });
  const future = '22222222-2222-4222-8222-222222222222';
  const signedIn = '33333333-3333-4333-8333-333333333333';
  const unrelated = '44444444-4444-4444-8444-444444444444';
  const userId = '55555555-5555-4555-8555-555555555555';
  await sql`INSERT INTO profiles (id, email) VALUES (${userId}, 'buyer@example.com') ON CONFLICT DO NOTHING`;
  await sql`UPDATE orders SET user_id = ${userId} WHERE id = ${orderId}`;
  await sql`INSERT INTO orders (id, email, status) VALUES (${checkoutId}, 'buyer@example.com', 'pending'),
    (${future}, ' BUYER@EXAMPLE.COM ', 'paid'), (${unrelated}, 'different@example.com', 'paid')`;
  await sql`INSERT INTO orders (id, email, user_id, status) VALUES (${signedIn}, 'new-email@example.com', ${userId}, 'paid')`;
  await sql`UPDATE discount_codes SET used = TRUE, order_id = ${checkoutId} WHERE code = ${reward.couponCode}`;
  assert.equal((await data.loadOrder(future)).review_customer_completed, false, 'reservation is not redemption');
  await sql`UPDATE orders SET status = 'paid' WHERE id = ${checkoutId}`;
  const { loadCustomerReviewState } = require('../_shared/review-customer-state.cjs');
  const page = await loadCustomerReviewState(sql, [future, signedIn, unrelated]);
  assert.deepEqual(page.map(row => [row.order_id, row.review_customer_completed]).sort(), [[future, true], [signedIn, true], [unrelated, false]].sort());
  for (const id of [orderId, checkoutId, future, signedIn]) {
    for (const action of ['initial', 'followup', 'final', 'coupon']) {
      await assert.rejects(send({ orderId: id, action, sendEmail: async () => assert.fail('completed customer') }), { code: 'REVIEW_CUSTOMER_COMPLETED' });
    }
  }
  // Retain suppression after the redeemed purchase itself is refunded.
  await sql`UPDATE orders SET status = 'refunded' WHERE id = ${checkoutId}`;
  assert.equal((await data.loadOrder(future)).review_customer_completed, true);
});

test('full and partial refunds block the final attempt even when the second email is old enough', async () => {
  const secondAt = await secondRequest();
  await sql`UPDATE orders SET partial_refund_cents = 1 WHERE id = ${orderId}`;
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: secondAt }), { code: 'PARTIAL_REFUND_RECORDED' });
  await sql`UPDATE orders SET partial_refund_cents = 0, status = 'refunded' WHERE id = ${orderId}`;
  await assert.rejects(send({ action: 'final', confirmedPreviousSentAt: secondAt }), { code: 'ORDER_NOT_PAID' });
});


test('final reminder and coupon emails highlight new products and link shopping to the homepage', () => {
  for (const action of ['final', 'coupon']) {
    const payload = createReviewRequestEmailData({ action, order: { id: orderId, customer_name: 'Jamie' },
      customerEmail: 'buyer@example.com', ...emailConfig, coupon: { code: 'THANKS30-ABCDEF123456', offer_percentage: 30 } });
    assert.match(payload.html, /new products/);
    assert.match(payload.text, /new products/);
    assert.match(payload.html, /any product on our site/);
    assert.match(payload.text, /any product on our site/);
    assert.match(payload.html, /href="https:\/\/bannersonthefly.com"[^>]*>(Explore|Shop) All Products<\/a>/);
    assert.match(payload.text, /(Explore|Shop) all products: https:\/\/bannersonthefly.com/);
    assert.ok(payload.html.includes('THANKS30-ABCDEF123456'));
    assert.ok(payload.text.includes('THANKS30-ABCDEF123456'));
    if (action === 'final') {
      assert.ok(payload.html.includes(`href="${REVIEW_URL}"`));
      assert.ok(payload.text.includes(REVIEW_URL));
      assert.match(payload.html, /Leave a Google Review/);
      assert.match(payload.text, /completely optional/);
    }
    assert.match(payload.text, /before tax and shipping/);
  }
});

test('final email requires a real 30% code and escapes customer data in HTML', () => {
  const args = { action: 'final', order: { id: orderId, customer_name: '<script>alert(1)</script>' }, customerEmail: 'buyer@example.com', ...emailConfig };
  for (const coupon of [null, { code: 'THANKS25-TEST', offer_percentage: 25 }, { offer_percentage: 30 }]) {
    assert.throws(() => createReviewRequestEmailData({ ...args, coupon }), /Invalid final review coupon/);
  }
  const payload = createReviewRequestEmailData({ ...args, coupon: { code: 'THANKS30-ABCDEF123456', offer_percentage: 30 } });
  assert.doesNotMatch(payload.html, /<script>/);
  assert.match(payload.html, /&lt;script&gt;/);
});
