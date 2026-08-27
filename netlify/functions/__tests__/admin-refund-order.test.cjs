const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const refundOrder = require('../_shared/admin-refund-order.cjs');

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
