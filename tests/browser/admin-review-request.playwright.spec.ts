import { expect, test } from '@playwright/test';

const SAFE_TEST_EMAIL = 'review-flow-test@example.com';
const ORDER_ID = '2ad3018b-680a-463e-b761-9fdcf8a0d993';

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
