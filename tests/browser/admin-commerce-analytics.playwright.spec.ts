import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const VISUAL_QA_PROJECTS = new Set(['chromium-1440x900', 'chromium-pixel8-portrait']);
const ADMIN_SESSION = 'admin-commerce-browser-contract';
const ORDER_ID = '11111111-2222-4333-8444-000011223344';

const abandonedCarts = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    user_id: null,
    session_id: 'browser-cart-alice',
    customer_kind: 'guest',
    customer_first_name: 'Alice',
    customer_last_name: 'Buyer',
    email: 'alice@example.com',
    phone: '502-555-0101',
    item_count: 1,
    source_item_count: 2,
    stored_item_count: 1,
    snapshot_completeness: 'incomplete',
    item_quantity: 2,
    item_summaries: [{
      product_type: 'banner',
      width_in: 48,
      height_in: 24,
      dimensions: '48 x 24 in',
      area_sqft: 8,
      material: '13oz vinyl',
      quantity: 2,
      line_total_cents: 12_950,
      has_artwork: null,
    }],
    subtotal_cents: 12_950,
    discount_cents: null,
    tax_cents: null,
    estimated_total_cents: 12_950,
    captured_value_cents: 12_950,
    total_value: 129.5,
    currency: 'USD',
    checkout_stage: 'contact',
    checkout_stage_updated_at: '2026-08-31T18:30:00.000Z',
    has_artwork: null,
    recovery_status: 'abandoned',
    recovery_emails_sent: 0,
    discount_code: null,
    last_recovery_email_at: null,
    recovery_suppressed_at: null,
    recovery_suppression_reason: null,
    last_activity_at: '2026-08-31T18:00:00.000Z',
    abandoned_at: '2026-08-31T19:00:00.000Z',
    recovered_at: null,
    recovered_order_id: null,
    created_at: '2026-08-31T17:45:00.000Z',
    item_summaries_truncated: false,
    first_item_thumbnail: null,
  },
  {
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    user_id: '22222222-2222-4222-8222-222222222222',
    session_id: 'browser-cart-recovered',
    customer_kind: 'signed_in',
    customer_first_name: 'Robin',
    customer_last_name: 'Recovered',
    email: 'robin@example.com',
    phone: null,
    item_count: 1,
    source_item_count: 1,
    stored_item_count: 1,
    snapshot_completeness: 'complete',
    item_quantity: 1,
    item_summaries: [{
      product_type: 'mesh_banner',
      width_in: 36,
      height_in: 24,
      dimensions: '36 x 24 in',
      area_sqft: 6,
      material: 'mesh',
      quantity: 1,
      line_total_cents: 8_900,
      has_artwork: true,
    }],
    subtotal_cents: 8_900,
    discount_cents: 890,
    tax_cents: 480,
    estimated_total_cents: 8_490,
    captured_value_cents: 8_900,
    total_value: 89,
    currency: 'USD',
    checkout_stage: 'payment_started',
    checkout_stage_updated_at: '2026-08-30T16:30:00.000Z',
    has_artwork: true,
    recovery_status: 'recovered',
    recovery_emails_sent: 1,
    discount_code: 'RECOVER10',
    last_recovery_email_at: '2026-08-30T17:00:00.000Z',
    recovery_suppressed_at: null,
    recovery_suppression_reason: null,
    last_activity_at: '2026-08-30T18:00:00.000Z',
    abandoned_at: '2026-08-30T14:00:00.000Z',
    recovered_at: '2026-08-30T18:00:00.000Z',
    recovered_order_id: 'ORDER-RECOVERED-1001',
    recovered_order_status: 'paid',
    recovered_revenue_state: 'retained',
    created_at: '2026-08-30T13:00:00.000Z',
    item_summaries_truncated: false,
    first_item_thumbnail: null,
  },
  {
    id: 'cccccccc-3333-4333-8333-333333333333',
    user_id: null,
    session_id: 'browser-cart-suppressed',
    customer_kind: 'guest',
    customer_first_name: 'Sam',
    customer_last_name: 'Suppressed',
    email: 'suppressed@example.com',
    phone: null,
    item_count: 1,
    source_item_count: 1,
    stored_item_count: 1,
    snapshot_completeness: 'complete',
    item_quantity: 1,
    item_summaries: [{
      product_type: 'yard_sign',
      width_in: 24,
      height_in: 18,
      dimensions: '24 x 18 in',
      area_sqft: 3,
      material: 'corrugated plastic',
      quantity: 1,
      line_total_cents: 5_000,
      has_artwork: false,
    }],
    subtotal_cents: 5_000,
    discount_cents: 0,
    tax_cents: 0,
    estimated_total_cents: 5_000,
    captured_value_cents: 5_000,
    total_value: 50,
    currency: 'USD',
    checkout_stage: 'checkout',
    checkout_stage_updated_at: '2026-08-31T11:30:00.000Z',
    has_artwork: false,
    recovery_status: 'active',
    recovery_emails_sent: 0,
    discount_code: null,
    last_recovery_email_at: null,
    recovery_suppressed_at: '2026-08-31T12:00:00.000Z',
    recovery_suppression_reason: 'hard_bounce',
    last_activity_at: '2026-08-31T12:00:00.000Z',
    abandoned_at: null,
    recovered_at: null,
    recovered_order_id: null,
    created_at: '2026-08-31T11:00:00.000Z',
    item_summaries_truncated: false,
    first_item_thumbnail: null,
  },
];

const abandonedAnalytics = {
  totalCount: 3,
  activeCount: 1,
  abandonedCount: 1,
  recoveredCount: 1,
  recoveredRetainedCount: 1,
  recoveredRefundedCount: 0,
  recoveredRevenueUnknownCount: 0,
  expiredCount: 0,
  totalCapturedValueCents: 26_850,
  activeValueCents: 17_950,
  recoveredValueCents: 8_900,
  recoveredAfterEmailCount: 1,
  recoveredAfterEmailRetainedCount: 1,
  recoveredAfterEmailValueCents: 8_900,
  suppressedCount: 1,
  withEmailCount: 3,
  abandonmentCohortCount: 2,
  topSizes: [{ label: '36 x 24 in', count: 1 }, { label: '48 x 24 in', count: 1 }],
  topMaterials: [{ label: '13oz vinyl', count: 1 }, { label: 'mesh', count: 1 }],
  topProducts: [{ label: 'banner', count: 1 }, { label: 'mesh_banner', count: 1 }],
  valueBands: [{ label: '$100–$249', count: 1 }, { label: '$50–$99', count: 1 }],
  checkoutStages: [{ label: 'contact', count: 1 }, { label: 'payment_started', count: 1 }],
};

const abandonedOutcomeComparison = {
  terminalSampleSize: 42,
  minimumSampleSize: 20,
  minimumOutcomeCount: 5,
  sizeClassifiedSampleSize: 32,
  valueClassifiedSampleSize: 42,
  sizeBands: [
    {
      key: 'small_medium',
      label: 'Small / medium (<18 sq ft; below 3×6)',
      abandonedCount: 10,
      completedCount: 10,
      sampleSize: 20,
      abandonmentRate: 0.5,
      sufficientSample: true,
    },
    {
      key: 'large_plus',
      label: 'Large+ (≥18 sq ft; 3×6 or larger)',
      abandonedCount: 8,
      completedCount: 4,
      sampleSize: 12,
      abandonmentRate: null,
      sufficientSample: false,
    },
  ],
  valueBands: [
    { key: '$0–$49', label: '$0–$49', abandonedCount: 2, completedCount: 2, sampleSize: 4, abandonmentRate: null, sufficientSample: false },
    { key: '$50–$99', label: '$50–$99', abandonedCount: 4, completedCount: 4, sampleSize: 8, abandonmentRate: null, sufficientSample: false },
    { key: '$100–$249', label: '$100–$249', abandonedCount: 10, completedCount: 10, sampleSize: 20, abandonmentRate: 0.5, sufficientSample: true },
    { key: '$250–$499', label: '$250–$499', abandonedCount: 3, completedCount: 3, sampleSize: 6, abandonmentRate: null, sufficientSample: false },
    { key: '$500+', label: '$500+', abandonedCount: 2, completedCount: 2, sampleSize: 4, abandonmentRate: null, sufficientSample: false },
  ],
};

const sizeFilteredAbandonedAnalytics = {
  ...abandonedAnalytics,
  totalCount: 1,
  activeCount: 0,
  abandonedCount: 1,
  recoveredCount: 0,
  recoveredRetainedCount: 0,
  recoveredRefundedCount: 0,
  recoveredRevenueUnknownCount: 0,
  totalCapturedValueCents: 12_950,
  activeValueCents: 12_950,
  recoveredValueCents: 0,
  recoveredAfterEmailCount: 0,
  recoveredAfterEmailRetainedCount: 0,
  recoveredAfterEmailValueCents: 0,
  suppressedCount: 0,
  withEmailCount: 1,
  abandonmentCohortCount: 1,
  topSizes: [{ label: '48 x 24 in', count: 1 }],
  topMaterials: [{ label: '13oz vinyl', count: 1 }],
  topProducts: [{ label: 'banner', count: 1 }],
  valueBands: [{ label: '$100–$249', count: 1 }],
  checkoutStages: [{ label: 'contact', count: 1 }],
};

function abandonedResponse(url: URL) {
  if (url.searchParams.get('summary') === '1') {
    return { carts: [], analytics: abandonedAnalytics, summaryOnly: true };
  }
  const filteredBySize = url.searchParams.get('size') === '48x24';
  const carts = filteredBySize ? [abandonedCarts[0]] : abandonedCarts;
  const filteredAnalytics = filteredBySize ? sizeFilteredAbandonedAnalytics : abandonedAnalytics;
  return {
    carts,
    analytics: { ...abandonedAnalytics, outcomeComparison: abandonedOutcomeComparison },
    filteredAnalytics: { ...filteredAnalytics, outcomeComparison: abandonedOutcomeComparison },
    outcomeComparison: abandonedOutcomeComparison,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: carts.length,
      totalPages: 1,
      hasPrevious: false,
      hasNext: false,
    },
  };
}

const customers = [
  {
    email: 'alice@example.com',
    fullName: 'Alice Buyer',
    firstName: 'Alice',
    lastName: 'Buyer',
    completedOrderCount: 2,
    lifetimeRevenueCents: 32_500,
    firstOrderAt: '2026-06-12T14:00:00.000Z',
    lastOrderAt: '2026-08-15T16:30:00.000Z',
    periodOrderCount: 2,
    periodRevenueCents: 32_500,
    segment: 'repeat',
    isLapsed: false,
    marketingEligible: true,
    suppressionReason: '',
    suppressionReasons: [],
  },
  {
    email: 'suppressed@example.com',
    fullName: 'Sam Suppressed',
    firstName: 'Sam',
    lastName: 'Suppressed',
    completedOrderCount: 1,
    lifetimeRevenueCents: 5_000,
    firstOrderAt: '2025-01-10T12:00:00.000Z',
    lastOrderAt: '2025-01-10T12:00:00.000Z',
    periodOrderCount: 1,
    periodRevenueCents: 5_000,
    segment: 'first_time',
    isLapsed: true,
    marketingEligible: false,
    suppressionReason: 'newsletter_unsubscribed',
    suppressionReasons: ['newsletter_unsubscribed', 'hard_bounce'],
  },
];

const customerOrders = {
  'alice@example.com': [
    { id: ORDER_ID, orderNumber: 'ORDER-1002', createdAt: '2026-08-15T16:30:00.000Z', status: 'shipped', totalCents: 20_000, completed: true },
    { id: '55555555-5555-4555-8555-555555555555', orderNumber: 'ORDER-1001', createdAt: '2026-06-12T14:00:00.000Z', status: 'paid', totalCents: 12_500, completed: true },
  ],
  'suppressed@example.com': [
    { id: '66666666-6666-4666-8666-666666666666', orderNumber: 'ORDER-0901', createdAt: '2025-01-10T12:00:00.000Z', status: 'paid', totalCents: 5_000, completed: true },
  ],
} as const;

const customerStats = {
  all: 2,
  firstTime: 1,
  repeat: 1,
  lapsed: 1,
  marketingEligible: 1,
  marketingExcluded: 1,
  lifetimeRevenueCents: 37_500,
  periodRevenueCents: 37_500,
};

const orderFixture = {
  id: ORDER_ID,
  user_id: null,
  email: 'alice@example.com',
  customer_name: 'Alice Buyer',
  shipping_name: 'Alice Buyer',
  shipping_street: '100 Test Street',
  shipping_city: 'Louisville',
  shipping_state: 'KY',
  shipping_zip: '40202',
  shipping_country: 'US',
  status: 'shipped',
  payment_method: 'stripe',
  stripe_payment_intent_id: 'pi_browser_safe_1002',
  subtotal_cents: 20_000,
  discount_cents: 0,
  tax_cents: 0,
  total_cents: 20_000,
  currency: 'USD',
  created_at: '2026-08-15T16:30:00.000Z',
  is_test_order: false,
  tracking_number: '777777777777',
  tracking_carrier: 'FedEx',
  tracking_numbers: [{ carrier: 'FedEx', trackingNumber: '777777777777', label: 'Main package' }],
  shipping_notification_sent: false,
  shipping_notification_sent_at: null,
  items: [{
    id: 'browser-banner-item',
    product_type: 'banner',
    width_in: 48,
    height_in: 24,
    quantity: 2,
    material: '13oz vinyl',
    area_sqft: 8,
    unit_price_cents: 7_500,
    line_total_cents: 15_000,
    grommets: 'every-2-3ft',
    rope_feet: 0,
    text_elements: [{ text: 'BROWSER QA', x: 50, y: 50 }],
  }, {
    id: 'browser-yard-sign-item',
    product_type: 'yard_sign',
    width_in: 24,
    height_in: 18,
    quantity: 1,
    material: 'corrugated plastic',
    area_sqft: 3,
    unit_price_cents: 5_000,
    line_total_cents: 5_000,
    grommets: 'none',
    rope_feet: 0,
    text_elements: [{ text: 'SECOND LINE', x: 50, y: 50 }],
  }],
};

const earlierOrderFixture = {
  ...orderFixture,
  id: '55555555-5555-4555-8555-555555555555',
  status: 'paid',
  payment_method: 'paypal',
  stripe_payment_intent_id: null,
  paypal_capture_id: 'SAFE-BROWSER-CAPTURE-1001',
  subtotal_cents: 12_500,
  total_cents: 12_500,
  created_at: '2026-06-12T14:00:00.000Z',
  tracking_number: null,
  tracking_numbers: [],
  items: [],
};

const adminOrderSummaryFixture = {
  ...orderFixture,
  tracking_number: null,
  tracking_carrier: null,
  tracking_numbers: [],
  items: orderFixture.items.slice(0, 1),
  item_count: orderFixture.items.length,
  items_truncated: true,
  admin_detail_loaded: false,
};

const earlierAdminOrderSummaryFixture = {
  ...earlierOrderFixture,
  item_count: 1,
  items_truncated: true,
  admin_detail_loaded: false,
};

function adminOrdersReportResponse(url: URL) {
  const allOrders = [adminOrderSummaryFixture, earlierAdminOrderSummaryFixture];
  const start = url.searchParams.get('start');
  const endExclusive = url.searchParams.get('end');
  const search = (url.searchParams.get('search') || '').trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(20, Math.max(1, Number(url.searchParams.get('page_size') || 20)));
  const periodOrders = allOrders.filter((order) => {
    const createdAt = new Date(order.created_at).getTime();
    return (!start || createdAt >= new Date(start).getTime())
      && (!endExclusive || createdAt < new Date(endExclusive).getTime());
  });
  const matchingOrders = periodOrders.filter((order) => !search || [
    order.id,
    order.user_id,
    order.email,
    order.customer_name,
    order.shipping_name,
  ].some((value) => String(value || '').toLowerCase().includes(search)));
  const totalItems = matchingOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pageOrders = matchingOrders.slice((page - 1) * pageSize, page * pageSize);
  const grossSalesCents = periodOrders.reduce((sum, order) => sum + order.total_cents, 0);
  const periodIds = new Set(periodOrders.map(({ id }) => id));
  const firstOrderInPeriod = periodIds.has(earlierOrderFixture.id);
  const laterOrderInPeriod = periodIds.has(orderFixture.id);

  return {
    orders: url.searchParams.get('summary') === '1' ? [] : pageOrders,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
    },
    metrics: {
      totalOrders: periodOrders.length,
      grossSalesCents,
      averageOrderValueCents: periodOrders.length ? Math.round(grossSalesCents / periodOrders.length) : 0,
      recordedRefundsCents: 0,
      netSalesCents: grossSalesCents,
      newCustomers: firstOrderInPeriod ? 1 : 0,
      repeatCustomers: laterOrderInPeriod ? 1 : 0,
      repeatRate: periodOrders.length ? (laterOrderInPeriod ? 1 : 0) : 0,
      identifiedCustomers: periodOrders.length ? 1 : 0,
    },
    overview: {
      totalOrders: 2,
      inProductionOrders: 0,
      shippedOrders: 1,
      pendingOrders: 1,
      refundedOrders: 0,
      totalRevenueCents: 32_500,
      refundedRevenueCents: 0,
    },
    period: { start, endExclusive },
    search,
    summaryOnly: url.searchParams.get('summary') === '1',
  };
}

function customerResponse(segment: string | null) {
  const selectedCustomers = segment === 'repeat' ? [customers[0]] : customers;
  const marketingEligible = selectedCustomers.filter((customer) => customer.marketingEligible).length;
  const marketingExcluded = selectedCustomers.length - marketingEligible;
  return {
    ok: true,
    customers: selectedCustomers,
    stats: customerStats,
    filteredSummary: {
      total: selectedCustomers.length,
      marketingEligible,
      marketingExcluded,
      lifetimeRevenueCents: selectedCustomers.reduce((sum, customer) => sum + customer.lifetimeRevenueCents, 0),
      periodRevenueCents: selectedCustomers.reduce((sum, customer) => sum + customer.periodRevenueCents, 0),
    },
    exportSummary: {
      eligible: marketingEligible,
      excluded: marketingExcluded,
      suppressionDataComplete: true,
      unavailableSources: [],
    },
    pagination: {
      page: 1,
      pageSize: 50,
      total: selectedCustomers.length,
      totalPages: 1,
      hasPrevious: false,
      hasNext: false,
    },
  };
}

function customerDetailResponse(email: string | null) {
  const customer = customers.find((entry) => entry.email === email) || customers[0];
  const orders = customerOrders[customer.email as keyof typeof customerOrders] || [];
  return {
    ok: true,
    customer: {
      email: customer.email,
      marketingEligible: customer.marketingEligible,
      suppressionReason: customer.suppressionReason,
      suppressionReasons: customer.suppressionReasons,
    },
    orders,
    pagination: { page: 1, pageSize: 50, total: orders.length, totalPages: 1, hasMore: false },
  };
}

async function expectNoDocumentOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.getBoundingClientRect().width,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
}

async function captureArtifact(page: Page, testInfo: TestInfo, name: string) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}',
  });
  await page.evaluate(() => document.fonts.ready);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(
    browserName !== 'chromium' || !VISUAL_QA_PROJECTS.has(testInfo.project.name),
    'Desktop Chromium and mobile Chromium cover this focused admin regression.',
  );
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ orders, session }) => {
    window.localStorage.setItem('banners_current_user', JSON.stringify({
      id: 'server-admin',
      email: 'admin-browser@example.test',
      is_admin: true,
    }));
    window.localStorage.setItem('banners_server_session', session);
    window.sessionStorage.setItem('banners_server_session', session);
    window.localStorage.setItem('banners_orders', JSON.stringify(orders));
  }, { orders: [orderFixture, earlierOrderFixture], session: ADMIN_SESSION });

  await page.route('**/.netlify/functions/**', async (route) => {
    const url = new URL(route.request().url());
    const expectAdminSession = async () => {
      const headers = await route.request().allHeaders();
      expect(headers['x-banners-admin-session']).toBe(ADMIN_SESSION);
    };

    if (url.pathname.endsWith('/get-abandoned-carts')) {
      await expectAdminSession();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(abandonedResponse(url)),
      });
      return;
    }

    if (url.pathname.endsWith('/admin-customers')) {
      await expectAdminSession();
      const mode = url.searchParams.get('mode') || 'list';
      let body: unknown;
      if (mode === 'detail') {
        body = customerDetailResponse(url.searchParams.get('email'));
      } else if (mode === 'export') {
        body = {
          ok: true,
          customers: [customers[0]],
          pagination: { pageSize: 250, nextCursor: null, hasMore: false },
        };
      } else if (mode === 'verify_export' && route.request().method() === 'POST') {
        const request = route.request().postDataJSON() as { emails?: string[] } | null;
        body = { ok: true, eligible: (request?.emails || []).filter((email) => email === 'alice@example.com') };
      } else {
        body = customerResponse(url.searchParams.get('segment'));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }

    if (url.pathname.endsWith('/get-orders')) {
      await expectAdminSession();
      const body = url.searchParams.get('admin_report') === '1'
        ? adminOrdersReportResponse(url)
        : [orderFixture, earlierOrderFixture];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }

    if (url.pathname.endsWith('/get-order')) {
      await expectAdminSession();
      expect(route.request().method()).toBe('GET');
      const orderId = url.searchParams.get('id');
      const order = orderId === ORDER_ID
        ? orderFixture
        : orderId === earlierOrderFixture.id
          ? earlierOrderFixture
          : null;
      await route.fulfill({
        status: order ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(order ? { ok: true, order } : { ok: false, error: 'Order not found' }),
      });
      return;
    }

    if (url.pathname.endsWith('/admin-custom-quotes')) {
      await expectAdminSession();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, quotes: [] }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('commerce admin analytics, customer history, and order tracking stay usable', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const customerCartRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (['/cart-load', '/cart-save', '/save-cart-snapshot'].some((suffix) => pathname.endsWith(suffix))) {
      customerCartRequests.push(pathname);
    }
  });
  const isMobile = testInfo.project.name === 'chromium-pixel8-portrait';

  await page.goto('/admin/abandoned-carts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Abandoned Cart Analytics' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'All-time abandoned cart metrics' })).toContainText('Total captured value');
  await expect(page.getByRole('region', { name: 'All-time abandoned cart metrics' })).toContainText('$268.50');
  await expect(page.getByRole('region', { name: 'All-time abandoned cart metrics' })).toContainText('Recorded cart suppressions');
  await expect(page.getByLabel('Checkout stage')).toBeVisible();
  await expect(page.getByText('Artwork unknown', { exact: true })).toBeVisible();
  await expect(page.getByText(/Captured 1 of 2 source cart lines\./)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All-time terminal cart outcome comparison' })).toBeVisible();
  await expect(page.getByText('Insufficient sample', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send recovery email 1' }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send recovery email 2' }).first()).toBeDisabled();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(1_100);
  expect(customerCartRequests).toEqual([]);

  await page.getByLabel('Size').fill('48x24');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText(/Showing\s+1\s+of 1 matching carts/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText(/Showing\s+3\s+of 3 matching carts/)).toBeVisible();

  await page.getByText('View cart and recovery details', { exact: true }).first().click();
  await expect(page.getByRole('cell', { name: 'Unknown', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete cart', exact: true }).first().click();
  await expect(page.getByRole('alertdialog').getByRole('heading', { name: 'Delete abandoned cart?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expectNoDocumentOverflow(page);
  await captureArtifact(page, testInfo, 'admin-abandoned-carts');

  await page.goto('/admin/customers', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Customer Analytics' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Customer segments' })).toBeVisible();
  await expect(page.getByText('Marketing-safe export', { exact: true })).toBeVisible();
  await expect(page.getByText('1 suppressed address is excluded from the current filtered export.', { exact: true })).toBeVisible();

  const repeatSegment = page.getByRole('region', { name: 'Customer segments' }).getByRole('button', { name: /Repeat/ });
  await repeatSegment.click();
  await expect(repeatSegment).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Alice Buyer', { exact: true }).filter({ visible: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^customers-\d{4}-\d{2}-\d{2}\.csv$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = await readFile(downloadPath!, 'utf8');
  expect(csv).toContain('alice@example.com');
  expect(csv).not.toContain('suppressed@example.com');

  if (isMobile) {
    await page.getByRole('button', { name: /Alice Buyer/ }).click();
  } else {
    const customerRow = page.getByLabel('View customer Alice Buyer');
    await customerRow.focus();
    await page.keyboard.press('Enter');
  }
  const customerDialog = page.getByRole('dialog');
  await expect(customerDialog.getByRole('heading', { name: 'Alice Buyer' })).toBeVisible();
  await expect(customerDialog.getByRole('heading', { name: 'Order history' })).toBeVisible();
  await expect(customerDialog.getByText('ORDER-1002', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(customerDialog).toHaveCount(0);
  await expectNoDocumentOverflow(page);
  await captureArtifact(page, testInfo, 'admin-customers');

  const detailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/get-order') && url.searchParams.get('id') === ORDER_ID;
  });
  await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Admin: Order Management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order performance' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Abandoned Carts' })).toBeVisible();
  await expect(page.getByLabel('Search full order history')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'All Time', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-admin-period-metrics]')).toContainText('Repeat Customers');
  await expect(page.getByRole('link', { name: 'View new customers' })).toHaveAttribute('href', '/admin/customers?segment=new');
  await expect(page.getByRole('link', { name: 'View repeat customers' })).toHaveAttribute('href', '/admin/customers?segment=repeat');
  await expect(page.getByText('Alice Buyer', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load files & actions' })).toHaveCount(0);
  await expect(page.getByText('Full order details required', { exact: true })).toHaveCount(0);
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.status()).toBe(200);

  const trackingGroup = page.locator('[data-admin-tracking-group]:visible').first();
  const fileGroup = page.locator('[data-admin-file-group]:visible').first();
  const actionGroup = page.locator('[data-admin-action-group]:visible').first();
  await expect(trackingGroup.getByRole('heading', { name: 'Tracking & customer notification' })).toBeVisible();
  await expect(trackingGroup).toContainText('Saving tracking does not send an email.');
  await expect(fileGroup).toContainText('Order Files');
  await expect(actionGroup).toContainText('Order Actions');
  await expect(page.locator('[data-admin-detail-page-status]:visible')).toHaveCount(0);

  const [trackingBox, fileBox, actionBox] = await Promise.all([
    trackingGroup.boundingBox(),
    fileGroup.boundingBox(),
    actionGroup.boundingBox(),
  ]);
  expect(trackingBox).not.toBeNull();
  expect(fileBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(fileBox!.y).toBeGreaterThan(trackingBox!.y);
  expect(actionBox!.y).toBeGreaterThan(fileBox!.y);

  await trackingGroup.getByRole('button', { name: 'Edit Tracking' }).click();
  await expect(trackingGroup.getByLabel('Tracking Number')).toHaveValue('777777777777');
  await expect(trackingGroup.getByLabel('Package Label')).toHaveValue('Main package');
  await trackingGroup.getByRole('button', { name: 'Cancel' }).click();

  if (!isMobile) {
    const previewButton = page.getByRole('button', { name: 'Open BANNER preview' }).filter({ visible: true }).first();
    await previewButton.focus();
    await page.keyboard.press('Enter');
    const artworkDialog = page.getByRole('dialog');
    await expect(artworkDialog.getByRole('heading', { name: 'Banner Preview' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(artworkDialog).toHaveCount(0);
  }

  await expectNoDocumentOverflow(page);
  await captureArtifact(page, testInfo, 'admin-orders');
  expect(pageErrors).toEqual([]);
});
