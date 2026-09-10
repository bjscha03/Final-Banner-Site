import { expect, test } from '@playwright/test';

const SAFE_TEST_EMAIL = 'review-flow-test@example.com';
const ORDER_ID = '2ad3018b-680a-463e-b761-9fdcf8a0d993';
const PREVIEW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360"><rect width="240" height="360" fill="#f8fafc"/><rect x="20" y="20" width="200" height="320" rx="12" fill="#18448d"/><text x="120" y="185" text-anchor="middle" fill="white" font-size="24">Test Art</text></svg>';
const LARGE_PREVIEW_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/orders/browser-test/high-resolution-preview.jpg';
const THUMBNAIL_PREVIEW_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/orders/browser-test/thumbnail-preview.jpg';

type AdminOrderFixture = {
  id: string;
  status: string;
  total_cents: number;
  items: unknown[];
  [key: string]: unknown;
};

const adminOrdersReportResponse = (order: AdminOrderFixture) => {
  const summaryItems = order.items.slice(0, 1);
  return {
    orders: [{
      ...order,
      // The production report intentionally returns a bounded item subset.
      // Files and actions stay locked until get-order returns the full record.
      items: summaryItems,
      item_count: order.items.length,
      items_truncated: order.items.length > summaryItems.length,
      admin_detail_loaded: false,
    }],
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
      hasPrevious: false,
      hasNext: false,
    },
    metrics: {
      totalOrders: 1,
      grossSalesCents: order.total_cents,
      averageOrderValueCents: order.total_cents,
      recordedRefundsCents: 0,
      netSalesCents: order.total_cents,
      newCustomers: 1,
      repeatCustomers: 0,
      repeatRate: 0,
      identifiedCustomers: 1,
    },
    overview: {
      totalOrders: 1,
      inProductionOrders: 0,
      shippedOrders: order.status === 'shipped' ? 1 : 0,
      pendingOrders: order.status === 'pending' ? 1 : 0,
      refundedOrders: order.status === 'refunded' ? 1 : 0,
      totalRevenueCents: order.total_cents,
      refundedRevenueCents: 0,
    },
    period: { start: null, endExclusive: null },
    search: '',
    summaryOnly: false,
  };
};

test('Admin review request requires confirmation, prevents repeat clicks, and updates persisted status', async ({ page }) => {
  let reviewSendCalls = 0;
  let detailLoadCalls = 0;
  const order = {
    id: ORDER_ID,
    user_id: null,
    email: SAFE_TEST_EMAIL,
    review_request_customer_email: SAFE_TEST_EMAIL,
    review_request_last_sent_at: null,
    review_request_sent_count: 0,
    customer_name: 'Browser Test Customer',
    status: 'paid',
    payment_method: 'paypal',
    paypal_capture_id: 'SAFE-BROWSER-TEST-CAPTURE',
    payment_reconciliation_status: 'complete',
    subtotal_cents: 2000,
    tax_cents: 120,
    total_cents: 2120,
    currency: 'USD',
    created_at: '2026-08-03T20:00:00.000Z',
    items: [],
    is_test_order: false,
    tracking_number: null,
    tracking_carrier: null,
  };
  const currentOrder = () => ({
    ...order,
    review_request_last_sent_at: reviewSendCalls > 0 ? '2026-08-03T20:42:00.000Z' : null,
    review_request_sent_count: reviewSendCalls > 0 ? 1 : 0,
  });

  await page.addInitScript(({ savedOrder }) => {
    window.localStorage.setItem('banners_current_user', JSON.stringify({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin-browser-test@example.com',
      is_admin: true,
    }));
    window.localStorage.setItem('banners_server_session', 'browser-test-signed-session');
    window.sessionStorage.setItem('banners_server_session', 'browser-test-signed-session');
    if (!window.localStorage.getItem('banners_orders')) {
      window.localStorage.setItem('banners_orders', JSON.stringify([savedOrder]));
    }
  }, { savedOrder: order });

  await page.route('**/.netlify/functions/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/get-orders')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(adminOrdersReportResponse(currentOrder())),
      });
      return;
    }

    if (url.pathname.endsWith('/get-order')) {
      detailLoadCalls += 1;
      expect(url.searchParams.get('id')).toBe(ORDER_ID);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, order: currentOrder() }),
      });
      return;
    }

    if (url.pathname.endsWith('/get-abandoned-carts')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ carts: [] }) });
      return;
    }

    if (url.pathname.endsWith('/admin-custom-quotes')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, quotes: [] }) });
      return;
    }

    if (url.pathname.endsWith('/send-review-request')) {
      reviewSendCalls += 1;
      expect(request.method()).toBe('POST');
      const payload = JSON.parse(request.postData() || '{}');
      expect(payload).toEqual({ orderId: ORDER_ID, confirmedPreviousSentAt: null });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          ok: true,
          sentAt: '2026-08-03T20:42:00.000Z',
          customerEmail: SAFE_TEST_EMAIL,
          messageId: 're_safe_browser_test',
        }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
  const sendButton = page.getByRole('button', { name: 'Send Review Email', exact: true }).filter({ visible: true });
  await expect.poll(() => detailLoadCalls).toBe(1);
  await expect(sendButton).toBeVisible();
  expect(reviewSendCalls).toBe(0);

  await sendButton.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Send review request?' })).toBeVisible();
  await expect(dialog.getByText(SAFE_TEST_EMAIL, { exact: true })).toBeVisible();
  expect(reviewSendCalls).toBe(0);

  const confirmButton = dialog.getByRole('button', { name: 'Send Review Email', exact: true });
  await confirmButton.click();
  await expect(dialog.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
  await expect(page.getByText('Review request sent', { exact: true })).toBeVisible();
  expect(reviewSendCalls).toBe(1);

  await expect(page.getByText(/Review request sent .*2026/).filter({ visible: true })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => detailLoadCalls).toBe(2);
  await expect(page.getByText(/Review request sent .*2026/).filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: 'Send Review Email', exact: true }).filter({ visible: true }).click();
  const duplicateDialog = page.getByRole('alertdialog');
  await expect(duplicateDialog.getByRole('heading', { name: 'Send another review request?' })).toBeVisible();
  await expect(duplicateDialog.getByText(/already sent to this customer on/i)).toBeVisible();
  expect(reviewSendCalls).toBe(1);
  await duplicateDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('Admin order files, organized actions, and nested preview zoom work together', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const order = {
    id: ORDER_ID,
    user_id: null,
    email: SAFE_TEST_EMAIL,
    customer_name: 'Browser Test Customer',
    shipping_name: 'Browser Test Customer',
    shipping_street: '1 Test Way',
    shipping_city: 'Boston',
    shipping_state: 'MA',
    shipping_zip: '02108',
    shipping_country: 'US',
    status: 'paid',
    payment_method: 'paypal',
    paypal_order_id: 'SAFE-BROWSER-TEST-ORDER',
    paypal_capture_id: 'SAFE-BROWSER-TEST-CAPTURE',
    payment_reconciliation_status: 'complete',
    subtotal_cents: 2700,
    tax_cents: 0,
    total_cents: 2700,
    currency: 'USD',
    created_at: '2026-08-03T20:00:00.000Z',
    is_test_order: false,
    items: [{
      id: 'browser-test-item',
      product_type: 'banner',
      width_in: 24,
      height_in: 36,
      quantity: 1,
      material: '13oz',
      grommets: 'every-2-3ft',
      pole_pockets: 'none',
      rope_feet: 0,
      unit_price_cents: 2700,
      line_total_cents: 2700,
      file_key: 'orders/browser-test/original-artwork.pdf',
      file_url: 'orders/browser-test/original-artwork.pdf',
      file_name: 'original-artwork.pdf',
      original_filename: 'original-artwork.pdf',
      thumbnail_url: THUMBNAIL_PREVIEW_URL,
      web_preview_url: null,
      final_render_url: LARGE_PREVIEW_URL,
      artwork_manifest: {
        originalUrl: 'orders/browser-test/original-artwork.pdf',
        originalFilename: 'original-artwork.pdf',
        mimeType: 'application/pdf',
        bytes: 1024,
        uploadStatus: 'uploaded',
      },
      image_position: { x: 0, y: 0 },
      image_scale: 1,
      fit_mode: 'fit',
      canvas_background_color: '#FFFFFF',
      text_elements: [],
    }],
  };

  await page.addInitScript(({ savedOrder }) => {
    window.localStorage.setItem('banners_current_user', JSON.stringify({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin-browser-test@example.com',
      is_admin: true,
    }));
    window.localStorage.setItem('banners_server_session', 'browser-test-signed-session');
    window.sessionStorage.setItem('banners_server_session', 'browser-test-signed-session');
    window.localStorage.setItem('banners_orders', JSON.stringify([savedOrder]));

  }, { savedOrder: order });

  let markOriginalFileRequested!: () => void;
  let releaseOriginalFileResponse!: () => void;
  const originalFileRequested = new Promise<void>((resolve) => {
    markOriginalFileRequested = resolve;
  });
  const originalFileResponseGate = new Promise<void>((resolve) => {
    releaseOriginalFileResponse = resolve;
  });
  let markDetailRequested!: () => void;
  let releaseDetailResponse!: () => void;
  const detailRequested = new Promise<void>((resolve) => {
    markDetailRequested = resolve;
  });
  const detailResponseGate = new Promise<void>((resolve) => {
    releaseDetailResponse = resolve;
  });

  await page.route('**/.netlify/functions/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/get-orders')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminOrdersReportResponse(order)),
      });
      return;
    }
    if (url.pathname.endsWith('/get-order')) {
      expect(url.searchParams.get('id')).toBe(ORDER_ID);
      markDetailRequested();
      await detailResponseGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, order }),
      });
      return;
    }
    if (url.pathname.endsWith('/get-abandoned-carts')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ carts: [] }) });
      return;
    }
    if (url.pathname.endsWith('/admin-custom-quotes')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, quotes: [] }) });
      return;
    }
    if (url.pathname.endsWith('/download-file')) {
      markOriginalFileRequested();
      await originalFileResponseGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n% browser test original artwork\n%%EOF',
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Match the real-order failure mode: the compact derivative is available,
  // while the large derivative and its original source fail. The expanded
  // preview must continue through the registered same-artwork fallbacks and
  // display the thumbnail derivative instead of ending on a gray panel.
  await page.route('https://res.cloudinary.com/**', async (route) => {
    const url = route.request().url();
    const isPrimary = url.includes('high-resolution-preview.jpg');
    const isCompactPrimary = isPrimary && url.includes('w_800');
    if (isPrimary && !isCompactPrimary) {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'large derivative unavailable' });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PREVIEW_SVG });
  });

  const detailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/get-order') && url.searchParams.get('id') === ORDER_ID;
  });
  await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });

  const originalFileButton = page.getByRole('button', { name: 'Original File', exact: true }).filter({ visible: true });
  await detailRequested;
  await expect(page.getByText('Browser Test Customer', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('[data-admin-detail-page-status]').filter({ visible: true })).toBeVisible();
  await expect(originalFileButton).toHaveCount(0);
  await expect(page.locator('[data-admin-file-group]').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('[data-admin-action-group]').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load files & actions', exact: true })).toHaveCount(0);
  await expect(page.getByText('Full order details required', { exact: true })).toHaveCount(0);
  releaseDetailResponse();
  expect((await detailResponsePromise).status()).toBe(200);
  await expect(originalFileButton).toBeVisible();
  await expect(page.locator('[data-admin-file-group]').filter({ visible: true })).toBeVisible();
  await expect(page.locator('[data-admin-action-group]').filter({ visible: true })).toBeVisible();

  const pageCountBeforeDownload = page.context().pages().length;
  const downloadPromise = page.waitForEvent('download');
  await originalFileButton.click();
  await originalFileRequested;
  await expect(page.getByRole('button', { name: 'Downloading...', exact: true }).filter({ visible: true })).toBeDisabled();
  releaseOriginalFileResponse();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('original-artwork.pdf');
  expect(page.context().pages()).toHaveLength(pageCountBeforeDownload);
  await expect(originalFileButton).toBeEnabled();

  await page.getByRole('button', { name: 'View Order', exact: true }).filter({ visible: true }).click();
  const viewOrderDialog = page.getByRole('dialog', { name: /Order #/i });
  await expect(viewOrderDialog).toBeVisible();
  await expect(viewOrderDialog.getByText('Original Customer Artwork', { exact: true })).toHaveCount(0);
  await expect(viewOrderDialog.getByText('Customer Placement Preview', { exact: true })).toHaveCount(0);
  const compactPreview = viewOrderDialog.locator('[data-order-item-preview="true"] [data-commerce-preview="true"]');
  await expect(compactPreview).toHaveAttribute('data-preview-ready', 'true');

  await viewOrderDialog.getByRole('button', { name: 'Open expanded Banner 1 preview', exact: true }).click();
  const lightbox = page.locator('[data-product-preview-lightbox]');
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('[data-order-item-expanded-preview="true"]')).toBeVisible();
  const expandedPreview = lightbox.locator('[data-commerce-preview="true"]');
  await expect(expandedPreview).toHaveAttribute('data-preview-ready', 'true');
  await expect(expandedPreview).toHaveAttribute('data-preview-failed', 'false');
  await expect(lightbox.locator('img').first()).toBeVisible();

  const layers = await Promise.all([
    lightbox.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex || '0', 10)),
    viewOrderDialog.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex || '0', 10)),
  ]);
  expect(layers[0]).toBeGreaterThan(layers[1]);
  await expect(lightbox).toHaveCSS('pointer-events', 'auto');

  await lightbox.getByRole('button', { name: 'Close preview', exact: true }).last().click();
  await expect(lightbox).toHaveCount(0);
  await expect(viewOrderDialog).toBeVisible();
  await viewOrderDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(viewOrderDialog).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
