import { expect, test } from '@playwright/test';

const routes = [
  '/design', '/google-ads-banner', '/large-banners-fast',
  '/design?product=yard-signs', '/design?product=car-magnets',
  '/yard-signs', '/car-magnets', '/fall-festival-banners',
  '/political-signs', '/blog', '/about', '/shipping', '/custom-quote',
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
    for (const photo of await page.locator('.product-hero-media img:visible, [data-testid="mobile-banner-hero"] img:visible').all()) {
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const headingBox = await heading.boundingBox();
    expect(headingBox!.x).toBeGreaterThanOrEqual(0);
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    if (route === '/google-ads-banner' && testInfo.project.name === 'mobile') {
      expect((await page.getByTestId('mobile-banner-hero').boundingBox())!.height).toBeLessThan(440);
      await expect(page.getByTestId('mobile-banner-hero')).toContainText('Estimated delivery');
    }
    await page.screenshot({ path: testInfo.outputPath('hero.png') });
    const start = page.locator('button.product-hero-cta:visible');
    if (await start.count()) {
      await start.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    }
  });
}
