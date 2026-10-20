import { expect, test } from '@playwright/test';

const routes = [
  '/design', '/google-ads-banner', '/large-banners-fast',
  '/design?product=yard-signs', '/design?product=car-magnets',
  '/yard-signs', '/car-magnets', '/fall-festival-banners',
  '/products', '/products/standard-retractable-banner', '/political-signs', '/blog', '/about', '/shipping', '/custom-quote',
];

for (const route of routes) {
  test(`${route} has readable, complete imagery and usable navigation`, async ({ page }, testInfo) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const heading = page.locator('h1:visible').first();
    await expect(heading).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(heading).not.toHaveCSS('text-transform', 'uppercase');
    await expect(page.locator('[data-site-header]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('button', { name: 'Shopping cart', exact: true })).toBeVisible();
    for (const photo of await page.locator('.product-hero-media img:visible, .compact-product-hero img:visible').all()) {
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const headingBox = await heading.boundingBox();
    expect(headingBox!.x).toBeGreaterThanOrEqual(0);
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    if (['/design', '/google-ads-banner'].includes(route) && testInfo.project.name === 'mobile') {
      const hero = page.getByTestId('mobile-banner-hero');
      const photo = hero.locator('img');
      await expect(photo).toHaveCSS('object-fit', 'contain');
      await expect(hero).toContainText('Shipping date');
      await expect(hero).toContainText('Delivery date');
      await expect(hero.locator('[data-hero-delivery-status]')).toHaveAttribute('data-variant', 'featured');
      await expect(page.locator('#order-builder')).not.toContainText('20% off your first order');
    }
    const compact = page.locator('.compact-product-hero:visible');
    if (await compact.count()) {
      const review = compact.getByTestId('google-reviews');
      const bar = page.getByTestId('mobile-subtotal-bar');
      await expect(review).toBeVisible();
      await expect(compact).toContainText('Shipping date');
      await expect(compact).toContainText('Delivery date');
      await expect.poll(async () => {
        const reviewBox = await review.boundingBox();
        const barBox = await bar.count() ? await bar.boundingBox() : null;
        return reviewBox!.y + reviewBox!.height <= (barBox?.y || page.viewportSize()!.height) + 1;
      }).toBe(true);
      await review.getByRole('button', { name: 'Pause Google reviews' }).click();
      await expect(review.getByRole('button', { name: 'Play Google reviews' })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('hero.png') });
    const start = page.locator('button.product-hero-cta:visible');
    if (await start.count()) {
      await start.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    }
  });
}
