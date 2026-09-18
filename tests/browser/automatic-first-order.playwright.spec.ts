import { expect, test } from '@playwright/test';
const item = { id: 'first-order-banner', product_type: 'banner', width_in: 48, height_in: 24, quantity: 1,
  material: '13oz', grommets: 'none', pole_pockets: 'none', rope_feet: 0, area_sqft: 8,
  unit_price_cents: 4000, rope_cost_cents: 0, pole_pocket_cost_cents: 0, line_total_cents: 4000,
  created_at: '2026-09-18T12:00:00.000Z' };
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.startsWith('/.netlify/functions/')) {
      const input = request.postDataJSON?.() || {};
      let body: unknown = { success: true };
      if (url.pathname.endsWith('/validate-discount-code')) {
        body = input.email === 'returning@example.com' ? { valid: false, error: 'Not eligible' }
          : { valid: true, discount: { id: 'test-promo', code: input.code, discountPercentage: input.code === 'REVIEW25' ? 25 : 20,
            discountAmountCents: null, expiresAt: '2099-12-31T23:59:59Z' } };
      } else if (url.pathname.endsWith('/cart-load')) body = { cartData: [] };
      else if (/\/(stripe|paypal)-config$/.test(url.pathname)) body = { enabled: false };
      // No order/payment endpoints should be called by this visual regression.
      if (/\/(create-order|stripe-create-payment-intent|paypal-create-order)$/.test(url.pathname)) throw new Error('Unexpected payment request');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    } else if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['blob:', 'data:'].includes(url.protocol)) await route.abort();
    else await route.continue();
  });
});
for (const width of [320, 390, 1440]) {
  test(`automatic welcome prices and shipping at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/design?width=48&height=24');
    const summary = page.locator('[data-testid="price-breakdown"]:visible').first();
    await expect(summary).toContainText('$32.00');
    await expect(summary.locator('s')).toHaveText('$40.00');
    await expect(summary).toContainText('20% off first order applied');
    await expect(summary).toContainText('You save $8.00');
    await expect(summary.getByTestId('free-next-day-air-badge')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply 20% first-order discount', exact: true })).toHaveCount(0);
    await summary.screenshot({ path: info.outputPath(`welcome-summary-${width}.png`) });
    if (width < 768) {
      const bar = page.getByTestId('mobile-subtotal-bar');
      await expect(bar).toContainText('$40.00'); await expect(bar).toContainText('$32.00');
      await expect(bar).toContainText('20% off first order applied');
      await expect(bar.getByRole('button', { name: 'View Cart (0)' })).toBeVisible();
      expect(await bar.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await bar.screenshot({ path: info.outputPath(`welcome-sticky-${width}.png`) });
    }
    // A user can apply a better offer without first removing the automatic one.
    await summary.locator('summary').click();
    await summary.getByRole('textbox', { name: 'Promo code', exact: true }).fill('REVIEW25');
    await summary.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(summary).toContainText('$30.00');
    await expect(summary).not.toContainText('20% off first order applied');
  });
}
test('checkout refresh preserves first-order pricing and updates before payment for a returning email', async ({ page }) => {
  await page.addInitScript(value => {
    localStorage.setItem('cart-storage', JSON.stringify({ state: { items: [value], _cartOwnerId: null }, version: 0 }));
  }, item);
  await page.goto('/checkout');
  const totals = page.getByTestId('checkout-order-totals').first();
  await expect(totals).toContainText('$33.92');
  await expect(page.getByText('20% off first order applied', { exact: true })).toBeVisible();
  // Exercise the same draft-change signal emitted by both provider email forms.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('bof:checkout-customer-draft-changed', { detail: { email: 'returning@example.com' } })));
  await expect(page.getByTestId('first-order-eligibility')).toContainText('price has been updated');
  await expect(totals).toContainText('$42.40');
  await expect(page.getByText('20% off first order applied', { exact: true })).toHaveCount(0);
});
