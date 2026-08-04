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
    const clippedContent = await page.evaluate(() => {
      const contentSelector = 'h1,h2,h3,h4,p,a,button,label,li,dt,dd,input,textarea,select,img';
      return Array.from(document.querySelectorAll<HTMLElement>(contentSelector)).flatMap((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return [];
        let ancestor = element.parentElement;
        let intentionallyScrollable = false;
        while (ancestor && !intentionallyScrollable) {
          const ancestorOverflow = getComputedStyle(ancestor).overflowX;
          intentionallyScrollable = ancestorOverflow === 'auto' || ancestorOverflow === 'scroll';
          ancestor = ancestor.parentElement;
        }
        if (intentionallyScrollable) return [];
        const outsideViewport = rect.left < -1 || rect.right > window.innerWidth + 1;
        const internallyClipped = element.scrollWidth > element.clientWidth + 1 && style.overflowX !== 'visible';
        return outsideViewport || internallyClipped
          ? [`${element.tagName.toLowerCase()}.${element.className}: ${Math.round(rect.left)}..${Math.round(rect.right)} / ${window.innerWidth}`]
          : [];
      }).slice(0, 20);
    });
    expect(clippedContent).toEqual([]);
    await expect(page.locator('button a, a button')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);

    if (pageCase.product === 'yard-signs') {
      await expect(page.locator('[data-yard-sign-fixed-offer]')).toHaveCount(1);
      await expect(page.locator('[data-size-snapshot]')).toHaveCount(0);
      await expect(page.getByText('24″ × 18″', { exact: true })).toBeVisible();
      const mockupTextFits = await page.locator('[role="img"][aria-label*="24 by 18 inch yard sign"] span').evaluateAll((labels) =>
        labels.every((label) => label.scrollWidth <= label.clientWidth + 1),
      );
      expect(mockupTextFits).toBe(true);
    }

    const viewportWidth = testInfo.project.use.viewport?.width || 0;
    if (viewportWidth < 1024) {
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    }

    if (viewportWidth < 768) {
      const initialBox = await primaryCta.boundingBox();
      const viewportHeight = testInfo.project.use.viewport?.height || 0;
      expect((initialBox?.y || 0) + (initialBox?.height || 0)).toBeLessThanOrEqual(viewportHeight);
      await page.evaluate(() => window.scrollTo(0, Math.max(900, document.body.scrollHeight / 2)));
      await expect(page.locator('[data-mobile-sticky-cta] a').filter({ hasText: /Design|Choose/ })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.locator('[data-mobile-sticky-cta]')).toHaveCount(0);
    }

    await page.evaluate(() => window.scrollTo(0, 700));
    const headerTop = await page.locator('header').first().evaluate((header) => header.getBoundingClientRect().top);
    expect(Math.abs(headerTop)).toBeLessThanOrEqual(1);

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
  await expect(page.getByRole('heading', { name: 'See how size changes the starting point.' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://bannersonthefly.com/vinyl-banners');
});

test('mobile navigation locks the page and scrolls independently', async ({ page }, testInfo) => {
  const viewportWidth = testInfo.project.use.viewport?.width || 0;
  test.skip(viewportWidth >= 1024, 'Desktop navigation does not use the mobile drawer.');

  await page.goto('/yard-signs/', { waitUntil: 'domcontentloaded' });
  const openingScroll = await page.evaluate(() => {
    window.scrollTo(0, 650);
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Open navigation menu"]');
    if (!button) throw new Error('Mobile navigation trigger was not found.');
    const beforeClick = window.scrollY;
    button.click();
    return { beforeClick, synchronouslyAfterClick: window.scrollY };
  });
  const scrollBefore = openingScroll.beforeClick;
  expect(scrollBefore).toBeGreaterThan(0);
  expect(openingScroll.synchronouslyAfterClick).toBe(scrollBefore);
  await expect(page.locator('[data-mobile-navigation]')).toBeVisible();
  const locked = await page.evaluate(() => ({
    bodyPosition: document.body.style.position,
    bodyOverflow: document.body.style.overflow,
    bodyTop: document.body.style.top,
    htmlOverflow: document.documentElement.style.overflow,
    scrollY: window.scrollY,
  }));
  expect(locked.bodyPosition).toBe('fixed');
  expect(locked.bodyOverflow).toBe('hidden');
  expect(locked.htmlOverflow).toBe('hidden');
  expect(locked.bodyTop).toBe(`-${scrollBefore}px`);
  expect(locked.scrollY).toBe(0);

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
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole('button', { name: 'Close navigation menu' }).evaluate((button) =>
    (button as HTMLButtonElement).click(),
  );
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
