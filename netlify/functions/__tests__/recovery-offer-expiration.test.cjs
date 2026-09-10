'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const detector = require('../_shared/legacy/detect-abandoned-carts.cjs');

test('expires activated recovery offers and records a single coupon_expired event', async () => {
  let queryText = '';
  const rows = [{
    cart_id: '11111111-1111-4111-8111-111111111111',
    code: 'RECOVER25-TEST',
    expires_at: '2026-09-01T13:00:00.000Z',
  }];
  const sql = async (strings) => {
    queryText = strings.join(' ');
    return rows;
  };

  const result = await detector._test.expireRecoveryOffers(sql);

  assert.equal(result, rows);
  assert.match(queryText, /campaign = 'abandoned_cart_large_banner_25'/);
  assert.match(queryText, /activated_at IS NOT NULL/);
  assert.match(queryText, /expires_at <= NOW\(\)/);
  assert.match(queryText, /SET status = 'expired'/);
  assert.match(queryText, /'coupon_expired'/);
  assert.match(queryText, /recovery-coupon-expired:/);
});

test('offer expiration remains safe during a rolling schema deployment', async () => {
  const sql = async () => {
    const error = new Error('column not available yet');
    error.code = '42703';
    throw error;
  };

  assert.deepEqual(await detector._test.expireRecoveryOffers(sql), []);
});
