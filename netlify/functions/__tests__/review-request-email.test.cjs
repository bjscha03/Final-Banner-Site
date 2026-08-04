'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const emailModule = require('../_shared/review-request-email.cjs');
const handlerModule = require('../_shared/review-request-handler.cjs');

const {
  REVIEW_URL,
  REVIEW_SUBJECT,
  REVIEW_PREVIEW_TEXT,
  buildReviewRequestHtml,
  buildReviewRequestText,
  createReviewRequestEmailData,
  getReviewRequestEligibility,
} = emailModule;
const {
  isValidOrderId,
  processReviewRequest,
  sendReviewEmailWithRetry,
} = handlerModule._test;

const paidOrder = {
  id: '2ad3018b-680a-463e-b761-9fdcf8a0d993',
  status: 'paid',
  payment_method: 'paypal',
  paypal_capture_id: 'CAPTURE-123',
  payment_reconciliation_status: 'complete',
  email: 'Review-Test@Example.com',
  customer_name: 'Jamie Rivera',
  is_test_order: false,
};

function createFakeData({ order = paidOrder, latestSent = null, sendGate = null } = {}) {
  const state = {
    activeAttempt: false,
    completed: [],
    failed: [],
    events: [],
    beginCalls: 0,
  };

  return {
    state,
    data: {
      async loadOrder() { return order; },
      async loadLatestSent() { return latestSent; },
      async beginAttempt() {
        state.beginCalls += 1;
        if (state.activeAttempt) return null;
        state.activeAttempt = true;
        return { id: 91, requested_at: '2026-08-04T00:00:00.000Z' };
      },
      async completeAttempt(input) {
        if (sendGate) await sendGate;
        state.completed.push(input);
        state.activeAttempt = false;
        return { sent_at: '2026-08-04T00:01:00.000Z' };
      },
      async failAttempt(input) {
        state.failed.push(input);
        state.activeAttempt = false;
      },
      async logEmailEvent(input) { state.events.push(input); },
    },
  };
}

const emailConfig = {
  from: 'Banners on the Fly <orders@bannersonthefly.com>',
  replyTo: 'support@bannersonthefly.com',
};

test('review email is branded, responsive, honest-review focused, and includes HTML and plain-text fallbacks', () => {
  const payload = createReviewRequestEmailData({
    order: paidOrder,
    customerEmail: 'review-test@example.com',
    ...emailConfig,
  });

  assert.equal(payload.subject, REVIEW_SUBJECT);
  assert.equal(payload.to, 'review-test@example.com');
  assert.equal(payload.replyTo, emailConfig.replyTo);
  assert.match(payload.html, /<meta name="viewport"/);
  assert.match(payload.html, new RegExp(REVIEW_PREVIEW_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(payload.html, /Leave a Google Review/);
  assert.equal((payload.html.match(new RegExp(REVIEW_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 2, true);
  assert.match(payload.html, /honest Google review/i);
  assert.match(payload.html, /once we manually see your review/i);
  assert.match(payload.html, /25% off your next order/i);
  assert.match(payload.html, /Banners On The Fly/);
  assert.match(payload.text, new RegExp(REVIEW_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(payload.text, /honest Google review/i);
  assert.match(payload.text, /once we manually see your review/i);
  assert.equal(payload.tags[0].value, 'review_request');
  assert.equal(payload.tags[1].value, paidOrder.id);
});

test('review email uses the first name and falls back to “there”', () => {
  assert.match(buildReviewRequestHtml(paidOrder), /Hi Jamie,/);
  assert.match(buildReviewRequestText({ ...paidOrder, customer_name: '', customer_first_name: '' }), /^Hi there,/);
});

test('eligibility accepts confirmed paid lifecycle orders and rejects invalid email, unpaid, canceled, failed, and test orders', () => {
  assert.equal(getReviewRequestEligibility(paidOrder).eligible, true);
  assert.equal(getReviewRequestEligibility({ ...paidOrder, status: 'in_production' }).eligible, true);
  assert.equal(getReviewRequestEligibility({ ...paidOrder, status: 'shipped' }).eligible, true);
  assert.equal(getReviewRequestEligibility({ ...paidOrder, email: 'not-an-email' }).code, 'INVALID_CUSTOMER_EMAIL');
  assert.equal(getReviewRequestEligibility({ ...paidOrder, status: 'pending', paypal_capture_id: null }).code, 'ORDER_NOT_PAID');
  assert.equal(getReviewRequestEligibility({ ...paidOrder, status: 'failed' }).code, 'ORDER_NOT_PAID');
  assert.equal(getReviewRequestEligibility({ ...paidOrder, status: 'canceled' }).code, 'ORDER_NOT_PAID');
  assert.equal(getReviewRequestEligibility({ ...paidOrder, status: 'refunded' }).code, 'ORDER_NOT_PAID');
  assert.equal(getReviewRequestEligibility({ ...paidOrder, is_test_order: true }).code, 'TEST_ORDER');
});

test('server order IDs are validated before database access', () => {
  assert.equal(isValidOrderId(paidOrder.id), true);
  assert.equal(isValidOrderId('not-a-uuid'), false);
  assert.equal(isValidOrderId(''), false);
});

test('canonical customer lookup falls back to the customer profile when the order email is malformed', () => {
  const eligibility = getReviewRequestEligibility({
    ...paidOrder,
    email: 'bad-address',
    profile_email: 'Profile.Customer@Example.com',
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.customerEmail, 'profile.customer@example.com');
});

test('successful send records provider confirmation before returning success', async () => {
  const { data, state } = createFakeData();
  let sentPayload;
  const result = await processReviewRequest({
    orderId: paidOrder.id,
    confirmedPreviousSentAt: null,
    adminIdentifier: 'server-admin@example.com',
    data,
    emailConfig,
    sendEmail: async (payload) => {
      sentPayload = payload;
      return { data: { id: 're_review_123' } };
    },
  });

  assert.equal(sentPayload.to, 'review-test@example.com');
  assert.equal(result.providerMessageId, 're_review_123');
  assert.equal(result.sentAt, '2026-08-04T00:01:00.000Z');
  assert.deepEqual(state.completed, [{ attemptId: 91, providerMessageId: 're_review_123' }]);
  assert.equal(state.failed.length, 0);
  assert.equal(state.events.at(-1).status, 'sent');
});

test('failed provider response records failure, never completes, and returns a safe retryable admin error', async () => {
  const { data, state } = createFakeData();
  await assert.rejects(
    () => processReviewRequest({
      orderId: paidOrder.id,
      confirmedPreviousSentAt: null,
      adminIdentifier: 'server-admin@example.com',
      data,
      emailConfig,
      sendEmail: async () => { throw new Error('Provider rejected jane@example.com'); },
    }),
    (error) => error.code === 'REVIEW_REQUEST_SEND_FAILED' && error.statusCode === 502,
  );

  assert.equal(state.completed.length, 0);
  assert.equal(state.failed.length, 1);
  assert.doesNotMatch(state.failed[0].failureReason, /jane@example\.com/i);
  assert.equal(state.events.at(-1).status, 'error');
});

test('two concurrent attempts allow only one provider send', async () => {
  let releaseSend;
  const sendBlocked = new Promise((resolve) => { releaseSend = resolve; });
  const { data, state } = createFakeData();
  let providerCalls = 0;
  const args = {
    orderId: paidOrder.id,
    confirmedPreviousSentAt: null,
    adminIdentifier: 'server-admin@example.com',
    data,
    emailConfig,
    sendEmail: async () => {
      providerCalls += 1;
      await sendBlocked;
      return { data: { id: 're_review_concurrent' } };
    },
  };

  const first = processReviewRequest(args);
  await new Promise((resolve) => setImmediate(resolve));
  const second = processReviewRequest(args);
  await assert.rejects(second, (error) => error.code === 'REVIEW_REQUEST_IN_PROGRESS' && error.statusCode === 409);
  releaseSend();
  await first;

  assert.equal(providerCalls, 1);
  assert.equal(state.beginCalls, 2);
  assert.equal(state.completed.length, 1);
});

test('a prior successful request requires explicit duplicate confirmation and can then be resent', async () => {
  const latestSent = {
    sent_at: '2026-08-03T20:42:00.000Z',
    customer_email: 'review-test@example.com',
  };
  const firstData = createFakeData({ latestSent });
  await assert.rejects(
    () => processReviewRequest({
      orderId: paidOrder.id,
      confirmedPreviousSentAt: null,
      adminIdentifier: 'server-admin@example.com',
      data: firstData.data,
      emailConfig,
      sendEmail: async () => ({ data: { id: 'should-not-send' } }),
    }),
    (error) => error.code === 'REVIEW_REQUEST_ALREADY_SENT'
      && error.details.lastSentAt === latestSent.sent_at,
  );
  assert.equal(firstData.state.beginCalls, 0);

  const staleData = createFakeData({ latestSent });
  await assert.rejects(
    () => processReviewRequest({
      orderId: paidOrder.id,
      confirmedPreviousSentAt: '2026-08-01T12:00:00.000Z',
      adminIdentifier: 'server-admin@example.com',
      data: staleData.data,
      emailConfig,
      sendEmail: async () => ({ data: { id: 'should-not-send-stale-confirmation' } }),
    }),
    (error) => error.code === 'REVIEW_REQUEST_ALREADY_SENT',
  );
  assert.equal(staleData.state.beginCalls, 0);

  const confirmedData = createFakeData({ latestSent });
  const result = await processReviewRequest({
    orderId: paidOrder.id,
    confirmedPreviousSentAt: latestSent.sent_at,
    adminIdentifier: 'server-admin@example.com',
    data: confirmedData.data,
    emailConfig,
    sendEmail: async () => ({ data: { id: 're_review_resend' } }),
  });
  assert.equal(result.providerMessageId, 're_review_resend');
  assert.equal(confirmedData.state.completed.length, 1);
});

test('Resend helper only succeeds with a provider message ID and retries transient failures', async () => {
  let calls = 0;
  const resend = {
    emails: {
      send: async () => {
        calls += 1;
        if (calls === 1) return { data: null, error: { statusCode: 429, message: 'Rate limited' } };
        return { data: { id: 're_after_retry' }, error: null };
      },
    },
  };
  const result = await sendReviewEmailWithRetry(resend, { to: 'review-test@example.com' }, 2);
  assert.equal(result.data.id, 're_after_retry');
  assert.equal(calls, 2);

  await assert.rejects(
    () => sendReviewEmailWithRetry({ emails: { send: async () => ({ data: {}, error: null }) } }, {}, 1),
    /message ID/i,
  );
});

test('admin route is signed-session protected and review send is not wired into checkout or payment flows', async () => {
  const preflight = await handlerModule.handler({ httpMethod: 'OPTIONS', headers: {} });
  assert.equal(preflight.statusCode, 200);
  assert.equal(preflight.body, '');

  const response = await handlerModule.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ orderId: paidOrder.id }) });
  assert.equal(response.statusCode, 401);

  const priorSecret = process.env.AUTH_SESSION_SECRET;
  process.env.AUTH_SESSION_SECRET = 'review-request-test-session-secret';
  const serverAuth = require('../_shared/server-auth.cjs');
  const nonAdminToken = serverAuth.createSessionToken({ id: 'customer', email: 'customer@example.com', is_admin: false });
  const denied = await handlerModule.handler({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${nonAdminToken}` },
    body: JSON.stringify({ orderId: paidOrder.id }),
  });
  assert.equal(denied.statusCode, 401);

  const adminToken = serverAuth.createSessionToken({ id: 'admin', email: 'admin@example.com', is_admin: true });
  const invalidOrder = await handlerModule.handler({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ orderId: 'not-a-uuid', email: 'attacker-supplied@example.com' }),
  });
  assert.equal(invalidOrder.statusCode, 400);
  assert.equal(JSON.parse(invalidOrder.body).code, 'INVALID_ORDER_ID');
  if (priorSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
  else process.env.AUTH_SESSION_SECRET = priorSecret;

  const ordersSource = fs.readFileSync(path.resolve(__dirname, '../../../src/pages/admin/Orders.tsx'), 'utf8');
  const componentSource = fs.readFileSync(path.resolve(__dirname, '../../../src/components/orders/ReviewRequestAction.tsx'), 'utf8');
  const getOrdersSource = fs.readFileSync(path.resolve(__dirname, '../get-orders.mjs'), 'utf8');
  assert.equal((ordersSource.match(/<ReviewRequestAction/g) || []).length, 2);
  assert.match(componentSource, /send-review-request/);
  assert.match(componentSource, /confirmedPreviousSentAt/);
  assert.match(getOrdersSource, /review_request_last_sent_at/);

  const paymentFiles = [
    '../paypal-capture-forward.mjs',
    '../paypal-webhook.mjs',
    '../stripe-finalize-order.mjs',
    '../notify-order.mjs',
  ];
  for (const relativeFile of paymentFiles) {
    const absoluteFile = path.resolve(__dirname, relativeFile);
    if (!fs.existsSync(absoluteFile)) continue;
    assert.doesNotMatch(fs.readFileSync(absoluteFile, 'utf8'), /send-review-request|review\.request/);
  }
});
