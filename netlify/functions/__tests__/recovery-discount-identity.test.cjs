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

test('canonical recovery validation requires the exact proven cart as well as email', async () => {
  const initial = await validateDiscountForCheckout({
    sql: recoveryDiscountSql({ used: false, owned_by_checkout: false }),
    code: 'CART10-SECURE',
  });
  assert.equal(initial.valid, true);

  const matching = await revalidateRecoveryDiscountForCanonicalIdentity(
    recoveryDiscountSql({ used: false, owned_by_checkout: false }),
    {
      discount: initial.discount,
      userEmail: 'original-recipient@example.com',
      userId: null,
      checkoutKey: 'checkout_key_exact_cart_identity_test_12345',
      recoveryCartId: 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60',
    },
  );
  assert.equal(matching.valid, true);

  const wrongCart = await revalidateRecoveryDiscountForCanonicalIdentity(
    recoveryDiscountSql({ used: false, owned_by_checkout: false }),
    {
      discount: initial.discount,
      userEmail: 'original-recipient@example.com',
      userId: null,
      checkoutKey: 'checkout_key_wrong_cart_identity_test_12345',
      recoveryCartId: 'b72c61fa-8ee5-4baa-9cc7-21d5be2b4d60',
    },
  );
  assert.equal(wrongCart.valid, false);
  assert.match(wrongCart.error, /different cart/i);
});

test('the large-banner campaign exposes only complete activated trusted scope metadata', async () => {
  const scopedRow = {
    code: 'CART25-SECURE',
    campaign: 'abandoned_cart_large_banner_25',
    discount_percentage: 25,
    discount_scope: 'recovery_qualifying_banner_lines',
    eligible_cart_item_ids: ['large-line'],
    max_discount_amount_cents: 2500,
    activated_at: new Date(Date.now() - 60_000).toISOString(),
    used: false,
    owned_by_checkout: false,
  };
  const valid = await validateDiscountForCheckout({
    sql: recoveryDiscountSql(scopedRow),
    code: 'CART25-SECURE',
    email: 'original-recipient@example.com',
    recoveryCartId: 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60',
    requireRecoveryEmailMatch: true,
    requireRecoveryCartMatch: true,
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.discount.eligibleCartItemIds, ['large-line']);
  assert.equal(valid.discount.maxDiscountAmountCents, 2500);
  assert.equal(valid.discount.discountScope, 'recovery_qualifying_banner_lines');

  const inactive = await validateDiscountForCheckout({
    sql: recoveryDiscountSql({ ...scopedRow, activated_at: null }),
    code: 'CART25-SECURE',
    email: 'original-recipient@example.com',
    recoveryCartId: 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60',
    requireRecoveryEmailMatch: true,
    requireRecoveryCartMatch: true,
  });
  assert.equal(inactive.valid, false);
  assert.match(inactive.error, /not available/i);

  const expiredOwnedCheckout = await validateDiscountForCheckout({
    sql: recoveryDiscountSql({
      ...scopedRow,
      activated_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      expires_at: new Date(Date.now() - 1).toISOString(),
      used: true,
      owned_by_checkout: true,
    }),
    code: 'CART25-SECURE',
    email: 'original-recipient@example.com',
    recoveryCartId: 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60',
    requireRecoveryEmailMatch: true,
    requireRecoveryCartMatch: true,
  });
  assert.equal(expiredOwnedCheckout.valid, false);
  assert.match(expiredOwnedCheckout.error, /expired/i);
});
