import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// City-specific landing pages are retired; the three product hubs remain live.
for (const product of ['vinyl-banners', 'yard-signs', 'car-magnets']) {
  test(`${product} city pages are no longer published`, async ({ page }) => {
    await page.goto(`/${product}/louisville-ky/`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
}

test('product hub exposes real buying content and an indexable canonical', async ({ page }) => {
  await page.goto('/vinyl-banners/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Custom Vinyl Banners' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'See how size changes the starting point.' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://bannersonthefly.com/vinyl-banners');
});

test('mobile navigation stays usable after opening from a scrolled page', async ({ page }, testInfo) => {
  const viewportWidth = testInfo.project.use.viewport?.width || 0;
  test.skip(viewportWidth >= 1024, 'Desktop navigation does not use the mobile drawer.');

  await page.goto('/yard-signs/', { waitUntil: 'domcontentloaded' });
  const navigationTrigger = page.getByRole('button', { name: 'Open navigation menu' });
  await expect(navigationTrigger).toBeVisible();
  const scrollBefore = await page.evaluate(() => {
    window.scrollTo(0, 650);
    return window.scrollY;
  });
  expect(scrollBefore).toBeGreaterThan(0);
  await navigationTrigger.click();
  await expect(page.locator('[data-mobile-navigation]')).toBeVisible();
  const closeButton = page.getByRole('button', { name: 'Close navigation menu' });
  await expect(closeButton).toBeVisible();
  const locked = await page.evaluate(() => ({
    bodyPosition: document.body.style.position,
    bodyOverflow: document.body.style.overflow,
    bodyTop: document.body.style.top,
    htmlOverflow: document.documentElement.style.overflow,
    scrollY: window.scrollY,
  }));
  expect(locked.bodyPosition).not.toBe('fixed');
  expect(locked.bodyOverflow).toBe('');
  expect(locked.bodyTop).toBe('');
  expect(locked.htmlOverflow).toBe('');
  expect(locked.scrollY).toBe(scrollBefore);
  await expect(page.locator('[data-mobile-navigation-backdrop]')).toBeVisible();

  const closeBox = await closeButton.boundingBox();
  expect(closeBox).not.toBeNull();
  expect(closeBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((closeBox?.y ?? Number.POSITIVE_INFINITY) + (closeBox?.height ?? 0)).toBeLessThanOrEqual(
    testInfo.project.use.viewport?.height || Number.POSITIVE_INFINITY,
  );

  const drawer = page.locator('[data-mobile-navigation]');
  const drawerMetrics = await drawer.evaluate((element) => ({
    canScroll: element.scrollHeight > element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(['auto', 'scroll']).toContain(drawerMetrics.overflowY);
  if (drawerMetrics.canScroll) {
    await drawer.evaluate((element) => { element.scrollTop = 120; });
    expect(await drawer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  } else {
    await expect(drawer.getByRole('link', { name: 'Contact' })).toBeVisible();
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  await closeButton.click();
  await expect(page.locator('[data-mobile-navigation]')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test('yard-sign hub presents one fixed format without multi-size mockups', async ({ page }) => {
  await page.goto('/yard-signs/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Custom Yard Signs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One 24 × 18-inch size. Clear pricing choices.' })).toBeVisible();
  await expect(page.locator('[data-yard-sign-fixed-offer]')).toHaveCount(1);
  await expect(page.locator('[data-size-snapshot]')).toHaveCount(0);
  await expect(page).toHaveTitle(/24×18 Size, Options & Pricing/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('campaign product cards keep every full mockup inside a responsive stage', async ({ page }) => {
  await page.goto('/political-signs', { waitUntil: 'domcontentloaded' });
  const stages = page.locator('#choose-product [data-selector-product-stage]');
  await expect(stages).toHaveCount(3);

  const states = await stages.evaluateAll((elements) => elements.map((stage) => {
    const stageRect = stage.getBoundingClientRect();
    const subject = stage.querySelector<HTMLElement>('[data-selector-product-subject]');
    const image = stage.querySelector<HTMLImageElement>('[data-product-visual-image]');
    const target = subject || image;
    if (!target) throw new Error('Campaign product stage has no visible product.');
    const targetRect = target.getBoundingClientRect();
    return {
      stageInsideCard: stageRect.width > 0 && stageRect.height > 0,
      targetInsideStage:
        targetRect.left >= stageRect.left - 1
        && targetRect.right <= stageRect.right + 1
        && targetRect.top >= stageRect.top - 1
        && targetRect.bottom <= stageRect.bottom + 1,
      objectFit: image ? getComputedStyle(image).objectFit : null,
    };
  }));
  expect(states).toHaveLength(3);
  for (const state of states) {
    expect(state.stageInsideCard).toBe(true);
    expect(state.targetInsideStage).toBe(true);
    if (state.objectFit) expect(state.objectFit).toBe('contain');
  }
});

test('size comparison diagrams never exceed their bounded stages', async ({ page }) => {
  await page.goto('/vinyl-banners/', { waitUntil: 'domcontentloaded' });
  const stages = page.locator('[data-size-snapshot-stage]');
  await expect(stages).toHaveCount(3);
  const states = await stages.evaluateAll((elements) => elements.map((stage) => {
    const subject = stage.querySelector<HTMLElement>('[data-size-snapshot-subject]');
    if (!subject) throw new Error('Size snapshot subject is missing.');
    const stageRect = stage.getBoundingClientRect();
    const subjectRect = subject.getBoundingClientRect();
    return {
      left: subjectRect.left - stageRect.left,
      right: stageRect.right - subjectRect.right,
      top: subjectRect.top - stageRect.top,
      bottom: stageRect.bottom - subjectRect.bottom,
    };
  }));
  for (const state of states) {
    expect(Math.min(state.left, state.right, state.top, state.bottom)).toBeGreaterThanOrEqual(8);
  }
  await expect(page.locator('[data-size-snapshot-hardware="grommet"]')).toHaveCount(12);
  await expect(page.locator('[data-shipping-included]')).toHaveCount(3);

  await page.goto('/car-magnets/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-size-snapshot-product="car-magnets"]')).toHaveCount(5);
  await expect(page.locator('[data-size-snapshot-hardware="grommet"]')).toHaveCount(0);
  await expect(page.locator('[data-shipping-included]')).toHaveCount(5);
});

test('footer uses the brand mark and blog exposes one featured label', async ({ page }) => {
  await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Featured article', { exact: true })).toHaveCount(1);

  const footer = page.locator('footer');
  await expect(footer.locator('img[alt="Banners On The Fly"]')).toBeVisible();
  await expect(footer.locator('h3')).toHaveCount(0);
  await expect(footer.getByText('Banners On The Fly', { exact: true })).toHaveCount(0);
});
