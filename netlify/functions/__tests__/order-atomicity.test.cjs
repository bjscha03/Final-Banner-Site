'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:password@example.invalid/test';

const { runAtomicBatch, isUniqueViolation } = require('../_shared/atomic-batch.cjs');
const createOrder = require('../_shared/legacy/create-order-core.cjs');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

class AtomicMemorySql {
  constructor() {
    this.orders = new Map();
    this.items = [];
    this.failItemNumber = null;
    this.queue = Promise.resolve();
  }

  transaction(queries) {
    assert.ok(Array.isArray(queries), 'the Neon HTTP driver must receive a fixed query array');
    const execution = this.queue.then(async () => {
      const nextOrders = new Map(this.orders);
      const nextItems = this.items.map((item) => ({ ...item }));
      let itemNumber = 0;
      const results = [];

      for (const query of queries) {
        if (query.kind === 'order') {
          if (nextOrders.has(query.idempotencyKey)) {
            const error = new Error('duplicate key');
            error.code = '23505';
            throw error;
          }
          nextOrders.set(query.idempotencyKey, { id: query.id });
          results.push([{ id: query.id }]);
        } else if (query.kind === 'item') {
          itemNumber += 1;
          if (itemNumber === this.failItemNumber) throw new Error(`item ${itemNumber} failed`);
          nextItems.push({ orderId: query.orderId, sku: query.sku });
          results.push([]);
        }
      }

      this.orders = nextOrders;
      this.items = nextItems;
      return results;
    });

    // Keep the serializer usable after a rejected transaction.
    this.queue = execution.catch(() => undefined);
    return execution;
  }
}

function orderQueries(orderId, idempotencyKey) {
  return [
    { kind: 'order', id: orderId, idempotencyKey },
    { kind: 'item', orderId, sku: 'banner-1' },
    { kind: 'item', orderId, sku: 'banner-2' },
  ];
}

test('item N failure rolls back both the parent order and every prior item', async () => {
  const sql = new AtomicMemorySql();
  sql.failItemNumber = 2;

  await assert.rejects(runAtomicBatch(sql, orderQueries('order-1', 'checkout-1')), /item 2 failed/);
  assert.equal(sql.orders.size, 0);
  assert.equal(sql.items.length, 0);
});

test('a retry after rollback writes the complete order exactly once', async () => {
  const sql = new AtomicMemorySql();
  sql.failItemNumber = 2;
  await assert.rejects(runAtomicBatch(sql, orderQueries('order-1', 'checkout-1')));

  sql.failItemNumber = null;
  await runAtomicBatch(sql, orderQueries('order-2', 'checkout-1'));

  assert.equal(sql.orders.size, 1);
  assert.equal(sql.items.length, 2);
  assert.deepEqual(sql.items.map((item) => item.orderId), ['order-2', 'order-2']);
});

test('concurrent writes leave one complete order and surface a unique conflict for idempotent verification', async () => {
  const sql = new AtomicMemorySql();
  const results = await Promise.allSettled([
    runAtomicBatch(sql, orderQueries('order-a', 'checkout-shared')),
    runAtomicBatch(sql, orderQueries('order-b', 'checkout-shared')),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected && isUniqueViolation(rejected.reason));
  assert.equal(sql.orders.size, 1);
  assert.equal(sql.items.length, 2);
});

test('dedupe accepts a full matching order and rejects a partial child set', async () => {
  const items = createOrder._test.prepareOrderItems([
    { width_in: 48, height_in: 24, quantity: 1, line_total_cents: 4200, product_type: 'banner' },
    { width_in: 24, height_in: 18, quantity: 2, line_total_cents: 3500, product_type: 'banner' },
  ]);
  const signature = createOrder._test.buildItemSignature(items);
  let actualCount = 2;
  const sql = async () => [{ item_count: actualCount }];
  const existing = {
    id: 'existing-1',
    email: 'buyer@example.com',
    total_cents: 7700,
    status: 'pending',
    expected_item_count: 2,
    item_signature: signature,
  };

  await assert.doesNotReject(createOrder._test.verifyExistingOrderMatches(
    sql,
    existing,
    { email: 'buyer@example.com', total_cents: 7700, status: 'pending' },
    2,
    signature,
  ));

  actualCount = 1;
  await assert.rejects(
    createOrder._test.verifyExistingOrderMatches(
      sql,
      existing,
      { email: 'buyer@example.com', total_cents: 7700, status: 'pending' },
      2,
      signature,
    ),
    (error) => error.code === 'ORDER_IDEMPOTENCY_PAYLOAD_CONFLICT' && error.statusCode === 409,
  );
});

test('commerce functions never pass async callbacks to Neon HTTP transactions', () => {
  const createSource = read('netlify/functions/_shared/legacy/create-order-core.cjs');
  const cartSource = read('netlify/functions/_shared/legacy/cart-save.cjs');
  const captureSource = read('netlify/functions/_shared/legacy/paypal-capture-order.cjs');

  for (const source of [createSource, cartSource, captureSource]) {
    assert.doesNotMatch(source, /transaction\s*\(\s*async\s*\(/);
  }
  assert.match(createSource, /runAtomicBatch\(sql, persistenceQueries\)/);
  assert.match(cartSource, /runAtomicBatch\(sql, \[/);
  assert.match(captureSource, /runAtomicBatch\(sql, persistenceQueries\)/);
});

test('schema DDL is coalesced once per cold start', async () => {
  let migrationRuns = 0;
  const migrate = async () => {
    migrationRuns += 1;
    await Promise.resolve();
  };

  await Promise.all([
    createOrder._test.ensureOrderSchemaOnce(migrate),
    createOrder._test.ensureOrderSchemaOnce(migrate),
    createOrder._test.ensureOrderSchemaOnce(migrate),
  ]);

  assert.equal(migrationRuns, 1);
});
