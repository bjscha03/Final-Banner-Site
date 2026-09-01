const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COMPLETED_STATUSES,
  OUTBOUND_SUPPRESSION_REASONS,
  addSuppression,
  aggregateCustomers,
  customerFromSummaryRow,
  createSuppressionIndex,
  isValidCustomerEmail,
  loadSuppressionIndex,
  normalizeSuppressionCandidates,
  probeSuppressionSources,
  resolveDetailPagination,
  resolveEffectiveOrderStatus,
  resolveExportPageSize,
  resolveListPagination,
  resolveCustomerEmail,
  resolvePeriodRange,
} = require('../_shared/admin-customers.cjs');

const row = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  order_number: 'BOTF-1001',
  email: 'ada@analytical-engines.com',
  customer_name: 'Ada Lovelace',
  customer_first_name: 'Ada',
  total_cents: 10_000,
  status: 'paid',
  created_at: '2026-07-01T12:00:00.000Z',
  is_test_order: false,
  ...overrides,
});

test('customer identity is normalized email, never customer name', () => {
  const result = aggregateCustomers([
    row(),
    row({
      id: '22222222-2222-4222-8222-222222222222',
      order_number: 'BOTF-1002',
      email: ' ADA@ANALYTICAL-ENGINES.COM ',
      customer_name: 'Countess Lovelace',
      total_cents: 5_000,
      created_at: '2026-08-01T12:00:00.000Z',
    }),
    row({
      id: '33333333-3333-4333-8333-333333333333',
      email: 'other@analytical-engines.com',
      customer_name: 'Countess Lovelace',
    }),
  ], { index: new Map(), complete: true }, { period: 'all_time' }, new Date('2026-09-01T00:00:00Z'));

  assert.equal(result.customers.length, 2);
  const ada = result.customers.find((customer) => customer.email === 'ada@analytical-engines.com');
  assert.equal(ada.completedOrderCount, 2);
  assert.equal(ada.lifetimeRevenueCents, 15_000);
  assert.equal(ada.fullName, 'Countess Lovelace');
  assert.equal(ada.segment, 'repeat');
});

test('profile email restores complete history for signed-in legacy orders without merging by name', () => {
  const legacyEmail = 'legacy@customer-business.com';
  const result = aggregateCustomers([
    row({
      id: 'legacy-1',
      order_number: 'BOTF-0901',
      email: null,
      order_email: null,
      profile_email: ` ${legacyEmail.toUpperCase()} `,
      customer_name: 'Shared Customer Name',
      total_cents: 12_345,
      status: 'paid',
      created_at: '2025-01-01T12:00:00.000Z',
    }),
    row({
      id: 'legacy-2',
      order_number: 'BOTF-0902',
      email: null,
      order_email: null,
      profile_email: legacyEmail,
      customer_name: 'Updated Settled Name',
      total_cents: 5_432,
      status: 'shipped',
      created_at: '2025-02-01T12:00:00.000Z',
    }),
    row({
      id: 'legacy-other-profile',
      order_number: 'BOTF-0903',
      email: null,
      order_email: null,
      profile_email: 'other-profile@customer-business.com',
      customer_name: 'Shared Customer Name',
      total_cents: 1_000,
      status: 'paid',
      created_at: '2025-03-01T12:00:00.000Z',
    }),
  ], { index: new Map(), complete: true }, {
    period: 'all_time',
    lapsedDays: 180,
  }, new Date('2026-09-01T00:00:00.000Z'));

  assert.equal(resolveCustomerEmail({ order_email: null, profile_email: ` ${legacyEmail.toUpperCase()} ` }), legacyEmail);
  assert.equal(result.customers.length, 2);

  const legacy = result.customers.find((customer) => customer.email === legacyEmail);
  assert.ok(legacy);
  assert.equal(legacy.completedOrderCount, 2);
  assert.equal(legacy.lifetimeRevenueCents, 17_777);
  assert.equal(legacy.segment, 'repeat');
  assert.equal(legacy.isLapsed, true);
  assert.equal(legacy.fullName, 'Updated Settled Name');
  assert.equal(legacy.marketingEligible, true);
  assert.equal(result.stats.repeat, 1);
  assert.equal(result.stats.lapsed, 2);
  assert.equal(result.stats.lifetimeRevenueCents, 18_777);
  assert.equal(result.exportSummary.eligible, 2);
});

test('email identity validates each candidate before preserving valid-order precedence', () => {
  assert.equal(resolveCustomerEmail({
    order_email: null,
    profile_email: 'profile@business.com',
  }), 'profile@business.com');
  assert.equal(resolveCustomerEmail({
    order_email: 'guest@example.com',
    profile_email: 'profile@business.com',
  }), 'profile@business.com');
  assert.equal(resolveCustomerEmail({
    order_email: 'not-an-email',
    profile_email: 'profile@business.com',
  }), 'profile@business.com');
  assert.equal(resolveCustomerEmail({
    order_email: ' ORDER@BUSINESS.COM ',
    profile_email: 'profile@business.com',
  }), 'order@business.com');
});

test('captured and reconciled pending PayPal orders use canonical paid status', () => {
  assert.equal(resolveEffectiveOrderStatus({ status: 'pending', paypal_capture_id: 'CAPTURE-1' }), 'paid');
  assert.equal(resolveEffectiveOrderStatus({
    status: 'pending',
    payment_method: 'paypal',
    payment_reconciliation_status: 'complete',
  }), 'paid');
  assert.equal(resolveEffectiveOrderStatus({
    status: 'pending',
    payment_method: 'stripe',
    payment_reconciliation_status: 'complete',
  }), 'pending');

  const result = aggregateCustomers([
    row({
      id: 'captured',
      email: 'captured@business.com',
      status: 'pending',
      paypal_capture_id: 'CAPTURE-1',
      total_cents: 2_500,
    }),
    row({
      id: 'reconciled',
      email: 'reconciled@business.com',
      status: 'pending',
      payment_method: 'paypal',
      payment_reconciliation_status: 'complete',
      total_cents: 3_500,
    }),
    row({ id: 'unpaid', email: 'unpaid@business.com', status: 'pending', total_cents: 99_999 }),
    row({
      id: 'test-captured',
      email: 'test-captured@business.com',
      status: 'pending',
      paypal_capture_id: 'CAPTURE-TEST',
      is_test_order: true,
      total_cents: 99_999,
    }),
  ], { index: new Map(), complete: true }, { period: 'all_time' });

  assert.deepEqual(result.customers.map((customer) => customer.email).sort(), [
    'captured@business.com',
    'reconciled@business.com',
  ]);
  assert.equal(result.stats.all, 2);
  assert.equal(result.stats.lifetimeRevenueCents, 6_000);
});

test('delivered and fulfilled historical orders remain completed customer revenue', () => {
  assert.equal(COMPLETED_STATUSES.has('delivered'), true);
  assert.equal(COMPLETED_STATUSES.has('fulfilled'), true);
  const result = aggregateCustomers([
    row({ id: 'delivered', status: 'delivered', total_cents: 4_000 }),
    row({
      id: 'fulfilled',
      order_number: 'BOTF-1002',
      status: 'fulfilled',
      total_cents: 6_000,
      created_at: '2026-08-01T12:00:00.000Z',
    }),
  ], { index: new Map(), complete: true }, { period: 'all_time' });

  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].completedOrderCount, 2);
  assert.equal(result.customers[0].lifetimeRevenueCents, 10_000);
  assert.equal(result.customers[0].segment, 'repeat');
  assert.equal(result.customers[0].orders.every((order) => order.completed), true);
});

test('settled legacy identity falls back to profile name without overriding an order name', () => {
  const profileOnly = aggregateCustomers([
    row({
      customer_name: null,
      customer_first_name: null,
      shipping_name: null,
      profile_full_name: 'Legacy Profile Name',
    }),
  ], { index: new Map(), complete: true }, { period: 'all_time' });
  assert.equal(profileOnly.customers[0].fullName, 'Legacy Profile Name');
  assert.equal(profileOnly.customers[0].firstName, 'Legacy');

  const orderWins = aggregateCustomers([
    row({
      customer_name: 'Verified Order Name',
      customer_first_name: 'Verified',
      profile_full_name: 'Stale Profile Name',
    }),
  ], { index: new Map(), complete: true }, { period: 'all_time' });
  assert.equal(orderWins.customers[0].fullName, 'Verified Order Name');
});

test('test, placeholder, refunded, and unpaid orders do not inflate completed counts or revenue', () => {
  const result = aggregateCustomers([
    row(),
    row({ id: '2', status: 'refunded', total_cents: 50_000 }),
    row({ id: '3', status: 'pending', total_cents: 40_000 }),
    row({ id: '4', status: 'paid', total_cents: 30_000, is_test_order: true }),
    row({
      id: 'deploy-preview',
      email: 'deploy-preview@business.com',
      status: 'paid',
      total_cents: 70_000,
      payment_method: 'admin_deploy_preview_test',
    }),
    row({ id: '5', email: 'guest@example.com', status: 'paid', total_cents: 90_000 }),
    row({ id: '6', email: 'preview-123@bannersonthefly.com', status: 'paid', total_cents: 90_000 }),
  ], { index: new Map(), complete: true }, { period: 'all_time' }, new Date('2026-09-01T00:00:00Z'));

  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].completedOrderCount, 1);
  assert.equal(result.customers[0].lifetimeRevenueCents, 10_000);
  assert.equal(result.customers[0].orders.length, 3);
  assert.equal(result.customers[0].segment, 'first_time');

  const pendingOnly = aggregateCustomers([
    row({ email: 'pending@business.com', status: 'pending' }),
  ], { index: new Map(), complete: true }, { period: 'all_time' });
  assert.equal(pendingOnly.customers.length, 0);
});

test('a newer unpaid checkout cannot replace the canonical name from settled history', () => {
  const result = aggregateCustomers([
    row({
      customer_name: 'Ada Lovelace',
      customer_first_name: 'Ada',
      status: 'paid',
      created_at: '2026-07-01T12:00:00.000Z',
    }),
    row({
      id: '22222222-2222-4222-8222-222222222222',
      order_number: 'BOTF-1002',
      customer_name: 'Poisoned Export Name',
      customer_first_name: 'Poisoned',
      status: 'pending',
      created_at: '2026-08-01T12:00:00.000Z',
    }),
  ], { index: new Map(), complete: true }, { period: 'all_time' });

  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].fullName, 'Ada Lovelace');
  assert.equal(result.customers[0].firstName, 'Ada');
  assert.equal(result.customers[0].lastName, 'Lovelace');
  assert.equal(result.customers[0].orders.length, 2);
});

test('period, repeat, and configurable lapsed filters use completed orders', () => {
  const result = aggregateCustomers([
    row({ created_at: '2025-12-01T12:00:00.000Z' }),
    row({ id: '2', created_at: '2026-08-15T12:00:00.000Z' }),
    row({ id: '3', email: 'old@business.com', created_at: '2025-01-01T12:00:00.000Z' }),
  ], { index: new Map(), complete: true }, {
    period: 'all_time',
    segment: 'lapsed',
    lapsedDays: 180,
  }, new Date('2026-09-01T00:00:00Z'));

  assert.equal(result.stats.repeat, 1);
  assert.equal(result.stats.lapsed, 1);
  assert.deepEqual(result.customers.map((customer) => customer.email), ['old@business.com']);
  assert.deepEqual(result.filteredSummary, {
    total: 1,
    marketingEligible: 1,
    marketingExcluded: 0,
    lifetimeRevenueCents: 10_000,
    periodRevenueCents: 10_000,
  });

  const august = aggregateCustomers([
    row({ created_at: '2026-08-15T12:00:00.000Z' }),
    row({ email: 'july@business.com', created_at: '2026-07-31T23:59:59.000Z' }),
  ], { index: new Map(), complete: true }, { period: 'last_month' }, new Date('2026-09-01T00:00:00Z'));
  assert.deepEqual(august.customers.map((customer) => customer.email), ['ada@analytical-engines.com']);
});

test('suppression reasons exclude prior_customer and fail closed when sources are unavailable', () => {
  assert.equal(OUTBOUND_SUPPRESSION_REASONS.has('prior_customer'), false);
  assert.deepEqual([...OUTBOUND_SUPPRESSION_REASONS].sort(), [
    'blocklist', 'complaint', 'consent_false', 'consent_withdrawn', 'duplicate', 'hard_bounce',
    'legal', 'manual', 'provider_suppressed', 'spam_complaint', 'unsubscribe',
    'unsubscribed', 'wrong_contact',
  ]);
  const index = createSuppressionIndex();
  addSuppression(index, 'ada@analytical-engines.com', 'complaint');
  const suppressed = aggregateCustomers([row()], { index, complete: true }, { period: 'all_time' });
  assert.equal(suppressed.customers[0].marketingEligible, false);
  assert.deepEqual(suppressed.customers[0].suppressionReasons, ['complaint']);

  const incomplete = aggregateCustomers([row()], {
    index: new Map(),
    complete: false,
    unavailableSources: ['email_captures'],
  }, { period: 'all_time' });
  assert.equal(incomplete.customers[0].marketingEligible, false);
  assert.deepEqual(incomplete.exportSummary.unavailableSources, ['email_captures']);
});

test('bounded marketing eligibility lookup unions recovery, domain, trade-show, consent, and newsletter suppressions', async () => {
  const calls = [];
  const sql = async (query, parameters) => {
    calls.push({ query, parameters });
    if (query.includes('FROM recovery_email_suppressions')) return [{ email: 'recovery@business.com', reason: 'unsubscribed', scope: 'email' }];
    if (query.includes('FROM outbound_suppressions')) return [{ email: 'blocked-domain.com', reason: 'legal', scope: 'company_domain' }];
    if (query.includes('FROM trade_show_email_unsubscribes')) return [{ email: 'trade@business.com', reason: 'hard_bounce' }];
    if (query.includes('FROM email_captures')) return [{ email: 'declined@business.com', reason: 'consent_false', scope: 'email' }];
    if (query.includes('FROM newsletter')) return [{ email: 'newsletter@business.com', reason: 'newsletter_unsubscribed', scope: 'email' }];
    return [];
  };
  const emails = [
    'recovery@business.com',
    'person@blocked-domain.com',
    'trade@business.com',
    'declined@business.com',
    'newsletter@business.com',
  ];
  const suppressionState = await loadSuppressionIndex(sql, emails);
  const result = aggregateCustomers(emails.map((email, index) => row({ id: String(index), email })), suppressionState, { period: 'all_time' });

  assert.equal(suppressionState.complete, true);
  assert.equal(result.customers.every((customer) => customer.marketingEligible === false), true);
  assert.equal(calls.length, 5);
  assert.equal(calls.every(({ query }) => /ANY\(\$\d::text\[\]\)/.test(query)), true);
  assert.equal(calls.every(({ parameters }) => parameters.flat().length <= 261), true);
});

test('pagination and suppression candidate limits are bounded', () => {
  assert.deepEqual(resolveListPagination('2', '100'), { page: 2, pageSize: 100, offset: 100 });
  assert.deepEqual(resolveListPagination('bad', '5000'), { page: 1, pageSize: 50, offset: 0 });
  assert.deepEqual(resolveDetailPagination('3', '9999'), { page: 3, pageSize: 100, offset: 200 });
  assert.equal(resolveExportPageSize('9999'), 250);
  assert.throws(
    () => normalizeSuppressionCandidates(Array.from({ length: 251 }, (_, index) => `buyer${index}@business.com`)),
    (error) => error.code === 'SUPPRESSION_BATCH_TOO_LARGE',
  );
});

test('summary row conversion never embeds repeated order history', () => {
  const customer = customerFromSummaryRow({
    email: 'ada@analytical-engines.com',
    customer_name: 'Ada Lovelace',
    customer_first_name: 'Ada',
    completed_order_count: '2',
    lifetime_revenue_cents: '12345',
    first_order_at: '2026-01-01T00:00:00.000Z',
    last_order_at: '2026-08-01T00:00:00.000Z',
    period_order_count: '1',
    period_revenue_cents: '5000',
    is_lapsed: false,
    marketing_eligible: false,
  }, { complete: true });

  assert.equal(customer.marketingEligible, false);
  assert.deepEqual(customer.suppressionReasons, ['suppressed']);
  assert.equal(Object.hasOwn(customer, 'orders'), false);
});

test('suppression schema probes read no source rows and treat a missing newsletter as optional', async () => {
  const calls = [];
  const state = await probeSuppressionSources(async (query) => {
    calls.push(query);
    if (query.includes('FROM newsletter')) {
      const error = new Error('missing');
      error.code = '42P01';
      throw error;
    }
    return [];
  });

  assert.equal(state.complete, true);
  assert.equal(state.includeNewsletter, false);
  assert.equal(calls.length, 5);
  assert.equal(calls.every((query) => /LIMIT 0\s*$/i.test(query)), true);
});

test('date range parsing validates custom ranges', () => {
  assert.throws(
    () => resolvePeriodRange('custom', '2026-09-02', '2026-09-01'),
    (error) => error.code === 'INVALID_PERIOD',
  );
  assert.equal(isValidCustomerEmail('buyer@real-business.com'), true);
  assert.equal(isValidCustomerEmail('guest@example.com'), false);
});
