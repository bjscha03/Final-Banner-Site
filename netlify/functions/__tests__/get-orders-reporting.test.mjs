import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import getOrdersHandler, { _test } from '../get-orders.mjs';

const require = createRequire(import.meta.url);
const serverAuth = require('../_shared/server-auth.cjs');

const queryText = (value) => Array.isArray(value) ? value.join('?') : String(value || '');

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

test('page SQL preserves non-test history while exact business metrics stay paid-only, search-independent, and item-free', () => {
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
  assert.doesNotMatch(visibleOrdersSql, /effective_status IN/i);

  assert.match(summaryQuery, /ROW_NUMBER\(\) OVER/i);
  assert.match(summaryQuery, /PARTITION BY reporting_customer_email/i);
  assert.match(summaryQuery, /effective_status IN \('paid', 'in_production', 'shipped', 'delivered', 'fulfilled'\)/i);
  assert.match(summaryQuery, /effective_status = 'refunded'/i);
  assert.match(summaryQuery, /gross_sales_cents - period_totals\.recorded_refunds_cents/i);
  assert.match(summaryQuery, /repeat_customers::double precision \/ customer_totals\.identified_customers/i);
  assert.doesNotMatch(summaryQuery, /\$3|order_items|json_agg/i);

  // A pending PayPal row with completed capture/reconciliation evidence is
  // promoted into the same successful lifecycle used by the existing Admin.
  assert.match(summaryQuery, /paypal_capture_id/i);
  assert.match(summaryQuery, /payment_method[\s\S]*paypal[\s\S]*payment_reconciliation_status|reconciliation_status[\s\S]*complete/i);
  assert.match(summaryQuery, /is_test_order = FALSE/i);
  assert.match(summaryQuery, /admin_deploy_preview_test/i);
  assert.match(summaryQuery, /tracking_number[\s\S]*IN \('pending', 'paid', 'in_production'\)[\s\S]*THEN 'shipped'/i);
});

test('saved tracking promotes active fulfillment states to shipped without overriding terminal states', () => {
  for (const status of ['pending', 'paid', 'in_production']) {
    assert.equal(_test.deriveFulfillmentStatus({ status, tracking_number: ' 123456789 ' }), 'shipped');
  }
  assert.equal(_test.deriveFulfillmentStatus({
    status: 'pending',
    tracking_numbers: [{ trackingNumber: '987654321' }],
  }), 'shipped');
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
});

test('Admin hydration keeps historical non-test rows regardless of legacy or terminal status', async () => {
  const ids = [
    '11111111-2222-4333-8444-000011223341',
    '11111111-2222-4333-8444-000011223342',
    '11111111-2222-4333-8444-000011223343',
  ];
  const rows = [
    { id: ids[0], status: 'completed', total_cents: 10_000, is_test_order: false, items: [], item_count: 0 },
    { id: ids[1], status: 'cancelled', total_cents: 20_000, is_test_order: false, items: [], item_count: 0 },
    { id: ids[2], status: 'pending', total_cents: 30_000, is_test_order: false, items: [], item_count: 0 },
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
