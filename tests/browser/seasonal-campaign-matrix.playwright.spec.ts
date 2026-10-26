import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const campaigns = [
  {
    id: 'business-refresh-2027',
    date: '2027-01-03T17:00:00.000Z',
    headline: 'Put your next move where customers can see it.',
    cta: /Refresh your business signage/i,
    asset: 'seasonal-business-refresh-2027',
    moduleHeadline: 'Make the new year visible.',
  },
  {
    id: 'mardi-gras-2027',
    date: '2027-01-04T17:00:00.000Z',
    headline: 'Bring the celebration into full view.',
    cta: /Create Mardi Gras signage/i,
    asset: 'seasonal-mardi-gras-2027',
    moduleHeadline: 'Turn celebration details into a clear invitation.',
  },
  {
    id: 'school-registration-2027',
    date: '2027-02-16T17:00:00.000Z',
    headline: 'Make every family’s next step easy to find.',
    cta: /Create enrollment signage/i,
    asset: 'seasonal-school-registration-2027',
    moduleHeadline: 'Guide families from the street to check-in.',
  },
  {
    id: 'winter-trade-shows-2027',
    date: '2027-04-02T17:00:00.000Z',
    headline: 'Make your booth readable before the aisle gets busy.',
    cta: /Prepare your booth banner/i,
    asset: 'seasonal-winter-trade-shows-2027',
    moduleHeadline: 'Plan the booth before the aisle fills.',
  },
] as const;

for (const campaign of campaigns) {
  test(`${campaign.id} passes responsive creative QA`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

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
    }, campaign.date);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const hero = page.locator(`[data-seasonal-campaign="${campaign.id}"]`);
    await expect(hero).toBeVisible();
    await expect(hero.getByRole('heading', { level: 1, name: campaign.headline })).toBeVisible();
    await expect(hero.getByRole('button', { name: campaign.cta })).toBeVisible();
    await expect(hero.getByRole('link', { name: /Design your banner|Shop yard signs/i })).toBeVisible();
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
    expect(imageState.currentSrc).toContain(`${campaign.asset}-${mobile ? 'mobile' : 'desktop'}.webp`);
    expect(imageState.naturalWidth).toBe(mobile ? 900 : 1400);
    expect(imageState.naturalHeight).toBe(mobile ? 1125 : 875);

    const merchandising = page.locator(`[data-seasonal-merchandising="${campaign.id}"]`);
    await expect(merchandising).toBeVisible();
    await expect(merchandising.getByRole('heading', { level: 2, name: campaign.moduleHeadline })).toBeVisible();
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

    await hero.screenshot({ path: testInfo.outputPath(`${campaign.id}-${testInfo.project.name}-hero.png`) });
    await merchandising.screenshot({ path: testInfo.outputPath(`${campaign.id}-${testInfo.project.name}-modules.png`) });
  });
}
