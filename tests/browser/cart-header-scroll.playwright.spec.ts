import { expect, test, type Page } from '@playwright/test';

const TEST_CART_ITEM = {
  id: 'playwright-cart-magnet',
  product_type: 'car_magnet',
  width_in: 18,
  height_in: 12,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  pole_pockets: 'none',
  rounded_corners: 'none',
  rope_feet: 0,
  area_sqft: 1.5,
  unit_price_cents: 2900,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 2900,
  created_at: '2026-08-06T12:00:00.000Z',
};

const seedNonemptyGuestCart = async (page: Page) => {
  await page.addInitScript((item) => {
    localStorage.removeItem('banners_current_user');
    localStorage.removeItem('cart_owner_user_id');
    localStorage.setItem('cart-storage', JSON.stringify({
      state: { items: [item], _cartOwnerId: null },
      version: 0,
    }));
  }, TEST_CART_ITEM);
};

const mockCartLoad = async (page: Page) => {
  await page.route('**/.netlify/functions/cart-load*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cartData: [TEST_CART_ITEM] }),
    });
  });
};

const readPageState = async (page: Page) => page.evaluate(() => {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (!header) throw new Error('The active storefront header is missing.');
  const headerRect = header.getBoundingClientRect();

  return {
    scrollY: window.scrollY,
    headerTop: headerRect.top,
    headerBottom: headerRect.bottom,
    // A viewport-root portal makes #root inert, so the header is effectively
    // inert through its ancestor even though the attribute is not duplicated.
    headerInert: Boolean(header.closest('[inert]')),
    htmlCartClass: document.documentElement.classList.contains('cart-modal-open'),
    bodyCartClass: document.body.classList.contains('cart-modal-open'),
    htmlInlineOverflow: document.documentElement.style.overflow,
    bodyInlineOverflow: document.body.style.overflow,
    bodyInlinePosition: document.body.style.position,
  };
});

const scrollStorefrontAwayFromTop = async (page: Page) => {
  const header = page.locator('[data-site-header]');
  await expect(header).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollHeight - window.innerHeight
  ))).toBeGreaterThan(0);

  await page.evaluate(() => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    const maximumScroll = Math.max(1, root.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(700, maximumScroll));
    root.style.scrollBehavior = previousScrollBehavior;
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
};

const clickStickyHeaderButtonWithoutAutoScroll = async (page: Page, name: string) => {
  const button = page.getByRole('button', { name }).first();
  await button.evaluate((element: HTMLElement) => element.focus({ preventScroll: true }));
  const box = await button.boundingBox();
  if (!box) throw new Error(`The ${name} button has no visible bounds.`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return button;
};

const clickStickyCartWithoutAutoScroll = (page: Page) => (
  clickStickyHeaderButtonWithoutAutoScroll(page, 'Shopping cart')
);

const expectDrawerFlushWithHeader = async (page: Page) => {
  const state = await readPageState(page);
  const cart = page.getByRole('dialog', { name: 'Shopping cart' });
  const cartRect = await cart.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight };
  });
  expect(Math.abs(cartRect.top - state.headerBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(cartRect.bottom - cartRect.viewportHeight)).toBeLessThanOrEqual(1);
};

test('scrolled account menu stays onscreen without locking the storefront', async ({ page }) => {
  await page.goto('/design?product=banner', { waitUntil: 'domcontentloaded' });
  await scrollStorefrontAwayFromTop(page);

  const beforeOpen = await readPageState(page);
  const accountButton = await clickStickyHeaderButtonWithoutAutoScroll(page, 'Account');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeVisible();

  const menuRect = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuRect).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(menuRect?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((menuRect?.y ?? 0) + (menuRect?.height ?? Number.POSITIVE_INFINITY))
    .toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  expect(menuRect?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((menuRect?.x ?? 0) + (menuRect?.width ?? Number.POSITIVE_INFINITY))
    .toBeLessThanOrEqual((viewport?.width ?? 0) + 1);

  const openState = await page.evaluate(() => ({
    scrollY: window.scrollY,
    bodyPosition: window.getComputedStyle(document.body).position,
    bodyPointerEvents: window.getComputedStyle(document.body).pointerEvents,
    bodyOverflow: window.getComputedStyle(document.body).overflow,
    bodyInlineStyle: document.body.getAttribute('style') || '',
    radixScrollLock: document.body.hasAttribute('data-scroll-locked'),
  }));
  expect(openState.scrollY).toBe(beforeOpen.scrollY);
  expect(openState.bodyPosition).toBe('static');
  expect(openState.bodyPointerEvents).not.toBe('none');
  expect(openState.bodyOverflow).not.toBe('hidden');
  expect(openState.bodyInlineStyle).not.toContain('pointer-events: none');
  expect(openState.radixScrollLock).toBe(false);

  await page.mouse.move(
    Math.max(1, Math.floor((viewport?.width ?? 800) / 2)),
    Math.max(1, Math.floor((viewport?.height ?? 700) / 2)),
  );
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeOpen.scrollY);

  if (await menu.count()) await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(accountButton).toBeFocused();
});

test('nonempty scrolled cart is contained, accessible, and preserves page state through close paths', async ({ page }, testInfo) => {
  await seedNonemptyGuestCart(page);
  await mockCartLoad(page);
  await page.goto('/car-magnets/', { waitUntil: 'domcontentloaded' });
  await scrollStorefrontAwayFromTop(page);

  const beforeOpen = await readPageState(page);
  expect(beforeOpen.scrollY).toBeGreaterThan(0);
  expect(Math.abs(beforeOpen.headerTop)).toBeLessThanOrEqual(1);

  if ((testInfo.project.use.viewport?.width ?? 0) < 1024) {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.locator('[data-mobile-navigation]')).toBeVisible();
    const navigationCartButton = await clickStickyCartWithoutAutoScroll(page);
    await expect(page.locator('[data-mobile-navigation]')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Shopping cart' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navigationCartButton).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(beforeOpen.scrollY);
  }

  const cartButton = await clickStickyCartWithoutAutoScroll(page);
  const cart = page.getByRole('dialog', { name: 'Shopping cart' });
  const closeButton = cart.getByRole('button', { name: 'Close cart' });
  const checkoutButton = cart.getByRole('button', { name: 'Proceed to Checkout' });
  await expect(cart).toBeVisible();
  await expect(cart).toHaveAttribute('aria-modal', 'true');
  expect(await cart.evaluate((element) => element.parentElement === document.body)).toBe(true);
  await expect(cart.getByText('Shopping Cart (1)', { exact: true })).toBeVisible();
  await expect(closeButton).toBeFocused();
  await expectDrawerFlushWithHeader(page);

  const whileOpen = await readPageState(page);
  expect(whileOpen.scrollY).toBe(beforeOpen.scrollY);
  expect(Math.abs(whileOpen.headerTop)).toBeLessThanOrEqual(1);
  expect(whileOpen.headerInert).toBe(true);
  expect(whileOpen.htmlCartClass).toBe(false);
  expect(whileOpen.bodyCartClass).toBe(false);
  expect(whileOpen.htmlInlineOverflow).toBe('');
  expect(whileOpen.bodyInlineOverflow).toBe('');
  expect(whileOpen.bodyInlinePosition).toBe('');

  // The former compact-mobile regression hid the footer actions. The real
  // nonempty cart must be able to scroll its checkout CTA fully into view.
  await checkoutButton.scrollIntoViewIfNeeded();
  await expect(checkoutButton).toBeVisible();
  const checkoutRect = await checkoutButton.boundingBox();
  expect(checkoutRect).not.toBeNull();
  expect(checkoutRect?.y ?? -1).toBeGreaterThanOrEqual(whileOpen.headerBottom - 1);
  expect((checkoutRect?.y ?? Number.POSITIVE_INFINITY) + (checkoutRect?.height ?? 0))
    .toBeLessThanOrEqual((testInfo.project.use.viewport?.height ?? Number.POSITIVE_INFINITY) + 1);

  // Focus cannot escape into the visually obscured page in either direction.
  await closeButton.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await cart.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await checkoutButton.focus();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  // Wheel and document-level keyboard scrolling are contained without using
  // html/body overflow or fixed-position locks that displace sticky headers.
  const cartHeading = cart.getByRole('heading', { name: /Shopping Cart/ });
  const headingBox = await cartHeading.boundingBox();
  if (!headingBox) throw new Error('Cart heading has no visible bounds.');
  await page.mouse.move(headingBox.x + headingBox.width / 2, headingBox.y + headingBox.height / 2);
  await page.mouse.wheel(0, 600);
  await closeButton.focus();
  await page.keyboard.press('PageDown');
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeOpen.scrollY);

  await page.keyboard.press('Escape');
  await expect(cart).toHaveCount(0);
  await expect(cartButton).toBeFocused();

  const afterEscape = await readPageState(page);
  expect(afterEscape.scrollY).toBe(beforeOpen.scrollY);
  expect(Math.abs(afterEscape.headerTop)).toBeLessThanOrEqual(1);
  expect(afterEscape.headerInert).toBe(false);

  await clickStickyCartWithoutAutoScroll(page);
  await expect(cart).toBeVisible();
  await expect(closeButton).toBeFocused();
  await closeButton.click();
  await expect(cart).toHaveCount(0);
  await expect(cartButton).toBeFocused();

  // A full-width mobile panel intentionally covers the backdrop. At wider
  // widths, exercise the real outside-click close path as well.
  const viewportWidth = testInfo.project.use.viewport?.width ?? 0;
  if (viewportWidth > 448) {
    await clickStickyCartWithoutAutoScroll(page);
    await expect(cart).toBeVisible();
    const backdrop = cart.locator('[data-cart-backdrop]');
    const backdropBox = await backdrop.boundingBox();
    if (!backdropBox) throw new Error('Cart backdrop has no visible bounds.');
    await page.mouse.click(backdropBox.x + 8, backdropBox.y + Math.min(48, backdropBox.height / 2));
    await expect(cart).toHaveCount(0);
    await expect(cartButton).toBeFocused();
  }

  const afterAllClosePaths = await readPageState(page);
  expect(afterAllClosePaths.scrollY).toBe(beforeOpen.scrollY);
  expect(Math.abs(afterAllClosePaths.headerTop)).toBeLessThanOrEqual(1);
  expect(afterAllClosePaths.headerInert).toBe(false);
});

test('Google Ads cart measures its compact header instead of inheriting storefront offsets', async ({ page }) => {
  await seedNonemptyGuestCart(page);
  await mockCartLoad(page);
  await page.goto('/google-ads-banner?product=banner', { waitUntil: 'domcontentloaded' });
  await scrollStorefrontAwayFromTop(page);

  const beforeOpen = await readPageState(page);
  expect(beforeOpen.scrollY).toBeGreaterThan(0);
  expect(Math.abs(beforeOpen.headerTop)).toBeLessThanOrEqual(1);

  const cartButton = await clickStickyCartWithoutAutoScroll(page);
  const cart = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(cart).toBeVisible();
  await expectDrawerFlushWithHeader(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeOpen.scrollY);

  await page.keyboard.press('Escape');
  await expect(cart).toHaveCount(0);
  await expect(cartButton).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeOpen.scrollY);
});

test('a rejected lazy route chunk renders the branded recovery boundary instead of a blank page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    sessionStorage.setItem('botf_chunk_recovery_at', String(Date.now()));
  });

  let shippingChunkAborted = false;
  await page.route(/\/assets\/Shipping-[^/]+\.js(?:\?.*)?$/, async (route) => {
    shippingChunkAborted = true;
    await route.abort('failed');
  });

  await page.locator('a[href="/shipping"]:visible').first().click();
  await expect(page.getByRole('heading', { name: 'This page needs a quick refresh' })).toBeVisible();
  const reloadButton = page.getByRole('button', { name: 'Reload page' });
  await expect(reloadButton).toBeVisible();
  expect(shippingChunkAborted).toBe(true);

  // A manual recovery must bypass the automatic reload guard and cached HTML,
  // then return the customer to the same route with the current chunk map.
  await page.unroute(/\/assets\/Shipping-[^/]+\.js(?:\?.*)?$/);
  await reloadButton.click();
  await expect(page).toHaveURL(/\/shipping\?[^#]*_botf_refresh=\d+/);
  await expect(page.getByRole('heading', { name: 'This page needs a quick refresh' })).toHaveCount(0);
});
