import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const campaignDate = '2026-12-01T17:00:00.000Z';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((fixedDate) => {
    const NativeDate = Date;
    const fixedTime = new NativeDate(fixedDate).valueOf();

    class FixedDate extends NativeDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(...(args.length ? args : [fixedTime]));
      }

      static now() {
        return fixedTime;
      }
    }

    Object.defineProperty(window, 'Date', { configurable: true, value: FixedDate });
  }, campaignDate);
});

test('holiday events campaign passes responsive creative QA', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const hero = page.locator('[data-seasonal-campaign="holiday-events-2026"]');
  await expect(hero).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1, name: 'Bring every holiday gathering into view.' })).toBeVisible();
  await expect(hero.getByRole('button', { name: /Design holiday signage/i })).toBeVisible();
  await expect(hero.getByRole('link', { name: /Explore vinyl banners/i })).toBeVisible();
  await expect(hero.locator('[data-hero-delivery-status]')).toBeVisible();

  const mobile = (testInfo.project.use.viewport?.width || 0) < 640;
  const artwork = hero.locator(`[data-seasonal-hero-art="${mobile ? 'mobile' : 'desktop'}"] img`);
  await expect(artwork).toBeVisible();
  const imageState = await artwork.evaluate((image: HTMLImageElement) => ({
    complete: image.complete,
    currentSrc: image.currentSrc,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
  expect(imageState.complete).toBe(true);
  expect(imageState.currentSrc).toContain(`seasonal-holiday-events-2026-${mobile ? 'mobile' : 'desktop'}.webp`);
  expect(imageState.naturalWidth).toBe(mobile ? 900 : 1400);
  expect(imageState.naturalHeight).toBe(mobile ? 1125 : 875);

  const merchandising = page.locator('[data-seasonal-merchandising="holiday-events-2026"]');
  await expect(merchandising).toBeVisible();
  await expect(merchandising.locator('article')).toHaveCount(3);

  const layout = await page.evaluate(() => {
    const headline = document.querySelector('[data-seasonal-campaign] h1');
    const delivery = document.querySelector('[data-seasonal-campaign] [data-hero-delivery-status]');
    const heroBox = document.querySelector('[data-seasonal-campaign]')?.getBoundingClientRect();
    const headlineBox = headline?.getBoundingClientRect();
    const deliveryBox = delivery?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headlineContained: Boolean(heroBox && headlineBox && headlineBox.top >= heroBox.top && headlineBox.bottom <= heroBox.bottom),
      deliveryContained: Boolean(heroBox && deliveryBox && deliveryBox.top >= heroBox.top && deliveryBox.bottom <= heroBox.bottom),
    };
  });
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.headlineContained).toBe(true);
  expect(layout.deliveryContained).toBe(true);

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const seriousViolations = accessibility.violations.filter((violation) =>
    violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(seriousViolations, JSON.stringify(seriousViolations, null, 2)).toEqual([]);
  expect(pageErrors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(`holiday-events-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
