'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const notifierPath = path.resolve(__dirname, '../_shared/legacy/notify-order.cjs');
const sentEmails = [];
const sentEmailOptions = [];
let databaseConnections = 0;

const order = {
  id: '86cd85b5-8f8e-4a72-8d63-243dadfc9914',
  order_number: 'BOTF-9914',
  email: 'customer@example.com',
  customer_name: 'Customer One',
  shipping_name: 'Customer One',
  shipping_street: '123 Main St',
  shipping_city: 'Columbus',
  shipping_state: 'OH',
  shipping_zip: '43215',
  shipping_country: 'US',
  status: 'paid',
  payment_method: 'paypal',
  paypal_order_id: 'PAYPAL-ORDER-123',
  paypal_capture_id: 'PAYPAL-CAPTURE-456',
  checkout_idempotency_key: 'checkout-key-with-at-least-32-random-characters',
  subtotal_cents: 10000,
  tax_cents: 600,
  total_cents: 10600,
  created_at: '2026-08-06T18:00:00.000Z',
};

const item = {
  id: 'item-1',
  order_id: order.id,
  product_type: 'banner',
  quantity: 1,
  width_in: 48,
  height_in: 24,
  material: '13oz_vinyl',
  line_total_cents: 10000,
  rope_feet: 0,
  pole_pockets: 'none',
  grommets: 'none',
};

const secondItem = {
  ...item,
  id: 'item-2',
  width_in: 72,
  height_in: 36,
  line_total_cents: 20000,
};

let orderItems = [item];
let alternateUnderlyingItemOrder = false;
let itemReadCount = 0;
const observedUnderlyingItemOrders = [];

function queryText(first) {
  return Array.isArray(first) ? first.join('?') : String(first || '');
}

async function sql(first) {
  const query = queryText(first);
  if (/FROM\s+orders/i.test(query)) return [order];
  if (/FROM\s+order_items/i.test(query)) {
    const underlyingRows = alternateUnderlyingItemOrder && itemReadCount % 2 === 1
      ? [...orderItems].reverse()
      : [...orderItems];
    itemReadCount += 1;
    observedUnderlyingItemOrders.push(underlyingRows.map((row) => row.id));
    return /ORDER\s+BY\s+id/i.test(query)
      ? underlyingRows.sort((left, right) => String(left.id).localeCompare(String(right.id)))
      : underlyingRows;
  }
  if (/SET\s+confirmation_email_status\s*=\s*'sent'/i.test(query)) {
    order.confirmation_email_status = 'sent';
    order.confirmation_emailed_at = '2026-08-06T18:01:00.000Z';
  }
  if (/SET\s+admin_notification_status\s*=\s*'sent'/i.test(query)) {
    order.admin_notification_status = 'sent';
    order.admin_notification_sent_at = '2026-08-06T18:01:00.000Z';
  }
  if (/SET\s+confirmation_email_status\s*=\s*'error'/i.test(query)) {
    order.confirmation_email_status = 'error';
  }
  return [];
}

const originalLoad = Module._load;
Module._load = function loadWithNotifierMocks(request, parent, isMain) {
  if (request === '@neondatabase/serverless') {
    return {
      neon() {
        databaseConnections += 1;
        return sql;
      },
    };
  }
  if (request === 'resend') {
    return {
      Resend: class Resend {
        constructor() {
          this.emails = {
            send: async (email, options) => {
              sentEmails.push(email);
              sentEmailOptions.push(options);
              return { data: { id: `email-${sentEmails.length}` } };
            },
          };
        }
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

delete require.cache[notifierPath];
const notifier = require(notifierPath);
const { createSessionToken } = require('../_shared/server-auth.cjs');

const originalEnv = {
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_ORDER_EMAIL_SECRET: process.env.RESEND_ORDER_EMAIL_SECRET,
  INTERNAL_JOB_SECRET: process.env.INTERNAL_JOB_SECRET,
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  ORDER_VIEW_TOKEN_SECRET: process.env.ORDER_VIEW_TOKEN_SECRET,
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  CONTEXT: process.env.CONTEXT,
  DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
};

test.beforeEach(() => {
  databaseConnections = 0;
  sentEmails.length = 0;
  sentEmailOptions.length = 0;
  delete order.confirmation_email_status;
  delete order.confirmation_emailed_at;
  delete order.admin_notification_status;
  delete order.admin_notification_sent_at;
  orderItems = [item];
  alternateUnderlyingItemOrder = false;
  itemReadCount = 0;
  observedUnderlyingItemOrders.length = 0;
  process.env.NETLIFY_DATABASE_URL = 'postgres://notifier-test.invalid/database';
  process.env.RESEND_API_KEY = 're_test_notifier';
  process.env.RESEND_ORDER_EMAIL_SECRET = 'test-resend-secret';
  process.env.ORDER_VIEW_TOKEN_SECRET = 'test-order-view-secret';
  process.env.PUBLIC_SITE_URL = 'https://bannersonthefly.com/storefront';
  process.env.CONTEXT = 'production';
  delete process.env.DEPLOY_PRIME_URL;
  delete process.env.INTERNAL_JOB_SECRET;
  delete process.env.AUTH_SESSION_SECRET;
});

test.after(() => {
  Module._load = originalLoad;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('notify-order rejects unauthenticated force-resend overrides before database access', async () => {
  for (const forceFlag of ['forceResendBoth', 'forceResendCustomer', 'forceResendAdmin']) {
    for (const requestHeaders of [{}, { 'x-admin-secret': 'wrong-secret' }]) {
      const response = await notifier.handler({
        httpMethod: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ orderId: order.id, [forceFlag]: true }),
      });

      assert.equal(response.statusCode, 401);
      assert.equal(JSON.parse(response.body).error, 'UNAUTHORIZED');
    }
  }

  assert.equal(databaseConnections, 0);
  assert.equal(sentEmails.length, 0);
});

test('notify-order rejects non-boolean force flags instead of treating them as an ordinary request', async () => {
  for (const forceFlag of ['forceResendBoth', 'forceResendCustomer', 'forceResendAdmin']) {
    for (const invalidValue of ['true', 1, {}, null]) {
      const response = await notifier.handler({
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ orderId: order.id, [forceFlag]: invalidValue }),
      });

      assert.equal(response.statusCode, 400);
      assert.equal(JSON.parse(response.body).error, 'INVALID_FORCE_RESEND_FLAG');
    }
  }

  assert.equal(databaseConnections, 0);
  assert.equal(sentEmails.length, 0);
});

test('notify-order preserves ordinary unauthenticated idempotent notification calls', async () => {
  order.confirmation_email_status = 'sent';
  try {
    const response = await notifier.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ orderId: order.id }),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).idempotent, true);
    assert.equal(sentEmails.length, 0);
  } finally {
    delete order.confirmation_email_status;
  }
});

test('notify-order accepts force resend from internal jobs and verified administrators', async () => {
  process.env.INTERNAL_JOB_SECRET = 'test-internal-job-secret';
  let response = await notifier.handler({
    httpMethod: 'POST',
    headers: { 'x-internal-job-secret': process.env.INTERNAL_JOB_SECRET },
    body: JSON.stringify({ orderId: order.id, forceResendBoth: true }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(sentEmails.length, 2);
  assert.deepEqual(sentEmailOptions, [
    { idempotencyKey: `bof-order-email/order.confirmation/${order.id}` },
    { idempotencyKey: `bof-order-email/order.admin_notification/${order.id}` },
  ]);

  sentEmails.length = 0;
  sentEmailOptions.length = 0;
  delete process.env.INTERNAL_JOB_SECRET;
  process.env.AUTH_SESSION_SECRET = 'test-admin-session-secret';
  const adminToken = createSessionToken({ id: 'admin-1', email: 'admin@example.com', is_admin: true });
  response = await notifier.handler({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(sentEmails.length, 1);
});

test('internal admin-only recovery persists Admin status without resubmitting the customer email', async () => {
  process.env.INTERNAL_JOB_SECRET = 'test-internal-job-secret';
  order.confirmation_email_status = 'sent';
  order.confirmation_emailed_at = '2026-08-06T18:00:30.000Z';

  const response = await notifier.handler({
    httpMethod: 'POST',
    headers: { 'x-internal-job-secret': process.env.INTERNAL_JOB_SECRET },
    body: JSON.stringify({ orderId: order.id, forceResendAdmin: true }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    orderId: order.id,
    customerEmailSent: true,
    adminEmailSent: true,
    resendMessageIds: { customer: null, admin: 'email-1' },
    errors: [],
  });
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].tags[0].value, 'order_admin_notification');
  assert.deepEqual(sentEmailOptions, [
    { idempotencyKey: `bof-order-email/order.admin_notification/${order.id}` },
  ]);
  assert.equal(order.confirmation_email_status, 'sent');
  assert.equal(order.confirmation_emailed_at, '2026-08-06T18:00:30.000Z');
  assert.equal(order.admin_notification_status, 'sent');
  assert.ok(order.admin_notification_sent_at);
});

test('automatic retries keep the Resend key and signed email payload byte-stable', async () => {
  process.env.INTERNAL_JOB_SECRET = 'test-internal-job-secret';
  orderItems = [item, secondItem];
  alternateUnderlyingItemOrder = true;
  const event = {
    httpMethod: 'POST',
    headers: { 'x-internal-job-secret': process.env.INTERNAL_JOB_SECRET },
    body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
  };

  const first = await notifier.handler(event);
  const second = await notifier.handler(event);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(sentEmails.length, 2);
  assert.deepEqual(observedUnderlyingItemOrders, [
    ['item-1', 'item-2'],
    ['item-2', 'item-1'],
  ]);
  assert.deepEqual(sentEmails[0], sentEmails[1]);
  assert.deepEqual(sentEmailOptions, [
    { idempotencyKey: `bof-order-email/order.confirmation/${order.id}` },
    { idempotencyKey: `bof-order-email/order.confirmation/${order.id}` },
  ]);
});

test('explicit human resends keep fresh signed URLs and distinct provider idempotency attempts', async () => {
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-08-08T18:00:00.000Z');
    const first = await notifier.handler({
      httpMethod: 'POST',
      headers: { 'x-admin-secret': process.env.RESEND_ORDER_EMAIL_SECRET },
      body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
    });

    Date.now = () => Date.parse('2026-08-08T18:00:02.000Z');
    const second = await notifier.handler({
      httpMethod: 'POST',
      headers: { 'x-admin-secret': process.env.RESEND_ORDER_EMAIL_SECRET },
      body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
    });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(sentEmails.length, 2);
    assert.notEqual(sentEmails[0].html, sentEmails[1].html);
    assert.notEqual(
      sentEmailOptions[0].idempotencyKey,
      sentEmailOptions[1].idempotencyKey,
    );
    assert.match(sentEmailOptions[0].idempotencyKey, /\/manual\//);
    assert.match(sentEmailOptions[1].idempotencyKey, /\/manual\//);
  } finally {
    Date.now = originalNow;
  }
});

test('notify-order ignores a hostile forwarded host when generating a signed guest link', async () => {
  const response = await notifier.handler({
    httpMethod: 'POST',
    headers: {
      'x-admin-secret': process.env.RESEND_ORDER_EMAIL_SECRET,
      'x-forwarded-host': 'attacker.example',
    },
    body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].html, /https:\/\/bannersonthefly\.com\/orders\/86cd85b5-8f8e-4a72-8d63-243dadfc9914#orderView=/);
  assert.doesNotMatch(sentEmails[0].html, /attacker\.example/);
});

test('branch emails use only the deployment-controlled Banners On The Fly branch origin', async () => {
  process.env.CONTEXT = 'branch-deploy';
  process.env.DEPLOY_PRIME_URL = 'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app/ignored-path';

  const response = await notifier.handler({
    httpMethod: 'POST',
    headers: {
      'x-admin-secret': process.env.RESEND_ORDER_EMAIL_SECRET,
      host: 'attacker.example',
      'x-forwarded-host': 'attacker.example',
    },
    body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(sentEmails.length, 1);
  assert.match(
    sentEmails[0].html,
    /https:\/\/agent-payment-sandbox-e2e--bannersonthefly\.netlify\.app\/orders\/86cd85b5-8f8e-4a72-8d63-243dadfc9914#orderView=/,
  );
  assert.doesNotMatch(sentEmails[0].html, /attacker\.example|bannersonthefly\.com\/orders/);
});

test('production emails ignore DEPLOY_PRIME_URL and retain the canonical production origin', async () => {
  process.env.CONTEXT = 'production';
  process.env.DEPLOY_PRIME_URL = 'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app';

  const response = await notifier.handler({
    httpMethod: 'POST',
    headers: { 'x-admin-secret': process.env.RESEND_ORDER_EMAIL_SECRET },
    body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].html, /https:\/\/bannersonthefly\.com\/orders\//);
  assert.doesNotMatch(sentEmails[0].html, /netlify\.app\/orders\//);
});

test('preview email links reject malformed, credentialed, insecure, and foreign deployment URLs', async () => {
  process.env.CONTEXT = 'branch-deploy';
  const invalidUrls = [
    'not-a-url',
    'http://agent-payment-sandbox-e2e--bannersonthefly.netlify.app',
    'https://user:pass@agent-payment-sandbox-e2e--bannersonthefly.netlify.app',
    'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app:444',
    'https://agent-payment-sandbox-e2e--attacker.netlify.app',
    'https://bannersonthefly.netlify.app',
  ];

  for (const configuredUrl of invalidUrls) {
    sentEmails.length = 0;
    sentEmailOptions.length = 0;
    process.env.DEPLOY_PRIME_URL = configuredUrl;
    const response = await notifier.handler({
      httpMethod: 'POST',
      headers: { 'x-admin-secret': process.env.RESEND_ORDER_EMAIL_SECRET },
      body: JSON.stringify({ orderId: order.id, forceResendCustomer: true }),
    });

    assert.equal(response.statusCode, 500, configuredUrl);
    assert.match(JSON.parse(response.body).error, /trusted deployment URL/i, configuredUrl);
    assert.equal(sentEmails.length, 0, configuredUrl);
  }
});
