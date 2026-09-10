import { expect, test } from '@playwright/test';

const cartItem = {
  id: 'short-viewport-banner',
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'every-2-3ft',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 8,
  unit_price_cents: 3600,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 3600,
  created_at: '2026-08-06T14:00:00.000Z',
};

test('cart item actions and checkout remain fully reachable in a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 462, height: 423 });
  await page.clock.setFixedTime(new Date('2026-08-07T14:00:00.000Z'));
  await page.addInitScript((item) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('cart-storage', JSON.stringify({
      state: { items: [item], _cartOwnerId: null },
      version: 0,
    }));
  }, cartItem);

  await page.route('**/.netlify/functions/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/cart-load') ? { cartData: [cartItem] } : { success: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Shopping cart' }).first().click();

  const cart = page.getByRole('dialog', { name: 'Shopping cart' });
  const itemScroller = cart.locator('.cart-modal__content');
  const footer = cart.locator('.cart-modal__footer');
  const removeButton = cart.getByRole('button', { name: 'Remove from cart' });
  const checkoutButton = cart.getByRole('button', { name: 'Proceed to Checkout' });

  await expect(cart).toBeVisible();
  await itemScroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(removeButton).toBeInViewport();

  const [panelBox, itemScrollerBox, removeBox] = await Promise.all([
    cart.locator('.cart-modal__panel').boundingBox(),
    itemScroller.boundingBox(),
    removeButton.boundingBox(),
  ]);
  expect(panelBox).not.toBeNull();
  expect(itemScrollerBox).not.toBeNull();
  expect(removeBox).not.toBeNull();
  expect(removeBox!.y + removeBox!.height).toBeLessThanOrEqual(
    itemScrollerBox!.y + itemScrollerBox!.height + 1,
  );
  expect(itemScrollerBox!.y + itemScrollerBox!.height).toBeLessThanOrEqual(
    panelBox!.y + panelBox!.height + 1,
  );

  await footer.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(checkoutButton).toBeInViewport();

  const checkoutBox = await checkoutButton.boundingBox();
  expect(checkoutBox).not.toBeNull();
  expect(checkoutBox!.y + checkoutBox!.height).toBeLessThanOrEqual(
    panelBox!.y + panelBox!.height + 1,
  );
});
