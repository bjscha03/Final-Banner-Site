const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const refundOrder = require('../_shared/admin-refund-order.cjs');
const refundEmail = require('../_shared/refund-order-email.cjs');

test('refund result records the transition and exact order total', () => {
  assert.deepEqual(refundOrder.interpretRefundRow({
    id: '11111111-1111-4111-8111-111111111111',
    previous_status: 'paid',
    updated_status: 'refunded',
    total_cents: '4579',
    updated_at: '2026-08-27T10:00:00.000Z',
  }), {
    outcome: 'refunded',
    previousStatus: 'paid',
    order: {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'refunded',
      total_cents: 4579,
      updated_at: '2026-08-27T10:00:00.000Z',
    },
  });
});

test('repeat requests are idempotent and invalid lifecycle states are rejected', () => {
  assert.equal(refundOrder.interpretRefundRow({
    id: '11111111-1111-4111-8111-111111111111',
    previous_status: 'refunded',
    total_cents: 4579,
  }).outcome, 'already_refunded');
  assert.deepEqual(refundOrder.interpretRefundRow({
    id: '11111111-1111-4111-8111-111111111111',
    previous_status: 'pending',
    updated_status: null,
  }), { outcome: 'invalid_status', previousStatus: 'pending' });
  assert.deepEqual(refundOrder.interpretRefundRow(null), { outcome: 'not_found' });
});

test('endpoint is admin-only and changes the BOF record without calling a payment provider', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'admin-refund-order.mjs'), 'utf8');
  const query = fs.readFileSync(path.join(__dirname, '..', '_shared', 'admin-refund-order.cjs'), 'utf8');

  assert.match(source, /requireAdmin\(event\)/);
  assert.match(source, /recordOnly: true/);
  assert.match(query, /SET status = 'refunded'/);
  assert.match(query, /IN \('paid', 'in_production', 'shipped'\)/);
  assert.doesNotMatch(source, /stripe|paypal/i);
  assert.doesNotMatch(query, /stripe|paypal/i);
});

test('refund email clearly identifies the order, amount, and original payment method timing', () => {
  const email = refundEmail.createRefundEmailData({
    id: '11111111-1111-4111-8111-1111d0197e5c',
    email: 'liyah@example.com',
    customer_name: 'Liyah Williams',
    total_cents: 4579,
  }, {
    EMAIL_FROM: 'orders@bannersonthefly.com',
    EMAIL_REPLY_TO: 'support@bannersonthefly.com',
  });

  assert.equal(email.to, 'liyah@example.com');
  assert.equal(email.subject, 'Your Banners On The Fly order #D0197E5C has been refunded');
  assert.match(email.html, /Hi Liyah,/);
  assert.match(email.html, /\$45\.79/);
  assert.match(email.html, /original payment method/);
  assert.match(email.text, /Order: #D0197E5C/);
  assert.deepEqual(email.tags, [
    { name: 'type', value: 'order_refund' },
    { name: 'order_id', value: '11111111-1111-4111-8111-1111d0197e5c' },
  ]);
});

test('refund email is sent once with a stable provider idempotency key', async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    queries.push(query);
    if (query.includes('INSERT INTO refund_email_history')) return [{ order_id: values[0] }];
    if (query.includes("SET status = 'sent'")) return [{ sent_at: '2026-08-27T12:00:00.000Z' }];
    return [];
  };
  const sends = [];
  const resend = {
    emails: {
      send: async (payload, options) => {
        sends.push({ payload, options });
        return { data: { id: 're_refund_123' }, error: null };
      },
    },
  };
  const order = {
    id: '11111111-1111-4111-8111-1111d0197e5c',
    email: 'liyah@example.com',
    customer_name: 'Liyah Williams',
    total_cents: 4579,
  };

  const result = await refundEmail.sendRefundEmailOnce({
    sql,
    order,
    adminIdentifier: 'admin@example.com',
    env: { RESEND_API_KEY: 'test', EMAIL_FROM: 'orders@bannersonthefly.com' },
    resend,
  });

  assert.equal(result.outcome, 'sent');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].options.idempotencyKey, `bof-order-email/order.refund/${order.id}`);
  assert.ok(queries.some((query) => query.includes('INSERT INTO email_events')));
});

test('an already-sent refund email is not delivered again', async () => {
  const sql = async (strings) => {
    const query = strings.join('?');
    if (query.includes('INSERT INTO refund_email_history')) return [];
    if (query.includes('FROM refund_email_history')) {
      return [{ status: 'sent', sent_at: '2026-08-27T12:00:00.000Z', resend_message_id: 're_existing' }];
    }
    return [];
  };
  let sendCount = 0;
  const result = await refundEmail.sendRefundEmailOnce({
    sql,
    order: {
      id: '11111111-1111-4111-8111-1111d0197e5c',
      email: 'liyah@example.com',
      customer_name: 'Liyah Williams',
      total_cents: 4579,
    },
    adminIdentifier: 'admin@example.com',
    env: { RESEND_API_KEY: 'test' },
    resend: { emails: { send: async () => { sendCount += 1; } } },
  });

  assert.equal(result.outcome, 'already_sent');
  assert.equal(sendCount, 0);
});
