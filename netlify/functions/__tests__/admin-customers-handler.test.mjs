import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  CUSTOMER_ANALYTICS_CTES,
  CUSTOMER_DETAIL_COUNT_QUERY,
  CUSTOMER_DETAIL_QUERY,
  CUSTOMER_EMAIL_IDENTITY_SQL,
  CUSTOMER_EXPORT_PAGE_QUERY,
  CUSTOMER_PAGE_QUERY,
  CUSTOMER_STATS_QUERY,
  EFFECTIVE_ORDER_STATUS_SQL,
  _test,
  buildCustomerQueries,
  handler,
  loadCustomerExportPage,
  loadCustomerOrderRows,
} from '../admin-customers.mjs';

const require = createRequire(import.meta.url);
const serverAuth = require('../_shared/server-auth.cjs');

const ORIGINAL_ENV = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  VITE_DATABASE_URL: process.env.VITE_DATABASE_URL,
};

let adminToken = '';

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'admin-customer-handler-test-secret';
  process.env.NETLIFY_DATABASE_URL = 'postgres://customer-test.invalid/database';
  delete process.env.DATABASE_URL;
  delete process.env.VITE_DATABASE_URL;
  adminToken = serverAuth.createSessionToken({ id: 'admin-1', email: 'admin@business.test', is_admin: true });
});

afterEach(() => {
  _test.resetDependencies();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const adminEvent = ({ method = 'GET', query = {}, body } = {}) => ({
  httpMethod: method,
  headers: { 'x-banners-admin-session': adminToken },
  queryStringParameters: query,
  body,
});

const statsRow = (overrides = {}) => ({
  all_count: '12',
  first_time_count: '5',
  repeat_count: '7',
  lapsed_count: '3',
  marketing_eligible_count: '9',
  marketing_excluded_count: '3',
  lifetime_revenue_cents: '123400',
  period_revenue_cents: '45000',
  filtered_count: '7',
  filtered_marketing_eligible_count: '5',
  filtered_marketing_excluded_count: '2',
  filtered_lifetime_revenue_cents: '88400',
  filtered_period_revenue_cents: '32000',
  ...overrides,
});

const customerRow = (overrides = {}) => ({
  email: 'ada@analytical-engines.com',
  customer_name: 'Ada Lovelace',
  customer_first_name: 'Ada',
  completed_order_count: '2',
  lifetime_revenue_cents: '15000',
  first_order_at: '2026-01-01T12:00:00.000Z',
  last_order_at: '2026-08-01T12:00:00.000Z',
  period_order_count: '1',
  period_revenue_cents: '5000',
  segment: 'repeat',
  is_lapsed: false,
  marketing_eligible: true,
  sort_at: '2026-08-01T12:00:00.000Z',
  sort_at_micros: '1785585600000000',
  ...overrides,
});

test('customer analytics requires a verified admin session and disables caching', async () => {
  const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {} });

  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.parse(response.body).error, 'UNAUTHORIZED');
});

test('customer analytics preflight never returns cacheable data', async () => {
  const response = await handler({ httpMethod: 'OPTIONS', headers: {} });

  assert.equal(response.statusCode, 204);
  assert.match(response.headers['Cache-Control'], /no-store/);
  assert.equal(response.body, '');
});

test('analytics SQL keeps exact aggregates while bounding list, detail, and export rows', () => {
  assert.match(CUSTOMER_ANALYTICS_CTES, /LEFT JOIN profiles p ON p\.id = o\.user_id/i);
  assert.match(CUSTOMER_ANALYTICS_CTES, /DISTINCT ON \(email\)/i);
  assert.match(CUSTOMER_ANALYTICS_CTES, /'delivered'/i);
  assert.match(CUSTOMER_ANALYTICS_CTES, /'fulfilled'/i);
  assert.match(CUSTOMER_STATS_QUERY, /filtered_marketing_eligible_count/i);
  assert.match(CUSTOMER_STATS_QUERY, /FROM selected_population/i);
  assert.match(CUSTOMER_PAGE_QUERY, /LIMIT \$7 OFFSET \$8/i);
  assert.match(CUSTOMER_PAGE_QUERY, /LEFT\(customer_name, 500\) AS customer_name/i);
  assert.doesNotMatch(CUSTOMER_PAGE_QUERY, /JSON_AGG|ARRAY_AGG/i);
  assert.match(CUSTOMER_EXPORT_PAGE_QUERY, /marketing_eligible = TRUE/i);
  assert.match(CUSTOMER_EXPORT_PAGE_QUERY, /sort_at_micros < \$7::bigint/i);
  assert.match(CUSTOMER_EXPORT_PAGE_QUERY, /sort_at_micros::text AS sort_at_micros/i);
  assert.match(CUSTOMER_EXPORT_PAGE_QUERY, /LIMIT \$9/i);
  assert.match(CUSTOMER_DETAIL_QUERY, /LIMIT \$2 OFFSET \$3/i);
  assert.match(CUSTOMER_DETAIL_QUERY, /LEFT\(COALESCE[\s\S]*, 160\) AS order_number/i);
  assert.match(CUSTOMER_DETAIL_QUERY, /LEFT JOIN profiles p ON p\.id = o\.user_id/i);
  assert.match(CUSTOMER_DETAIL_COUNT_QUERY, /COUNT\(\*\)::bigint AS total/i);
  assert.match(CUSTOMER_ANALYTICS_CTES, /payment_method <> 'admin_deploy_preview_test'/i);
  assert.match(CUSTOMER_DETAIL_QUERY, /payment_method'[\s\S]*<> 'admin_deploy_preview_test'/i);
  assert.match(CUSTOMER_DETAIL_COUNT_QUERY, /payment_method'[\s\S]*<> 'admin_deploy_preview_test'/i);
  assert.match(CUSTOMER_EMAIL_IDENTITY_SQL, /CASE WHEN[\s\S]*to_jsonb\(o\)->>'email'[\s\S]*THEN NULLIF\(LOWER\(TRIM\(to_jsonb\(o\)->>'email'\)\), ''\) END/i);
  assert.match(CUSTOMER_EMAIL_IDENTITY_SQL, /CASE WHEN[\s\S]*to_jsonb\(p\)->>'email'[\s\S]*THEN NULLIF\(LOWER\(TRIM\(to_jsonb\(p\)->>'email'\)\), ''\) END/i);
  assert.ok(CUSTOMER_EMAIL_IDENTITY_SQL.indexOf("to_jsonb(o)->>'email'") < CUSTOMER_EMAIL_IDENTITY_SQL.indexOf("to_jsonb(p)->>'email'"));
  assert.match(CUSTOMER_EMAIL_IDENTITY_SQL, /example\.com/i);
  assert.match(CUSTOMER_EMAIL_IDENTITY_SQL, /guest\|preview\|test/i);
  assert.equal(CUSTOMER_DETAIL_QUERY.includes(CUSTOMER_EMAIL_IDENTITY_SQL), true);
  assert.match(EFFECTIVE_ORDER_STATUS_SQL, /paypal_capture_id/i);
  assert.match(EFFECTIVE_ORDER_STATUS_SQL, /payment_method[\s\S]*paypal/i);
  assert.match(EFFECTIVE_ORDER_STATUS_SQL, /payment_reconciliation_status[\s\S]*complete/i);
  assert.equal(CUSTOMER_ANALYTICS_CTES.includes(EFFECTIVE_ORDER_STATUS_SQL), true);
  assert.equal(CUSTOMER_DETAIL_QUERY.includes(EFFECTIVE_ORDER_STATUS_SQL), true);
  const shippingNameIndex = CUSTOMER_ANALYTICS_CTES.indexOf("to_jsonb(o)->>'shipping_name'");
  const profileNameIndex = CUSTOMER_ANALYTICS_CTES.indexOf("to_jsonb(p)->>'full_name'");
  assert.ok(shippingNameIndex > -1 && profileNameIndex > shippingNameIndex);

  const complete = buildCustomerQueries({ complete: true, includeNewsletter: true });
  assert.equal(complete.stats, CUSTOMER_STATS_QUERY);
  assert.equal(complete.page, CUSTOMER_PAGE_QUERY);
  assert.equal(complete.exportPage, CUSTOMER_EXPORT_PAGE_QUERY);
  assert.match(complete.stats, /EXISTS \([\s\S]*recovery_email_suppressions/i);
  assert.match(complete.stats, /FROM outbound_suppressions outbound/i);
  assert.match(complete.stats, /'wrong_contact'/i);
  assert.match(complete.stats, /'duplicate'/i);
  assert.match(complete.stats, /FROM trade_show_email_unsubscribes/i);
  assert.match(complete.stats, /FROM email_captures capture/i);
  assert.match(complete.stats, /FROM newsletter newsletter_status/i);

  const unavailable = buildCustomerQueries({ complete: false, includeNewsletter: false });
  for (const [query, canonical] of [
    [unavailable.stats, CUSTOMER_STATS_QUERY],
    [unavailable.page, CUSTOMER_PAGE_QUERY],
    [unavailable.exportPage, CUSTOMER_EXPORT_PAGE_QUERY],
  ]) {
    const canonicalSuffix = canonical.slice(CUSTOMER_ANALYTICS_CTES.length);
    assert.equal(query.endsWith(canonicalSuffix), true);
    assert.equal(query.match(/WITH normalized_orders AS/gi)?.length, 1);
    assert.equal(query.includes("\\.(invalid|local|test)$"), true);
  }
  assert.match(unavailable.stats, /AND NOT \(TRUE\)/i);
  assert.doesNotMatch(unavailable.stats, /FROM recovery_email_suppressions/i);
  assert.doesNotMatch(unavailable.stats, /FROM newsletter newsletter_status/i);
});

test('customer order detail loader binds a single email and bounded page', async () => {
  const calls = [];
  const sql = async (query, parameters) => {
    calls.push({ query, parameters });
    if (query === CUSTOMER_DETAIL_COUNT_QUERY) return [{ total: '51' }];
    if (query === CUSTOMER_DETAIL_QUERY) return [{ id: 'order-26' }];
    return [];
  };
  const result = await loadCustomerOrderRows(sql, 'legacy@customer-business.com', {
    page: 2,
    pageSize: 25,
    offset: 25,
  });

  assert.equal(result.total, 51);
  assert.deepEqual(result.rows, [{ id: 'order-26' }]);
  assert.deepEqual(calls.find(({ query }) => query === CUSTOMER_DETAIL_COUNT_QUERY).parameters, ['legacy@customer-business.com']);
  assert.deepEqual(calls.find(({ query }) => query === CUSTOMER_DETAIL_QUERY).parameters, ['legacy@customer-business.com', 25, 25]);
});

test('export cursor preserves Postgres microseconds across a keyset boundary', async () => {
  // These correspond to adjacent database values ending in .123456 and
  // .123400; both collapse to .123Z if routed through Date.toISOString().
  const boundaryMicros = '1788264000123456';
  const olderMicros = '1788264000123400';
  const encoded = _test.encodeExportCursor({
    email: 'boundary@business.com',
    sort_at_micros: boundaryMicros,
  });
  const parsed = _test.parseExportCursor(encoded);

  assert.deepEqual(parsed, {
    sortAtMicros: boundaryMicros,
    email: 'boundary@business.com',
  });
  assert.equal(boundaryMicros.endsWith('123456'), true);
  assert.equal(olderMicros.endsWith('123400'), true);
  assert.equal(BigInt(olderMicros) < BigInt(parsed.sortAtMicros), true);

  let parameters;
  await loadCustomerExportPage(async (_query, values) => {
    parameters = values;
    return [];
  }, [null, null, '', true, '2026-01-01T00:00:00.000Z', 'all'], parsed, 250);
  assert.equal(parameters[6], boundaryMicros);
  assert.equal(parameters[7], 'boundary@business.com');
  assert.equal(parameters[8], 250);
});

test('list response is exactly paged, omits order arrays, and returns all-page filtered summary', async () => {
  const calls = [];
  const sql = async (query, parameters = []) => {
    calls.push({ query, parameters });
    if (/LIMIT 0\s*$/i.test(query)) return [];
    if (query.includes('SELECT population_stats.*')) return [statsRow()];
    if (query.includes('FROM selected_population') && query.includes('LIMIT $7 OFFSET $8')) return [customerRow()];
    throw new Error('unexpected query');
  };
  _test.setNeonFactory(() => sql);

  const response = await handler(adminEvent({ query: {
    segment: 'repeat',
    period: 'all_time',
    q: ' ADA ',
    page: '2',
    page_size: '50',
  } }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.customers.length, 1);
  assert.equal(Object.hasOwn(body.customers[0], 'orders'), false);
  assert.deepEqual(body.stats, {
    all: 12,
    firstTime: 5,
    repeat: 7,
    lapsed: 3,
    marketingEligible: 9,
    marketingExcluded: 3,
    lifetimeRevenueCents: 123400,
    periodRevenueCents: 45000,
  });
  assert.deepEqual(body.filteredSummary, {
    total: 7,
    marketingEligible: 5,
    marketingExcluded: 2,
    lifetimeRevenueCents: 88400,
    periodRevenueCents: 32000,
  });
  assert.deepEqual(body.pagination, {
    page: 1,
    pageSize: 50,
    total: 7,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  });
  const pageCall = calls.find(({ query }) => query.includes('LIMIT $7 OFFSET $8'));
  assert.equal(pageCall.parameters[2], 'ada');
  assert.equal(pageCall.parameters[5], 'repeat');
  assert.deepEqual(pageCall.parameters.slice(-2), [50, 0]);
  assert.equal(body.filters.segment, 'repeat');
  assert.equal(body.filters.search, 'ada');
  assert.equal(calls.filter(({ query }) => /LIMIT 0\s*$/i.test(query)).length, 5);
});

test('detail mode targets one customer and pages history without list payload duplication', async () => {
  const calls = [];
  const sql = async (query, parameters = []) => {
    calls.push({ query, parameters });
    if (query.includes('FROM recovery_email_suppressions')) return [];
    if (query.includes('FROM outbound_suppressions')) {
      return [{ email: 'blocked@business.com', reason: 'complaint', scope: 'email' }];
    }
    if (query.includes('FROM trade_show_email_unsubscribes')) return [];
    if (query.includes('FROM email_captures')) return [];
    if (query.includes('FROM newsletter')) return [];
    if (query === CUSTOMER_DETAIL_COUNT_QUERY) return [{ total: '51' }];
    if (query === CUSTOMER_DETAIL_QUERY) {
      return [{
        id: 'order-26',
        order_number: 'BOTF-1026',
        created_at: '2026-08-01T12:00:00.000Z',
        status: 'delivered',
        total_cents: '2500',
      }];
    }
    throw new Error('unexpected query');
  };
  _test.setNeonFactory(() => sql);

  const response = await handler(adminEvent({ query: {
    mode: 'detail',
    email: ' BLOCKED@BUSINESS.COM ',
    order_page: '2',
    order_page_size: '25',
  } }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.customer.email, 'blocked@business.com');
  assert.equal(body.customer.marketingEligible, false);
  assert.deepEqual(body.customer.suppressionReasons, ['complaint']);
  assert.equal(body.orders.length, 1);
  assert.equal(body.orders[0].status, 'delivered');
  assert.equal(body.orders[0].completed, true);
  assert.deepEqual(body.pagination, { page: 2, pageSize: 25, total: 51, totalPages: 3, hasMore: true });
  const suppressionCalls = calls.filter(({ query }) => /FROM (recovery_email_suppressions|outbound_suppressions|trade_show_email_unsubscribes|email_captures|newsletter)/.test(query));
  assert.equal(suppressionCalls.length, 5);
  assert.equal(suppressionCalls.every(({ query }) => /ANY\(\$\d::text\[\]\)/.test(query)), true);
  assert.deepEqual(calls.find(({ query }) => query === CUSTOMER_DETAIL_QUERY).parameters, ['blocked@business.com', 25, 25]);
});

test('export is keyset-bounded and final verification rechecks only supplied candidates', async () => {
  const exportCalls = [];
  const exportSql = async (query, parameters = []) => {
    exportCalls.push({ query, parameters });
    if (/LIMIT 0\s*$/i.test(query)) return [];
    if (query.includes('WHERE marketing_eligible = TRUE')) return [customerRow()];
    throw new Error('unexpected query');
  };
  _test.setNeonFactory(() => exportSql);
  const exportResponse = await handler(adminEvent({ query: {
    mode: 'export',
    segment: 'repeat',
    q: ' ADA ',
    page_size: '9999',
  } }));
  const exportBody = JSON.parse(exportResponse.body);

  assert.equal(exportResponse.statusCode, 200);
  assert.equal(exportBody.customers.length, 1);
  assert.equal(exportBody.customers[0].marketingEligible, true);
  assert.equal(exportBody.pagination.pageSize, 250);
  assert.equal(exportBody.pagination.nextCursor, null);
  const exportPageCall = exportCalls.find(({ query }) => query.includes('WHERE marketing_eligible = TRUE'));
  assert.equal(exportPageCall.parameters[2], 'ada');
  assert.equal(exportPageCall.parameters[5], 'repeat');
  assert.equal(exportPageCall.parameters.at(-1), 250);

  const verificationCalls = [];
  const verificationSql = async (query, parameters = []) => {
    verificationCalls.push({ query, parameters });
    if (query.includes('FROM outbound_suppressions')) {
      return [
        { email: 'blocked@business.com', reason: 'wrong_contact', scope: 'email' },
        { email: 'duplicate@business.com', reason: 'duplicate', scope: 'email' },
      ];
    }
    return [];
  };
  _test.setNeonFactory(() => verificationSql);
  const verifyResponse = await handler(adminEvent({
    method: 'POST',
    query: { mode: 'verify_export' },
    body: JSON.stringify({
      emails: ['ada@analytical-engines.com', 'blocked@business.com', 'duplicate@business.com'],
    }),
  }));
  const verifyBody = JSON.parse(verifyResponse.body);

  assert.equal(verifyResponse.statusCode, 200);
  assert.deepEqual(verifyBody.eligible, ['ada@analytical-engines.com']);
  assert.equal(verificationCalls.length, 5);
  assert.equal(verificationCalls.every(({ query }) => /ANY\(\$\d::text\[\]\)/.test(query)), true);
});

test('suppression outages block export and internal failures never expose raw errors', async () => {
  const unavailableSql = async (query) => {
    if (query.includes('FROM outbound_suppressions') && /LIMIT 0\s*$/i.test(query)) {
      const error = new Error('database credential leaked here');
      error.code = '42P01';
      throw error;
    }
    return [];
  };
  _test.setNeonFactory(() => unavailableSql);
  const blocked = await handler(adminEvent({ query: { mode: 'export' } }));
  assert.equal(blocked.statusCode, 503);
  assert.equal(blocked.body.includes('credential leaked'), false);

  const failingSql = async (query) => {
    if (/LIMIT 0\s*$/i.test(query)) return [];
    throw new Error('raw database host and secret');
  };
  _test.setNeonFactory(() => failingSql);
  const failed = await handler(adminEvent());
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(JSON.parse(failed.body), { ok: false, error: 'Unable to load customer analytics' });
});
