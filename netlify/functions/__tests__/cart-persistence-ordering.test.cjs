'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('cart replacement is serialized inside one owner-scoped transaction', () => {
  const source = read('netlify/functions/_shared/legacy/cart-save.cjs');
  assert.match(source, /sql\.transaction\(async \(tx\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /cart-user:/);
  assert.match(source, /cart-session:/);

  const userTransaction = source.indexOf("'cart-user:' + userId");
  const userDelete = source.indexOf('DELETE FROM user_carts', userTransaction);
  const userInsert = source.indexOf('INSERT INTO user_carts', userDelete);
  assert.ok(userTransaction >= 0 && userDelete > userTransaction && userInsert > userDelete);
});

test('cart load selects the newest active row deterministically', () => {
  const source = read('netlify/functions/_shared/legacy/cart-load.cjs');
  assert.equal(
    (source.match(/ORDER BY updated_at DESC, last_accessed_at DESC/g) || []).length,
    2,
  );
});

test('browser cart saves are queued and coalesced per owner', () => {
  const source = read('src/lib/cartSync.ts');
  assert.match(source, /saveQueues = new Map/);
  assert.match(source, /drainSaveQueue/);
  assert.match(source, /queue\.pending\.items = items/);
});
