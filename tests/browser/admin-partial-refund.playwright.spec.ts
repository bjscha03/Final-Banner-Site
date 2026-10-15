import { test, expect } from '@playwright/test';

test('admin records a partial refund, refreshes money metrics, and disables review emails', async ({ page }, testInfo) => {
  let refundCents = 0;
  let saves = 0;
  let emailCalls = 0;
  const id = '00000000-0000-4000-8000-000000000001';
  const itemId = '00000000-0000-4000-8000-000000000002';
  const currentOrder = () => ({ id, user_id: null, email: 'customer@business.test', customer_name: 'Refund Test Customer', status: 'paid',
    payment_method: 'stripe', payment_reconciliation_status: 'complete', subtotal_cents: 10000, tax_cents: 600, total_cents: 10600,
    partial_refund_cents: refundCents, partial_refund_tax_cents: 0, currency: 'usd', created_at: '2026-10-15T14:00:00Z',
    items: [{ id: itemId, order_id: id, product_type: 'banner', width_in: 72, height_in: 36, quantity: 1, material: '13oz', line_total_cents: 10000,
      file_name: 'ai-fit-72x36-browser-test.jpg', file_url: 'https://res.cloudinary.com/dtrxl120u/image/upload/v123/uploads/ai-fit-72x36-browser-test.jpg',
      artwork_manifest: { width: 2560, height: 1280 }, image_scale: 1 }], is_test_order: false });
  await page.addInitScript(() => {
    localStorage.setItem('banners_current_user', JSON.stringify({ id: 'admin-test', email: 'admin@business.test', is_admin: true }));
    // Every function request below is mocked. This payload only exercises the
    // browser's expiry/identity check; it cannot authenticate to a real server.
    const token = btoa(JSON.stringify({ sub: 'admin-test', exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, '') + '.test-signature';
    localStorage.setItem('banners_server_session', token);
    sessionStorage.setItem('banners_server_session', token);
  });
  await page.route('**/.netlify/functions/**', async route => {
    const url = new URL(route.request().url());
    let body: any = { ok: true };
    if (url.pathname.endsWith('/get-orders')) body = { orders: [{ ...currentOrder(), item_count: 1, admin_detail_loaded: false }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasPrevious: false, hasNext: false },
      metrics: { totalOrders: 1, grossSalesCents: 10600, averageOrderValueCents: 10600, recordedRefundsCents: refundCents, netSalesCents: 10600 - refundCents,
        netProfitCents: 6750 - refundCents, profitOrdersNeedingReview: 0, newCustomers: 1, repeatCustomers: 0, repeatRate: 0, identifiedCustomers: 1 },
      overview: { totalOrders: 1, pendingOrders: 1, inProductionOrders: 0, shippedOrders: 0, refundedOrders: 0, totalRevenueCents: 10600 - refundCents, refundedRevenueCents: refundCents },
      period: { start: null, endExclusive: null }, search: '', summaryOnly: false };
    if (url.pathname.endsWith('/get-order')) body = { ok: true, order: currentOrder() };
    if (url.pathname.endsWith('/get-abandoned-carts')) body = { carts: [] };
    if (url.pathname.endsWith('/admin-custom-quotes')) body = { ok: true, quotes: [] };
    if (url.pathname.endsWith('/admin-record-partial-refund')) {
      const input = route.request().postDataJSON();
      expect(input).toMatchObject({ orderId: id, amountCents: 2500, taxCents: 0, previousAmountCents: 0 });
      saves++; refundCents = input.amountCents; body = { ok: true, order: currentOrder(), recordOnly: true };
    }
    if (/send.*review|notify-order|resend-order/.test(url.pathname)) emailCalls++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('https://res.cloudinary.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#18448d"/><text x="30" y="150" fill="white" font-size="30">Test banner</text></svg>' }));
  await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
  const row = page.locator(`[data-admin-order-id="${id}"]`).filter({ visible: true });
  await expect(row.locator('[data-order-delivery-estimate]')).toContainText('Monday, Oct 19, 2026');
  await expect(row.locator('[data-ai-artwork-quality]')).toContainText('35.6 PPI');
  await expect(row.locator('[data-ai-artwork-quality]')).toContainText('Below the 200 PPI minimum');
  const review = row.getByRole('button', { name: 'Send Review Email', exact: true });
  await expect(review).toBeEnabled();
  await row.getByRole('button', { name: 'Record Partial Refund', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('does not issue a payment or email the customer');
  await dialog.getByLabel('Total refunded to date ($)', { exact: true }).fill('25.00');
  await dialog.getByLabel('Internal note (optional)').fill('Delivery issue');
  await page.screenshot({ path: testInfo.outputPath('partial-refund-dialog.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Save Refund Record' }).click();
  await expect(row.locator('[data-partial-refund]')).toContainText('Partial refund recorded: $25.00');
  await expect(review).toBeDisabled();
  await expect(review).toHaveCSS('background-color', 'rgb(226, 232, 240)');
  await expect(row.getByRole('button', { name: 'Send 30% Follow-Up', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: /Verify Review & Send/ })).toBeDisabled();
  await expect(page.locator('[data-admin-period-metrics]')).toContainText('$81.00');
  await expect(row).toContainText('Review emails are disabled because a partial refund is recorded');
  expect(saves).toBe(1); expect(emailCalls).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await row.screenshot({ path: testInfo.outputPath('admin-order-after-refund.png') });
});
