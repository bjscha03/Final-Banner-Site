import { expect, test } from '@playwright/test';

for (const path of ['/google-ads-banner', '/design']) {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    test(`${path}: shipping benefits stay readable at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      // These are display/cart-opening checks only. Never call production services.
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/.netlify/functions/')) {
          const body = url.pathname.endsWith('/cart-load')
            ? { cartData: [] }
            : url.pathname.endsWith('/paypal-config')
              ? { enabled: false }
              : { success: true };
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        } else if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['blob:', 'data:'].includes(url.protocol)) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const summary = page.locator('[data-testid="price-breakdown"]:visible').first();
      const summaryBadge = summary.getByTestId('free-next-day-air-badge');
      await expect(summaryBadge).toBeVisible();
      await expect(summaryBadge).toContainText(/FREE\s+Next-Day Air/);
      await expect(summaryBadge).toContainText('Shipping after production');
      await expect(summary).toContainText(/\$[\d,]+\.\d{2}/);
      await expect.poll(() => summaryBadge.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      if ([390, 1440].includes(width)) {
        await summary.screenshot({ path: testInfo.outputPath(`summary-${width}.png`) });
      }

      const bar = page.getByTestId('mobile-subtotal-bar');
      if (width < 768) {
        await expect(bar).toBeVisible();
        const badge = bar.getByTestId('free-next-day-air-badge');
        await expect(badge).toBeVisible();
        await expect(badge).toContainText(/FREE\s+Next-Day Air/);
        const button = bar.getByRole('button').last();
        const buttonBox = await button.boundingBox();
        const badgeBox = await badge.boundingBox();
        expect(buttonBox).not.toBeNull();
        expect(badgeBox).not.toBeNull();
        expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
        expect(badgeBox!.x).toBeGreaterThanOrEqual(0);
        expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(buttonBox!.x);
        expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(width);
        await expect.poll(() => bar.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
        await expect.poll(async () => {
          const footer = await bar.boundingBox();
          const spacer = await page.getByTestId('mobile-subtotal-spacer').boundingBox();
          return Math.abs((footer?.height || 0) - (spacer?.height || 0));
        }).toBeLessThanOrEqual(1);
        await bar.screenshot({ path: testInfo.outputPath(`sticky-${width}.png`) });
        const cartButton = bar.getByRole('button', { name: /^View Cart \(/ });
        if (await cartButton.count()) {
          await cartButton.click();
          await expect(page.getByRole('dialog', { name: 'Shopping cart' })).toBeVisible();
        }
      }
    });
  }
}
