import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import renderer from '../../netlify/functions/_shared/realistic-preview/render.cjs';
import email from '../../netlify/functions/_shared/legacy/email-template.cjs';

test('admin order cards and details show the saved realistic preview without changing order data', async ({ page }, testInfo) => {
  const id = '00000000-0000-4000-8000-000000000001';
  const artUrl = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/realistic-test.png';
  const item = { id: 'item-1', order_id: id, product_type: 'banner', width_in: 72, height_in: 36, quantity: 1, material: '13oz', grommets: '4-corners', rope_feet: 6, rope_placement: 'bottom', pole_pockets: 'top', pole_pocket_size: '3', line_total_cents: 10000, final_render_url: artUrl, file_url: artUrl };
  const order = { id, user_id: null, email: 'customer@business.test', customer_name: 'Preview Test Customer', status: 'paid', payment_method: 'stripe', subtotal_cents: 10000, tax_cents: 600, total_cents: 10600, currency: 'usd', created_at: '2026-10-25T14:00:00Z', items: [item], admin_detail_loaded: true };
  const artwork = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360"><rect width="720" height="360" fill="#18448d"/><path d="M600 0H720V360H420Z" fill="#ff6b35"/><text x="35" y="150" fill="white" font-family="sans-serif" font-size="58" font-weight="bold">GRAND OPENING</text><text x="35" y="215" fill="white" font-family="sans-serif" font-size="28">COME CELEBRATE WITH US!</text></svg>')).png().toBuffer();
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('banners_current_user', JSON.stringify({ id: 'admin-test', email: 'admin@business.test', is_admin: true }));
    const token = btoa(JSON.stringify({ sub: 'admin-test', exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, '') + '.test-signature';
    localStorage.setItem('banners_server_session', token); sessionStorage.setItem('banners_server_session', token);
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'res.cloudinary.com') return route.fulfill({ contentType: 'image/png', body: artwork });
    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (/notify-order|resend|create-order|capture|stripe-create/.test(url.pathname)) writes.push(url.pathname);
      let body: any = { ok: true, issues: [] };
      if (url.pathname.endsWith('/get-orders')) body = { orders: [order], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasPrevious: false, hasNext: false },
        metrics: { totalOrders: 1, grossSalesCents: 10600, averageOrderValueCents: 10600, recordedRefundsCents: 0, netSalesCents: 10600, netProfitCents: 6750, profitOrdersNeedingReview: 0, newCustomers: 1, repeatCustomers: 0, repeatRate: 0, identifiedCustomers: 1 },
        overview: { totalOrders: 1, pendingOrders: 1, inProductionOrders: 0, shippedOrders: 0, refundedOrders: 0, totalRevenueCents: 10600, refundedRevenueCents: 0 }, period: { start: null, endExclusive: null }, search: '', summaryOnly: false };
      if (url.pathname.endsWith('/get-order')) body = { ok: true, order };
      if (url.pathname.endsWith('/get-abandoned-carts')) body = { carts: [] };
      if (url.pathname.endsWith('/admin-custom-quotes')) body = { ok: true, quotes: [] };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.goto('/admin/orders');
  const row = page.locator(`[data-admin-order-id="${id}"]`).filter({ visible: true });
  const preview = row.locator('[data-realistic-preview]');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-realistic-artwork-ready="true"]')).toHaveCount(1);
  await preview.getByRole('button').click();
  const lightbox = page.locator('[data-realistic-lightbox]');
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('[data-realistic-grommet]')).toHaveCount(4);
  await expect(lightbox.locator('[data-realistic-pocket="top"]')).toHaveCount(1);
  await expect(lightbox.locator('[data-realistic-rope="bottom"]')).toHaveCount(1);
  await expect(lightbox.locator('img').first()).toHaveAttribute('src', /\/v1\/realistic-test\.png$/);
  await expect(lightbox.locator('[data-preview-bleed-compensated]')).toHaveAttribute('data-preview-bleed-compensated', 'false');
  await lightbox.screenshot({ path: testInfo.outputPath('admin-realistic-preview.png') });
  await lightbox.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(lightbox).toHaveCount(0);
  await row.getByRole('button', { name: 'View Order', exact: true }).click();
  const details = page.getByRole('dialog', { name: /Order #/ });
  await expect(details.locator('[data-realistic-preview]')).toBeVisible();
  await details.locator('[data-realistic-preview]').getByRole('button').click();
  await expect(lightbox).toBeVisible();
  await lightbox.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(details).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(writes).toEqual([]);
});

test('order email preview is readable on desktop and mobile and links to the full PNG', async ({ page }, testInfo) => {
  const art = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360"><rect width="720" height="360" fill="#18448d"/><text x="50" y="190" fill="white" font-family="sans-serif" font-size="65">GRAND OPENING</text></svg>')).png().toBuffer();
  const png = await renderer.renderRealisticPreview({ width_in: 72, height_in: 36, material: '13oz', grommets: '4-corners', rope_feet: 0, pole_pockets: 'none' }, art);
  await page.route('**/*', route => route.fulfill({ contentType: 'image/png', body: route.request().url().includes('realistic.png') ? png : art }));
  const html = email.renderEmailLayout({ title: 'Order Confirmation', subtitle: 'Thank you for your order!', orderNumber: 'PREVIEW', bodyHtml: email.renderItems([{ name: '6 ft × 3 ft Vinyl Banner', productLabel: 'Banner', product_type: 'banner', quantity: 1, price: 90, thumbnailUrl: 'https://assets.example.test/art.png', realisticPreviewUrl: 'https://assets.example.test/realistic.png', grommetsDisplay: '4 Corners', sizeDisplay: '72″ × 36″', materialDisplay: '13oz Vinyl' }]) });
  await page.setContent(html);
  await expect(page.getByAltText('Realistic preview of 6 ft × 3 ft Vinyl Banner')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View larger realistic preview' })).toHaveAttribute('href', 'https://assets.example.test/realistic.png');
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('order-email-realistic-preview.png'), fullPage: true });
});
