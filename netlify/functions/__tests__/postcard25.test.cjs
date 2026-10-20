'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const { claimPaymentDiscount, completePaymentDiscount } = require('../_shared/payment-discount-reservation.cjs');

test('POSTCARD25 gives different new customers 25 percent using the same code', async () => {
  for (const email of ['one@example.com', 'two@example.com']) {
    const result = await validateDiscountForCheckout({ sql: async () => [], code: ' postcard25 ', email });
    assert.equal(result.valid, true);
    assert.equal(result.discount.code, 'POSTCARD25');
    assert.equal(result.discount.discountPercentage, 25);
  }
});
test('POSTCARD25 rejects a customer with a prior paid order', async () => {
  const result = await validateDiscountForCheckout({sql: async () => [{id:'prior'}], code:'POSTCARD25', email:'returning@example.com'});
  assert.equal(result.valid, false);
});
test('NEW20 retains its original 20 percent offer', async () => {
  const result = await validateDiscountForCheckout({sql: async () => [], code:'NEW20', email:'new@example.com'});
  assert.equal(result.discount.discountPercentage,20);
});
test('POSTCARD25 uses the first-order reservation and does not consume a global coupon', async () => {
  const queries=[];
  const sql=async () => { throw new Error('Unexpected standalone coupon mutation'); };
  sql.transaction=async build => {
    build((strings,...values) => {queries.push(strings.join('?')); return Promise.resolve([]);});
    return [[{acquired:1}],[{id:'postcard-order'}]];
  };
  const order={id:'postcard-order',email:'new@example.com',status:'pending',discount_code:'POSTCARD25',applied_discount_type:'promo',applied_discount_cents:2500};
  const claimed=await claimPaymentDiscount(sql,order);
  assert.equal(claimed.ok,true);
  assert.match(queries.join(' '), /IN \('NEW20', 'POSTCARD25'\)/);
  assert.equal((await completePaymentDiscount(sql,order)).kind,'not_stored');
});
