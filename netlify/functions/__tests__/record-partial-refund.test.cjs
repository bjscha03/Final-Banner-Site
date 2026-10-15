'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recordPartialRefund, validateInput } = require('../_shared/record-partial-refund.cjs');
const orderId = '00000000-0000-4000-8000-000000000001';
const input = { orderId, amountCents: 2500, taxCents: 0, previousAmountCents: 0, previousTaxCents: 0, note: 'Delivery issue' };

test('refund amounts require integer cents, bounded tax, a valid order, and a short note', () => {
  for (const body of [null, [], {}, { ...input, amountCents: -1 }, { ...input, amountCents: 25.001 }, { ...input, amountCents: '2500' }, { ...input, taxCents: 2501 }, { ...input, note: 'a'.repeat(501) }]) {
    assert.throws(() => validateInput(body), error => error.status === 400);
  }
  assert.doesNotThrow(() => validateInput(input));
});

test('records cumulative refunds atomically, avoids retry duplication, detects stale edits, and preserves payment totals', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const sql = async (parts, ...values) => (await db.query(parts.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, ''), values)).rows;
  try {
    await db.exec(`CREATE TABLE orders (id uuid PRIMARY KEY, status text, total_cents integer, tax_cents integer, updated_at timestamptz DEFAULT now());
      INSERT INTO orders (id,status,total_cents,tax_cents) VALUES ('${orderId}', 'shipped', 10600, 600);`);
    const migration = fs.readFileSync(path.resolve(__dirname, '../../../migrations/047_order_partial_refunds.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const first = await recordPartialRefund(sql, input, 'admin@business.test');
    assert.equal(first.order.partial_refund_cents, 2500);
    assert.equal(first.order.status, 'shipped');
    assert.equal(first.order.total_cents, 10600);
    assert.equal(first.order.partial_refund_history.length, 1);
    assert.equal(first.order.partial_refund_history[0].note, 'Delivery issue');
    const retry = await recordPartialRefund(sql, input, 'admin@business.test');
    assert.equal(retry.alreadyRecorded, true);
    assert.equal(retry.order.partial_refund_history.length, 1);
    await assert.rejects(() => recordPartialRefund(sql, { ...input, amountCents: 3500 }, 'admin'), error => error.status === 409);
    const edited = await recordPartialRefund(sql, { ...input, amountCents: 3500, taxCents: 200, previousAmountCents: 2500 }, 'admin');
    assert.equal(edited.order.partial_refund_cents, 3500);
    assert.equal(edited.order.partial_refund_tax_cents, 200);
    assert.equal(edited.order.partial_refund_history.length, 2);
    assert.equal(edited.order.partial_refund_history[1].previous_amount_cents, 2500);
    for (const patch of [{ amountCents: 10600 }, { amountCents: 10601 }, { taxCents: 601 }]) {
      await assert.rejects(() => recordPartialRefund(sql, { ...input, ...patch }, 'admin'), error => error.status === 400);
    }
    await assert.rejects(() => recordPartialRefund(sql, { ...input, orderId: '00000000-0000-4000-8000-000000000002' }, 'admin'), error => error.status === 404);
    const corrected = await recordPartialRefund(sql, { ...input, amountCents: 0, previousAmountCents: 3500, previousTaxCents: 200, note: 'Corrected accidental entry' }, 'admin');
    assert.equal(corrected.order.partial_refund_history.length, 3);
    for (const status of ['pending', 'refunded', 'failed', 'cancelled']) {
      await db.query('UPDATE orders SET status = $1', [status]);
      await assert.rejects(() => recordPartialRefund(sql, input, 'admin'), error => error.status === 409);
    }
  } finally { await db.close(); }
});
