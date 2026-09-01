'use strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const {
  revalidateRecoveryDiscountForCanonicalIdentity,
} = require('../_shared/legacy/create-order-core.cjs')._test;

function recoveryDiscountSql(overrides = {}) {
  const row = {
    id: 'discount-recovery-1',
    code: 'CART10-SECURE',
    discount_percentage: 10,
    discount_amount_cents: null,
    used: true,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_by_user_id: null,
    used_by_email: [],
    max_uses_per_customer: 1,
    max_total_uses: 1,
    email: 'original-recipient@example.com',
    cart_id: 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60',
    recovery_cart_status: 'abandoned',
    owned_by_checkout: true,
    ...overrides,
  };
  return async (strings) => {
    const query = strings.join(' ');
    if (/FROM trade_show_promo_codes/i.test(query)) return [];
    if (/FROM discount_codes/i.test(query)) return [row];
    return [];
  };
}

test('a signed-in account switch cannot keep another recipient recovery discount', async () => {
  const sql = recoveryDiscountSql();
  // The browser can initially echo the recovery recipient. The first pricing
  // pass therefore identifies the code as a recovery offer.
  const initial = await validateDiscountForCheckout({
    sql,
    code: 'CART10-SECURE',
    email: 'original-recipient@example.com',
    checkoutKey: 'checkout_key_recovery_identity_test_12345',
  });
  assert.equal(initial.valid, true);
  assert.equal(initial.discount.recoveryOffer, true);

  // After the signed-in profile is resolved, its canonical email is the only
  // identity accepted—even for the checkout that already owns a reservation.
  const canonical = await revalidateRecoveryDiscountForCanonicalIdentity(sql, {
    discount: initial.discount,
    userEmail: 'signed-in-account@example.com',
    userId: '1f692f32-9f8d-4a26-9a39-31c60f036331',
    checkoutKey: 'checkout_key_recovery_identity_test_12345',
  });
  assert.equal(canonical.valid, false);
  assert.match(canonical.error, /different email address/i);
});

test('the matching canonical recipient keeps its retry-safe recovery offer', async () => {
  const sql = recoveryDiscountSql();
  const result = await validateDiscountForCheckout({
    sql,
    code: 'CART10-SECURE',
    email: ' ORIGINAL-RECIPIENT@example.com ',
    checkoutKey: 'checkout_key_matching_recovery_test_12345',
    requireRecoveryEmailMatch: true,
  });
  assert.equal(result.valid, true);
  assert.equal(result.discount.recoveryOffer, true);
});

test('only the exact owning checkout may retry after its recovery cart transitions', async () => {
  const recoveredRow = { recovery_cart_status: 'recovered', used: true };
  const exactRetry = await validateDiscountForCheckout({
    sql: recoveryDiscountSql({ ...recoveredRow, owned_by_checkout: true }),
    code: 'CART10-SECURE',
    email: 'original-recipient@example.com',
    checkoutKey: 'checkout_key_exact_recovered_retry_12345',
    requireRecoveryEmailMatch: true,
  });
  assert.equal(exactRetry.valid, true);

  const wrongCheckout = await validateDiscountForCheckout({
    sql: recoveryDiscountSql({ ...recoveredRow, owned_by_checkout: false }),
    code: 'CART10-SECURE',
    email: 'original-recipient@example.com',
    checkoutKey: 'checkout_key_wrong_recovered_retry_12345',
    requireRecoveryEmailMatch: true,
  });
  assert.equal(wrongCheckout.valid, false);
  assert.match(wrongCheckout.error, /no longer active/i);

  const wrongEmail = await validateDiscountForCheckout({
    sql: recoveryDiscountSql({ ...recoveredRow, owned_by_checkout: true }),
    code: 'CART10-SECURE',
    email: 'other-account@example.com',
    checkoutKey: 'checkout_key_exact_recovered_retry_12345',
    requireRecoveryEmailMatch: true,
  });
  assert.equal(wrongEmail.valid, false);
  assert.match(wrongEmail.error, /different email address/i);
});

test('legacy recovery rows without a bound recipient fail closed', async () => {
  const result = await validateDiscountForCheckout({
    sql: recoveryDiscountSql({ email: null, used: false, owned_by_checkout: false }),
    code: 'CART10-SECURE',
    email: 'buyer@example.com',
    requireRecoveryEmailMatch: true,
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /different email address/i);
});
