import { expect, test } from '@playwright/test';

const SAFE_TEST_EMAIL = 'review-flow-test@example.com';
const ORDER_ID = '2ad3018b-680a-463e-b761-9fdcf8a0d993';
const PREVIEW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360"><rect width="240" height="360" fill="#f8fafc"/><rect x="20" y="20" width="200" height="320" rx="12" fill="#18448d"/><text x="120" y="185" text-anchor="middle" fill="white" font-size="24">Test Art</text></svg>';
const LARGE_PREVIEW_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/orders/browser-test/high-resolution-preview.jpg';
const THUMBNAIL_PREVIEW_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/orders/browser-test/thumbnail-preview.jpg';

test('Admin review request requires confirmation, prevents repeat clicks, and updates persisted status', async ({ page }) => {
  let reviewSendCalls = 0;

  await page.addInitScript(() => {
    window.localStorage.setItem('banners_current_user', JSON.stringify({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin-browser-test@example.com',
      is_admin: true,
    }));
    window.localStorage.setItem('banners_server_session', 'browser-test-signed-session');
    window.sessionStorage.setItem('banners_server_session', 'browser-test-signed-session');
    if (!window.localStorage.getItem('banners_orders')) {
      window.localStorage.setItem('banners_orders', JSON.stringify([{
        id: '2ad3018b-680a-463e-b761-9fdcf8a0d993',
        user_id: null,
        email: 'review-flow-test@example.com',
        review_request_customer_email: 'review-flow-test@example.com',
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
      }]));
    }
  });

  await page.route('**/.netlify/functions/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/get-orders')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([{
          id: ORDER_ID,
          user_id: null,
          email: SAFE_TEST_EMAIL,
          review_request_customer_email: SAFE_TEST_EMAIL,
          review_request_last_sent_at: reviewSendCalls > 0 ? '2026-08-03T20:42:00.000Z' : null,
          review_request_sent_count: reviewSendCalls > 0 ? 1 : 0,
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
        }]),
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

  // Localhost intentionally uses the development storage adapter. Mirror the
  // persisted get-orders record that production reloads from the database.
  await page.evaluate((sentAt) => {
    const storedOrders = JSON.parse(window.localStorage.getItem('banners_orders') || '[]');
    storedOrders[0].review_request_last_sent_at = sentAt;
    storedOrders[0].review_request_sent_count = 1;
    window.localStorage.setItem('banners_orders', JSON.stringify(storedOrders));
  }, '2026-08-03T20:42:00.000Z');

  await page.reload({ waitUntil: 'domcontentloaded' });
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

    const popup = {
      opener: null,
      closed: false,
      location: {
        replace: () => document.documentElement.setAttribute('data-original-file-opened', 'true'),
      },
      close() { this.closed = true; },
    };
    window.open = () => popup as unknown as Window;
  }, { savedOrder: order });

  await page.route('**/.netlify/functions/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/get-orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([order]) });
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
      await new Promise((resolve) => setTimeout(resolve, 300));
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

  await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });

  const originalFileButton = page.getByRole('button', { name: 'Original File', exact: true }).filter({ visible: true });
  await expect(originalFileButton).toBeVisible();
  await expect(page.locator('[data-admin-file-group]').filter({ visible: true })).toBeVisible();
  await expect(page.locator('[data-admin-action-group]').filter({ visible: true })).toBeVisible();

  await originalFileButton.click();
  await expect(page.getByRole('button', { name: 'Opening...', exact: true }).filter({ visible: true })).toBeDisabled();
  await expect(page.locator('html')).toHaveAttribute('data-original-file-opened', 'true');
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

  await lightbox.getByRole('button', { name: 'Close preview', exact: true }).last().click();
  await expect(lightbox).toHaveCount(0);
  await expect(viewOrderDialog).toBeVisible();
  await viewOrderDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(viewOrderDialog).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
