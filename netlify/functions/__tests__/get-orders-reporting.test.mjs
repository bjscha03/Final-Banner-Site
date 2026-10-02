import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import getOrdersHandler, { _test } from '../get-orders.mjs';
import { estimateOrderProfit } from '../../../src/lib/admin-profit-estimate.ts';

const require = createRequire(import.meta.url);
const serverAuth = require('../_shared/server-auth.cjs');

const queryText = (value) => Array.isArray(value) ? value.join('?') : String(value || '');

test('summary and hydrated cards agree on sidedness, stakes, pockets, and fractional rope costs', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
  try {
    await db.exec(`CREATE TABLE profiles (id uuid PRIMARY KEY, email text);
      CREATE TABLE orders (id uuid PRIMARY KEY, user_id uuid, created_at timestamptz, status text,
        total_cents integer, subtotal_cents integer, applied_discount_cents integer DEFAULT 0);
      CREATE TABLE order_items (id uuid, order_id uuid, created_at timestamptz DEFAULT now(),
        product_type text, material text, width_in integer, height_in integer,
        quantity integer, line_total_cents integer, yard_sign_sidedness text,
        yard_sign_step_stakes_enabled boolean DEFAULT false, yard_sign_step_stakes_qty integer DEFAULT 0,
        yard_sign_stakes_subtotal_cents integer DEFAULT 0, pole_pocket_position text,
        rope_feet numeric DEFAULT 0, rope_pricing_mode text);
      INSERT INTO orders (id, created_at, status, total_cents, subtotal_cents, applied_discount_cents) VALUES
        ('${ids[0]}', '2026-09-15', 'paid', 11872, 11200, 2800),
        ('${ids[1]}', '2026-09-15', 'paid', 16430, 15500, 0),
        ('${ids[2]}', '2026-09-15', 'paid', 25440, 24000, 0),
        ('${ids[3]}', '2026-09-15', 'paid', 19080, 18000, 0);
      INSERT INTO order_items (id, order_id, product_type, material, width_in, height_in, quantity,
        line_total_cents, yard_sign_sidedness, yard_sign_step_stakes_enabled, yard_sign_step_stakes_qty) VALUES
        ('${ids[0]}', '${ids[0]}', 'yard_sign', 'corrugated', 24, 18, 10, 14000, 'double', false, 0),
        ('${ids[1]}', '${ids[1]}', 'yard_sign', 'corrugated', 24, 18, 10, 15500, 'double', true, 10);
      INSERT INTO order_items (id, order_id, product_type, material, width_in, height_in, quantity,
        line_total_cents, pole_pocket_position, rope_feet, rope_pricing_mode) VALUES
        ('${ids[2]}', '${ids[2]}', 'banner', '13oz', 72, 24, 3, 24000, 'top-bottom', 6.5, 'per_item'),
        ('${ids[3]}', '${ids[3]}', 'banner', '13oz', 72, 24, 3, 18000, 'none', 6, 'per_order');`);
    const summaryRows = await db.query(_test.buildAdminSummaryQuery(), ['2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z']);
    const summary = _test.normalizeAdminSummary(summaryRows.rows[0]);
    assert.equal(summary.metrics.netProfitCents, 4700 + 11950 + 11900);
    assert.equal(summary.metrics.profitOrdersNeedingReview, 1);
    const hydrated = await db.query(_test.buildAdminHydrationQuery(), [ids, 100]);
    const estimates = hydrated.rows.map(estimateOrderProfit);
    assert.equal(estimates[0].netProfitCents, 4700);
    assert.equal(estimates[1].needsReview, true);
    assert.equal(hydrated.rows[2].items[0].rope_feet, 6.5);
    assert.equal(estimates[2].netProfitCents, 11950);
    assert.equal(estimates[3].netProfitCents, 11900);
    assert.equal(estimates.filter((p) => !p.needsReview).reduce((sum, p) => sum + p.netProfitCents, 0), summary.metrics.netProfitCents);
  } finally { await db.close(); }
});

test('Admin reporting request parsing bounds page, page size, search, and UTC period', () => {
  assert.deepEqual(_test.parseAdminReportRequest({
    page: '-4',
    page_size: '5000',
    search: `  ${'A'.repeat(250)}  `,
    start: '2026-03-08T05:00:00-05:00',
    end: '2026-03-09T05:00:00-04:00',
  }), {
    page: 1,
    pageSize: 20,
    search: 'a'.repeat(200),
    start: '2026-03-08T10:00:00.000Z',
    end: '2026-03-09T09:00:00.000Z',
    summaryOnly: false,
  });
  assert.equal(_test.requestedAdminPageSize({ page_size: '2' }), 2);
  assert.equal(_test.requestedAdminPageSize({ page_size: '21' }), 20);
  assert.equal(_test.requestedAdminPageSize({ page_size: 'invalid' }), 20);
  assert.match(_test.parseAdminReportRequest({ start: '2026-01-01T00:00:00Z' }).error, /Both start and end/i);
  assert.match(_test.parseAdminReportRequest({
    start: '2026-02-01T00:00:00Z',
    end: '2026-01-01T00:00:00Z',
  }).error, /Invalid order reporting period/i);
});

test('page SQL admits only settled commerce lifecycles while business metrics stay search-independent with minimal profit inputs', () => {
  const pageQuery = _test.buildAdminPageQuery();
  const summaryQuery = _test.buildAdminSummaryQuery();

  assert.match(pageQuery, /LIMIT \$4 OFFSET \$5/i);
  assert.match(pageQuery, /COUNT\(\*\)::integer FROM filtered_orders/i);
  assert.match(pageQuery, /POSITION\(\$3::text IN LOWER\(COALESCE\(id/i);
  assert.match(pageQuery, /customer_name/i);
  assert.match(pageQuery, /raw_order_email/i);
  assert.doesNotMatch(pageQuery, /order_items|json_agg\([^)]*items/i);
  assert.match(pageQuery, /payment_method <> 'admin_deploy_preview_test'/i);
  assert.match(pageQuery, /is_test_order = FALSE/i);
  const visibleOrdersSql = pageQuery.match(/visible_orders AS \([\s\S]*?\n\s*\),\n\s*filtered_orders AS/i)?.[0] || '';
  assert.match(visibleOrdersSql, /effective_status IN \('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded'\)/i);
  assert.doesNotMatch(visibleOrdersSql, /'pending'|'failed'|'canceled'|'cancelled'/i);

  assert.match(summaryQuery, /ROW_NUMBER\(\) OVER/i);
  assert.match(summaryQuery, /PARTITION BY reporting_customer_email/i);
  assert.match(summaryQuery, /effective_status IN \('paid', 'in_production', 'shipped', 'delivered', 'fulfilled'\)/i);
  assert.match(summaryQuery, /effective_status = 'refunded'/i);
  assert.match(summaryQuery, /gross_sales_cents - period_totals\.recorded_refunds_cents/i);
  assert.match(summaryQuery, /repeat_customers::double precision \/ customer_totals\.identified_customers/i);
  assert.doesNotMatch(summaryQuery, /\$3|file_key|overlay_image|text_elements/i);

  // A pending PayPal row with completed capture/reconciliation evidence is
  // promoted into the same successful lifecycle used by the existing Admin.
  assert.match(summaryQuery, /paypal_capture_id/i);
  assert.match(summaryQuery, /payment_method[\s\S]*paypal[\s\S]*payment_reconciliation_status|reconciliation_status[\s\S]*complete/i);
  assert.match(summaryQuery, /is_test_order = FALSE/i);
  assert.match(summaryQuery, /admin_deploy_preview_test/i);
  assert.match(summaryQuery, /tracking_number[\s\S]*IN \('pending', 'paid', 'in_production'\)[\s\S]*THEN 'shipped'/i);
  assert.match(summaryQuery, /tracking_numbers/i);
  assert.match(summaryQuery, /jsonb_array_elements/i);
});

test('saved tracking promotes active fulfillment states to shipped without overriding terminal states', () => {
  for (const status of ['pending', 'paid', 'in_production']) {
    assert.equal(_test.deriveFulfillmentStatus({ status, tracking_number: ' 123456789 ' }), 'shipped');
  }
  assert.equal(_test.deriveFulfillmentStatus({
    status: 'pending',
    tracking_numbers: [{ trackingNumber: '987654321' }],
  }), 'shipped');
  const [arrayOnly] = _test.normalizeAdminListOrders([{
    id: 'tracked-array-only-order',
    status: 'pending',
    tracking_number: null,
    tracking_numbers: [{ carrier: 'fedex', trackingNumber: '555555555555' }],
    items: [],
  }]);
  assert.equal(arrayOnly.status, 'shipped');
  assert.equal(arrayOnly.trackingNumbers[0].trackingNumber, '555555555555');
  for (const status of ['refunded', 'canceled', 'cancelled', 'failed', 'delivered', 'fulfilled']) {
    assert.equal(_test.deriveFulfillmentStatus({ status, tracking_number: '123456789' }), status);
  }
  assert.equal(_test.deriveFulfillmentStatus({ status: 'pending', tracking_number: '  ' }), 'pending');

  const [normalized] = _test.normalizeAdminListOrders([{
    id: 'tracked-pending-order',
    status: 'pending',
    tracking_number: '123456789',
    items: [],
  }]);
  assert.equal(normalized.status, 'shipped');
  assert.equal(normalized.trackingNumbers.length, 1);
  assert.equal(normalized.trackingNumbers[0].trackingNumber, '123456789');
  assert.equal(normalized.tracking_numbers[0].label, 'Package 1');
});

test('Admin hydration keeps the selected settled rows in deterministic page order', async () => {
  const ids = [
    '11111111-2222-4333-8444-000011223341',
    '11111111-2222-4333-8444-000011223342',
    '11111111-2222-4333-8444-000011223343',
  ];
  const rows = [
    { id: ids[0], status: 'paid', total_cents: 10_000, is_test_order: false, items: [], item_count: 0 },
    { id: ids[1], status: 'refunded', total_cents: 20_000, is_test_order: false, items: [], item_count: 0 },
    { id: ids[2], status: 'shipped', tracking_number: 'TRACK-3', total_cents: 30_000, is_test_order: false, items: [], item_count: 0 },
  ];

  const sql = async (query) => {
    const text = queryText(query);
    if (/paged_orders AS/i.test(text)) {
      return [{ page_orders: ids.map((id) => ({ id })), total_items: ids.length }];
    }
    if (/period_totals AS/i.test(text)) return [{}];
    if (/WITH requested_order_ids AS/i.test(text)) return rows;
    if (/FROM orders\s+LEFT JOIN profiles/i.test(text)) {
      return rows.map((row) => ({
        id: row.id,
        total_cents: row.total_cents,
        is_test_order: false,
      }));
    }
    if (/FROM review_request_history/i.test(text)) return [];
    throw new Error(`unexpected SQL: ${text.slice(0, 120)}`);
  };

  const report = await _test.loadAdminReportData({
    event: { headers: {} },
    context: {},
    sql,
    request: {
      page: 1,
      pageSize: 20,
      search: '',
      start: null,
      end: null,
      summaryOnly: false,
    },
  });

  assert.deepEqual(report.orders.map(({ id, status }) => ({ id, status })), rows.map(({ id, status }) => ({ id, status })));
  assert.equal(report.pagination.totalItems, 3);
});

test('reporting email identity validates order first, then falls back to a valid profile candidate', async () => {
  const fallback = 'profile@real-business.com';
  const cases = [
    { orderEmail: null, expected: fallback },
    { orderEmail: 'guest@example.com', expected: fallback },
    { orderEmail: 'preview-checkout@bannersonthefly.com', expected: fallback },
    { orderEmail: 'not-an-email', expected: fallback },
    { orderEmail: 'customer@example.org', expected: fallback },
    { orderEmail: 'ORDER@VALID-BUSINESS.COM', expected: 'order@valid-business.com' },
  ];

  for (const [index, entry] of cases.entries()) {
    const order = {
      id: `reporting-order-${index}`,
      status: 'paid',
      email: entry.orderEmail,
      total_cents: 1000,
      items: [],
    };
    const queries = [];
    const sql = async (query) => {
      const text = queryText(query);
      queries.push(text);
      if (/FROM orders\s+LEFT JOIN profiles/i.test(text)) {
        return [{
          id: order.id,
          total_cents: 1000,
          payment_method: 'stripe',
          reporting_customer_email: fallback,
          payment_reconciliation_status: 'complete',
        }];
      }
      return [];
    };
    const [enriched] = await _test.enrichOrderPaymentMetadata(sql, [order], {
      reconcilePendingPayments: false,
    });
    assert.equal(enriched.reporting_customer_email, entry.expected);
    assert.equal(enriched.review_request_customer_email, entry.expected);
    assert.match(queries[0], /example\.com/i);
    assert.match(queries[0], /guest\|preview\|test/i);
  }

  assert.equal(_test.normalizeReportingCustomerEmail('unknown@real-business.com'), null);
  assert.equal(_test.normalizeReportingCustomerEmail('buyer@test.com'), null);
  assert.equal(_test.normalizeReportingCustomerEmail('buyer@subdomain.invalid'), null);
  assert.equal(_test.normalizeReportingCustomerEmail('buyer@real-business.com'), 'buyer@real-business.com');
});

test('synthetic profile identity remains unidentified when the order candidate is also invalid', async () => {
  const order = {
    id: 'reporting-no-valid-candidate',
    status: 'paid',
    email: 'malformed',
    total_cents: 1000,
    items: [],
  };
  const sql = async (query) => {
    if (/FROM orders\s+LEFT JOIN profiles/i.test(queryText(query))) {
      return [{
        id: order.id,
        payment_method: 'stripe',
        reporting_customer_email: 'test@real-business.com',
      }];
    }
    return [];
  };
  const [enriched] = await _test.enrichOrderPaymentMetadata(sql, [order], {
    reconcilePendingPayments: false,
  });
  assert.equal(enriched.reporting_customer_email, null);
  assert.equal(enriched.review_request_customer_email, null);
});

test('summary response uses exact aggregate SQL independent of search and skips rich item hydration', async () => {
  const calls = [];
  const sql = async (query, parameters = []) => {
    const text = queryText(query);
    calls.push({ text, parameters });
    if (/paged_orders AS/i.test(text)) {
      return [{ page_orders: [{ id: '11111111-2222-4333-8444-000011223344' }], total_items: '41' }];
    }
    if (/period_totals AS/i.test(text)) {
      return [{
        total_orders: '12',
        gross_sales_cents: '125000',
        recorded_refunds_cents: '25000',
        net_sales_cents: '100000',
        average_order_value_cents: '8333',
        identified_customers: '8',
        new_customers: '3',
        repeat_customers: '5',
        repeat_rate: '0.625',
        overview_total_orders: '50',
        overview_in_production_orders: '4',
        overview_shipped_orders: '30',
        overview_pending_orders: '10',
        overview_refunded_orders: '6',
        overview_total_revenue_cents: '500000',
        overview_refunded_revenue_cents: '45000',
      }];
    }
    throw new Error('unexpected SQL');
  };

  const report = await _test.loadAdminReportData({
    event: { headers: {} },
    context: {},
    sql,
    request: {
      page: 2,
      pageSize: 20,
      search: 'alice',
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-09-01T00:00:00.000Z',
      summaryOnly: true,
    },
  });

  assert.deepEqual(report.orders, []);
  assert.deepEqual(report.pagination, {
    page: 2,
    pageSize: 20,
    totalItems: 41,
    totalPages: 3,
    hasPrevious: true,
    hasNext: true,
  });
  assert.equal(report.metrics.netSalesCents, 100000);
  assert.equal(report.metrics.repeatRate, 0.625);
  assert.equal(report.overview.totalOrders, 50);
  const pageCall = calls.find(({ text }) => /paged_orders AS/i.test(text));
  const summaryCall = calls.find(({ text }) => /period_totals AS/i.test(text));
  assert.deepEqual(pageCall.parameters, [
    '2026-08-01T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z',
    'alice',
    20,
    20,
  ]);
  assert.deepEqual(summaryCall.parameters, [
    '2026-08-01T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z',
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls.some(({ text }) => /reconcileOnly|admin_payment_reconciliation_queue/i.test(text)), false);
});

test('Admin page hydration is scalar-only and capped by both orders and items', () => {
  const query = _test.buildAdminHydrationQuery();
  assert.match(query, /unnest\(\$1::uuid\[\]\)/i);
  assert.match(query, /LIMIT \$2/i);
  assert.match(query, /item_count/i);
  assert.match(query, /jsonb_build_object[\s\S]*compositionSignature[\s\S]*previewWidthPx/i);
  assert.match(query, /END AS placement_preview/i);
  assert.doesNotMatch(query, /oi\.placement_preview/i);
  assert.match(query, /yard_sign_sidedness/i);
  assert.doesNotMatch(query, /canvas_state_json|text_elements|overlay_images|production_manifest|yard_sign_designs/i);
});

test('ordinary signed-in users cannot access Admin report SQL', async () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;
  const originalDatabase = process.env.NETLIFY_DATABASE_URL;
  try {
    process.env.AUTH_SESSION_SECRET = 'orders-report-auth-test-secret';
    process.env.NETLIFY_DATABASE_URL = 'postgres://must-not-be-used.invalid/database';
    const token = serverAuth.createSessionToken({
      id: 'customer-1',
      email: 'buyer@real-business.com',
      is_admin: false,
    });
    const response = await getOrdersHandler(new Request(
      'https://www.bannersonthefly.com/.netlify/functions/get-orders?admin_report=1',
      { headers: { 'x-banners-admin-session': token } },
    ), {});
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'UNAUTHORIZED');
  } finally {
    if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = originalSecret;
    if (originalDatabase === undefined) delete process.env.NETLIFY_DATABASE_URL;
    else process.env.NETLIFY_DATABASE_URL = originalDatabase;
  }
});


test('profit covers the full period beyond one page and excludes unpaid, refunded and test orders', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE profiles (id text PRIMARY KEY, email text);
      CREATE TABLE orders (id text PRIMARY KEY, user_id text, created_at timestamptz, status text,
        total_cents integer, subtotal_cents integer, is_test_order boolean DEFAULT false,
        applied_discount_cents integer DEFAULT 200);
      CREATE TABLE order_items (order_id text, material text, width_in integer, height_in integer,
        quantity integer, line_total_cents integer);
      INSERT INTO orders (id, created_at, status, total_cents, subtotal_cents)
        SELECT 'paid-' || n, '2026-09-15'::timestamptz, 'paid', 6148, 5800 FROM generate_series(1,25) n;
      INSERT INTO orders (id, created_at, status, total_cents, subtotal_cents, is_test_order) VALUES
        ('refund', '2026-09-15', 'refunded', 6148, 5800, false),
        ('pending', '2026-09-15', 'pending', 6148, 5800, false),
        ('test', '2026-09-15', 'paid', 6148, 5800, true),
        ('old', '2026-08-15', 'paid', 6148, 5800, false);
      INSERT INTO order_items SELECT id, '13oz', 24, 36, 1, 6000 FROM orders;
      INSERT INTO orders (id, created_at, status, total_cents, subtotal_cents)
        VALUES ('missing-items', '2026-09-15', 'paid', 5000, 5000);`);
    const result = await db.query(_test.buildAdminSummaryQuery(), ['2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z']);
    const summary = _test.normalizeAdminSummary(result.rows[0]);
    assert.equal(summary.metrics.totalOrders, 26);
    assert.equal(summary.metrics.netProfitCents, 25 * (6000 - 200 - 750 - 1000));
    assert.equal(summary.metrics.profitOrdersNeedingReview, 1);
    assert.equal(summary.profit_orders, undefined);
    const empty = await db.query(_test.buildAdminSummaryQuery(), ['2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z']);
    assert.equal(_test.normalizeAdminSummary(empty.rows[0]).metrics.netProfitCents, 0);
  } finally { await db.close(); }
});
