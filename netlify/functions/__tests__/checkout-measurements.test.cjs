'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');

// Run the actual order handler, pricing and atomic INSERTs against PostgreSQL.
// A fake SQL client returning success cannot catch an INTEGER/NUMERIC mismatch.
async function fixture() {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/checkout-measurements-before.sql'), 'utf8'));
  const sql = (parts, ...values) => {
    const text = parts.reduce((q, part, index) => q + (index ? `$${index}` : '') + part, '');
    return { text, values, then(resolve, reject) { return db.query(text, values).then(r => r.rows).then(resolve, reject); } };
  };
  sql.transaction = queries => db.transaction(async tx => {
    const results = [];
    for (const q of queries) results.push((await tx.query(q.text, q.values)).rows);
    return results;
  });
  const filename = require.resolve('../_shared/legacy/create-order-core.cjs');
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  const errors = [];
  vm.runInNewContext(`(function(require,module,exports,process,console){${fs.readFileSync(filename, 'utf8')}\n})`, {
    Buffer, URL, setTimeout, clearTimeout,
    fetch: () => { throw new Error('Pending checkout must not send emails or charge a payment'); },
  }, { filename })(name => {
    if (name === '@neondatabase/serverless') return { neon: () => sql };
    if (name === '../bof-service.cjs') return { ...realRequire(name), attach: async () => {} };
    return realRequire(name);
  }, module, module.exports, { env: { DATABASE_URL: 'postgresql://isolated.invalid/test' } },
  { log() {}, info() {}, warn() {}, error(...args) { errors.push(args); if (process.env.DEBUG_CHECKOUT_TEST) console.error(...args); } });
  return {
    db, errors,
    async migrate() { await db.exec(fs.readFileSync(path.resolve(__dirname, '../../../database-migrations/allow-fractional-order-measurements.sql'), 'utf8')); },
    async request(items, key = 'fractional_measurement_checkout_key_123456') {
      return module.exports.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({
        email: 'checkout-regression@example.com', payment_status: 'pending',
        checkout_idempotency_key: key,
        items: items.map(item => ({ product_type: 'banner', quantity: 1, material: '13oz', file_key: 'isolated-test-artwork', ...item })),
      }) }, module.exports.createTrustedStripeContext('test'));
    },
  };
}

test('30-inch banner with top rope reproduces the live failure, then persists 2.5 feet without rounding or duplicate orders', async () => {
  const f = await fixture();
  try {
    const items = [{ width_in: 30, height_in: 48, rope_feet: 2.5, rope_placement: 'top' }];
    const before = await f.request(items);
    assert.equal(before.statusCode, 500, before.body);
    assert.ok(f.errors.some(args => args.some(e => e?.code === '22P02')), 'must reproduce the real PostgreSQL type error');
    assert.equal((await f.db.query('SELECT count(*)::int AS count FROM orders')).rows[0].count, 0, 'failed child INSERT must roll back the parent');
    await f.migrate();
    const response = await f.request(items);
    assert.equal(response.statusCode, 200, response.body);
    const orderId = JSON.parse(response.body).orderId;
    const row = (await f.db.query('SELECT width_in,height_in,rope_feet,line_total_cents FROM order_items WHERE order_id=$1', [orderId])).rows[0];
    assert.equal(Number(row.width_in), 30);
    assert.equal(Number(row.height_in), 48);
    assert.equal(Number(row.rope_feet), 2.5);
    assert.equal(row.line_total_cents, 5500, '50-dollar banner plus exactly five dollars of rope');
    const retry = await f.request(items);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(JSON.parse(retry.body).orderId, orderId);
    assert.equal((await f.db.query('SELECT count(*)::int AS count FROM orders')).rows[0].count, 1);
    await f.migrate();
    assert.equal(Number((await f.db.query('SELECT rope_feet FROM order_items')).rows[0].rope_feet), 2.5, 'repeat migration must preserve fractional values');
  } finally { await f.db.close(); }
});

test('fractional inches, repeating fractional feet and whole-foot orders persist together with exact sizes', async () => {
  const f = await fixture();
  try {
    await f.migrate();
    const response = await f.request([
      { width_in: 33.5, height_in: 80.25, rope_placement: 'top' },
      { width_in: 25, height_in: 48, rope_placement: 'top-bottom' },
      { width_in: 48, height_in: 24, rope_placement: 'top' },
      { width_in: 30, height_in: 48 },
    ]);
    assert.equal(response.statusCode, 200, response.body);
    const rows = (await f.db.query('SELECT width_in,height_in,rope_feet FROM order_items ORDER BY width_in')).rows;
    assert.equal(rows.length, 4);
    assert.ok(Math.abs(Number(rows[0].rope_feet) - 25 / 6) < 1e-12);
    assert.equal(Number(rows[1].rope_feet), 0);
    assert.equal(Number(rows[2].width_in), 33.5);
    assert.equal(Number(rows[2].height_in), 80.25);
    assert.equal(Number(rows[3].rope_feet), 4);
  } finally { await f.db.close(); }
});
