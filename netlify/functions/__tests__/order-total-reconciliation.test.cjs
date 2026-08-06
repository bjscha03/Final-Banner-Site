'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addPostTaxServiceFees } = require('../_shared/order-total-reconciliation.cjs');

test('post-tax service fees are included exactly once in the payment total', () => {
  assert.equal(addPostTaxServiceFees({
    baseTotalCents: 6360,
    sameDayFeeCents: 509,
    saturdayFeeCents: 0,
  }), 6869);
});

test('a payment total without optional services remains unchanged', () => {
  assert.equal(addPostTaxServiceFees({ baseTotalCents: 6869 }), 6869);
});

test('invalid cent values fail closed', () => {
  assert.throws(
    () => addPostTaxServiceFees({ baseTotalCents: 6800.5 }),
    /non-negative integer/,
  );
});
