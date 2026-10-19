import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { CHECKOUT_ITEM, installCheckoutHarness } from './checkoutHarness';

async function expectCardLogos(page: import('@playwright/test').Page) {
  const cards = page.getByRole('group', { name: 'Accepted cards', exact: true });
  await expect(cards).toBeVisible();
  for (const name of ['Visa', 'Mastercard', 'American Express', 'Discover']) {
    const logo = cards.getByRole('img', { name, exact: true });
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
}

test.beforeEach(async ({ page }) => {
  await installCheckoutHarness(page, [{ ...CHECKOUT_ITEM, grommets: 'every-2-3ft', width_in: 72, height_in: 36, area_sqft: 18, unit_price_cents: 9000, line_total_cents: 9000 }]);
  await page.route('**/.netlify/functions/stripe-config', route => route.fulfill({ json: { enabled: true, environment: 'test', publishableKey: 'pk_test_visual_fixture' } }));
  await page.route('**/.netlify/functions/validate-discount-code', route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: { valid: true, discount: { id: 'fixture', code: input.code, discountPercentage: input.code === 'REVIEW25' ? 25 : 20, discountAmountCents: null, expiresAt: '2099-12-31T23:59:59Z' } } });
  });
  // Lettered, edge-marked artwork makes fit/cropping mistakes visible.
  const art = await sharp(Buffer.from('<svg width="720" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="360" fill="#0b2540"/><rect x="9" y="9" width="702" height="342" fill="none" stroke="#ffffff" stroke-width="4"/><text x="360" y="150" text-anchor="middle" fill="white" font-family="sans-serif" font-size="52">YOUR NEXT BIG THING.</text><text x="360" y="220" text-anchor="middle" fill="#ff7a25" font-family="sans-serif" font-size="30">PRINTED. DELIVERED. READY.</text></svg>')).png().toBuffer();
  await page.route('https://assets.example.test/**', route => route.fulfill({ contentType: 'image/png', body: art }));
});

test('approved responsive layout keeps artwork and authoritative totals visible', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Let’s make it official.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apple Pay test fixture' })).toBeVisible();
  const summary = page.getByTestId('checkout-artwork-summary');
  await expect(summary.locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(1);
  await expect(summary.locator('[data-realistic-scene]')).toHaveCount(1);
  await expect(summary.locator('[data-realistic-grommet]')).toHaveCount(10);
  const total = page.getByTestId('checkout-order-totals');
  await expect(total).toHaveCount(1); await expect(total).toContainText('$76.32');
  const pay = page.getByRole('button', { name: 'Pay $76.32', exact: true });
  await expect(pay).toBeEnabled();
  const form = page.locator('.checkout-payment-panel');
  const formBox = await form.boundingBox(); const summaryBox = await summary.boundingBox();
  const walletBoxes = [];
  for (const name of ['Apple Pay test fixture', 'Google Pay test fixture', 'PayPal']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(140);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(formBox!.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
    walletBoxes.push(box);
  }
  if ((page.viewportSize()?.width || 0) < 768) {
    expect(walletBoxes[1].y).toBeGreaterThanOrEqual(walletBoxes[0].y + walletBoxes[0].height);
    expect(walletBoxes[2].y).toBeGreaterThanOrEqual(walletBoxes[1].y + walletBoxes[1].height);
    for (const box of walletBoxes) expect(box.width).toBeGreaterThanOrEqual(formBox!.width - 1);
  }
  await expectCardLogos(page);
  if ((page.viewportSize()?.width || 0) >= 1024) {
    expect(summaryBox!.x).toBeGreaterThan(formBox!.x + formBox!.width);
  } else {
    expect(summaryBox!.y + summaryBox!.height).toBeLessThan(formBox!.y);
    await expect(page.locator('.checkout-arrival-total')).toContainText('$76.32');
    expect(await total.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('.checkout-pay-button')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('checkout-arrival.png'), fullPage: true });
  await page.screenshot({ path: info.outputPath('checkout-first-screen.png') });
  await page.locator('.checkout-express-options').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('checkout-wallets-and-cards.png') });
  await pay.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('checkout-payment.png') });
  await page.getByRole('button', { name: 'Have a promo code?', exact: true }).click();
  await page.locator('#discount-code').fill('REVIEW25');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(total).toContainText('$71.55');
  await expect(page.getByRole('button', { name: 'Pay $71.55', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('single-wallet and card-only devices retain clear payment choices', async ({ page }) => {
  for (const mode of ['single', 'none']) {
    await page.goto(`/checkout?walletFixture=${mode}`);
    const apple = page.getByRole('button', { name: 'Apple Pay test fixture', exact: true });
    if (mode === 'single') await expect(apple).toBeVisible();
    else await expect(apple).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Google Pay test fixture', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'PayPal', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay $76.32', exact: true })).toBeEnabled();
    await expectCardLogos(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('validation, address editing, provider switching and order editing remain safe', async ({ page }) => {
  const submitted: string[] = [];
  page.on('request', request => { if (/\/(create-order|stripe-create-payment-intent|paypal-create-order|paypal-capture-minimal)(?:\?|$)/.test(request.url())) submitted.push(request.url()); });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $76.32', exact: true }).click();
  await expect(page.locator('#stripe-checkout-error')).toContainText('Enter your email address');
  await page.locator('#stripe-email').fill('checkout-qa@example.com');
  await page.locator('#stripe-firstName').fill('Checkout');
  await page.locator('#stripe-street').fill('123 Test Street');
  const same = page.getByLabel('Billing address is the same as shipping');
  await same.uncheck(); await expect(page.locator('#stripe-shippingStreet')).toBeVisible(); await same.check();
  await page.getByRole('button', { name: 'PayPal', exact: true }).click();
  await expect(page.locator('#checkout-email')).toHaveValue('checkout-qa@example.com');
  await page.getByRole('button', { name: 'Card & wallets' }).click();
  await expect(page.locator('#stripe-street')).toHaveValue('123 Test Street');
  await page.getByRole('button', { name: 'Edit order', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Increase quantity/ }).first().click();
  await page.getByRole('button', { name: 'Back to checkout', exact: true }).click();
  await expect(page.getByTestId('checkout-artwork-summary')).toContainText('Qty 2');
  await expect(page.getByTestId('checkout-artwork-summary').locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(1);
  const artwork = page.getByTestId('checkout-artwork-summary');
  await expect(artwork.locator('[data-realistic-scene]')).toHaveCount(1);
  await artwork.getByRole('button', { name: 'Print layout', exact: true }).click();
  await expect(artwork.locator('[data-realistic-scene]')).toHaveCount(0);
  await expect(artwork.locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(1);
  await artwork.getByRole('button', { name: 'Realistic preview', exact: true }).click();
  await expect(artwork.locator('[data-realistic-scene]')).toHaveCount(1);
  await expect(page.locator('#stripe-email')).toHaveValue('checkout-qa@example.com');
  expect(submitted).toEqual([]);
});

test('deploy preview matches the wallet and card layout without accepting payment data', async ({ page }, info) => {
  await page.route('**/.netlify/functions/stripe-config', route => route.fulfill({ json: { enabled: false } }));
  const providerRequests: string[] = [];
  page.on('request', request => {
    if (/paypal\.com\/sdk|js\.stripe\.com|\/(stripe-create-payment-intent|paypal-create-order|paypal-capture-minimal)(?:\?|$)/.test(request.url())) providerRequests.push(request.url());
  });
  await page.goto('/checkout?checkoutVisualMode=deploy-preview');
  await expect(page.getByRole('button', { name: 'Apple Pay — preview only', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'PayPal — preview only', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible();
  await expect(page.locator('#checkout-email')).toHaveAttribute('placeholder', 'you@example.com');
  await expect(page.locator('.checkout-fallback-methods')).toHaveCount(0);
  await expect(page.locator('.checkout-preview-card input')).toHaveCount(0);
  await expectCardLogos(page);
  const pay = page.getByRole('button', { name: 'Place test order · $76.32', exact: true });
  await expect(pay).toBeEnabled();
  await expect(page.getByTestId('checkout-artwork-summary').locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(1);
  await expect(page.getByTestId('checkout-order-totals')).toContainText('$76.32');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('deploy-preview-checkout.png'), fullPage: true });
  await page.screenshot({ path: info.outputPath('deploy-preview-first-screen.png') });
  let testOrder: Record<string, unknown> | undefined;
  await page.route('**/.netlify/functions/create-order', route => {
    testOrder = route.request().postDataJSON();
    return route.fulfill({ status: 403, json: { error: 'Preview order requires admin access.' } });
  });
  await pay.click();
  await expect(page.getByText('Preview order requires admin access.', { exact: true }).first()).toBeVisible();
  expect(testOrder).toMatchObject({ checkout_mode: 'admin_deploy_preview_test', payment_method: 'admin_deploy_preview_test', total_cents: 7632 });
  expect(providerRequests).toEqual([]);
});
