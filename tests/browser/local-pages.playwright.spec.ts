import { expect, test } from '@playwright/test';

// Retired city pages stay unpublished; former product hubs open the active designer.
for (const product of ['vinyl-banners', 'yard-signs', 'car-magnets']) {
  test(`${product} city pages are no longer published`, async ({ page }) => {
    await page.goto(`/${product}/louisville-ky/`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
}

for (const [path, product, headline] of [
  ['vinyl-banners', 'banner', 'Build Your Banner'],
  ['yard-signs', 'yard-signs', 'Build Your Yard Sign Order'],
  ['car-magnets', 'car-magnets', 'Design Your Custom Car Magnets'],
]) {
  test(`${path} opens its active product designer`, async ({ page }) => {
    await page.goto(`/${path}/`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/design\\?product=${product}`));
    await expect(page.locator('#builder-start')).toHaveText(headline);
    await expect(page.locator('#order-builder')).toBeVisible();
    // The banner landing page sets robots explicitly; the shared yard-sign and
    // car-magnet designer keeps the existing default indexing behavior.
    if (product === 'banner') {
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test('mobile navigation stays usable after opening from a scrolled page', async ({ page }, testInfo) => {
  const viewportWidth = testInfo.project.use.viewport?.width || 0;
  test.skip(viewportWidth >= 1024, 'Desktop navigation does not use the mobile drawer.');

  await page.goto('/products', { waitUntil: 'domcontentloaded' });
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

test('specialty catalog exposes every family with an indexable canonical', async ({ page }) => {
  await page.goto('/products', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Make the entire space yours.' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://bannersonthefly.com/products');
  await expect(page.locator('a[href^="/products/"]').filter({ has: page.locator('h3') })).toHaveCount(19);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('campaign product photographs load inside their responsive stages', async ({ page }) => {
  await page.goto('/political-signs', { waitUntil: 'domcontentloaded' });
  const stages = page.locator('#choose-product [data-selector-product-stage]');
  await expect(stages).toHaveCount(3);

  for (const image of await stages.locator('img').all()) await image.evaluate((img: HTMLImageElement) => img.decode());
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
    if (state.objectFit) expect(state.objectFit).toBe('cover');
  }
});

test('homepage exposes the four specialty categories alongside existing products', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const section = page.locator('[aria-labelledby="product-selection-heading"]');
  await expect(section.getByRole('heading', { name: 'Build your entire display.' })).toBeVisible();
  for (const category of ['stands', 'flags', 'events', 'signs']) {
    const link = section.locator(`a[href="/products#${category}"]`);
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link.locator('img')).toBeVisible();
    await link.locator('img').evaluate((image: HTMLImageElement) => image.decode());
    expect(await link.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth > 0)).toBe(true);
  }
  await expect(section.getByRole('heading', { name: 'Vinyl banners', exact: true })).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Yard signs', exact: true })).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Car magnets', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('footer uses the brand mark and blog exposes one featured label', async ({ page }) => {
  await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Featured guide', { exact: true })).toHaveCount(1);

  const footer = page.locator('footer');
  await expect(footer.locator('img[alt="Banners On The Fly"]')).toBeVisible();
  await expect(footer.locator('h3')).toHaveCount(0);
  await expect(footer.getByText('Banners On The Fly', { exact: true })).toHaveCount(0);
});
