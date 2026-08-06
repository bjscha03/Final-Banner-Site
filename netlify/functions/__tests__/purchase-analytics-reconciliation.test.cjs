'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getCanonicalTransactionId } = require('../_shared/purchase-analytics-reconciliation.cjs');

test('uses the business order number when one exists', () => {
  assert.equal(getCanonicalTransactionId({ id: 'uuid-1', order_number: 'BOTF-1001' }), 'BOTF-1001');
});

test('falls back to the canonical order UUID for legacy orders without an order number', () => {
  assert.equal(getCanonicalTransactionId({ id: 'uuid-1', order_number: null }), 'uuid-1');
});
