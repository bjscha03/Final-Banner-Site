import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pageCases = [
  { path: '/vinyl-banners/louisville-ky/', product: 'banner', price: '$20' },
  { path: '/yard-signs/louisville-ky/', product: 'yard-signs', price: '$120' },
  { path: '/car-magnets/louisville-ky/', product: 'car-magnets', price: '$29' },
] as const;

for (const pageCase of pageCases) {
  test(`${pageCase.path} remains usable and accessible`, async ({ page }, testInfo) => {
    const hydrationErrors: string[] = [];
    page.on('pageerror', (error) => hydrationErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|did not match|validateDOMNesting/i.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });

    await page.goto(pageCase.path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText(pageCase.price, { exact: true }).first()).toBeVisible();

    const primaryCta = page.locator(`main a[href^="/design?product=${pageCase.product}"]`).first();
    await expect(primaryCta).toBeVisible();
    const ctaBox = await primaryCta.boundingBox();
    expect(ctaBox?.height || 0).toBeGreaterThanOrEqual(44);
    expect(await primaryCta.getAttribute('href')).toContain(`source_page=%2F${pageCase.path.split('/').filter(Boolean).join('%2F')}`);

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    await expect(page.locator('button a, a button')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);

    const viewportWidth = testInfo.project.use.viewport?.width || 0;
    if (viewportWidth < 1024) {
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    }

    if (viewportWidth < 768) {
      const initialBox = await primaryCta.boundingBox();
      expect(initialBox?.y || Number.MAX_SAFE_INTEGER).toBeLessThan(844);
      await page.evaluate(() => window.scrollTo(0, Math.max(900, document.body.scrollHeight / 2)));
      await expect(page.locator('div.fixed.inset-x-0.bottom-0 a').filter({ hasText: /Design|Choose/ })).toBeVisible();
    }

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const seriousViolations = accessibility.violations.filter((violation) =>
      violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(seriousViolations, JSON.stringify(seriousViolations, null, 2)).toEqual([]);
    expect(hydrationErrors).toEqual([]);
  });
}

test('product hub exposes real buying content and an indexable canonical', async ({ page }) => {
  await page.goto('/vinyl-banners/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Custom Vinyl Banners' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sizes and price examples' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://bannersonthefly.com/vinyl-banners');
});
