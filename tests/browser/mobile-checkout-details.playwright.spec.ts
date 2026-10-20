import { expect, test } from '@playwright/test';
import { CHECKOUT_ITEM, installCheckoutHarness } from './checkoutHarness';

test('contact and delivery details are visible before either payment method', async ({ page }) => {
  await installCheckoutHarness(page);
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });

  const checkoutHeader = page.locator('[data-checkout-header]');
  const contactHeading = page.getByRole('heading', { name: 'Contact', exact: true });
  const firstName = page.getByLabel(/First Name/);
  const cardButton = page.getByRole('button', { name: 'Pay with Debit or Credit Card' });

  await expect(checkoutHeader).toBeVisible();
  await expect(checkoutHeader).toContainText('Secure checkout');
  await expect(checkoutHeader.getByRole('img', { name: 'Banners On The Fly', exact: true })).toBeVisible();
  await expect(checkoutHeader.getByRole('button', { name: 'Open navigation menu' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
  await expect(page.getByLabel('Email address for newsletter')).toHaveCount(0);
  await expect(contactHeading).toBeVisible({ timeout: 20_000 });
  await expect(firstName).toBeVisible();
  await expect(firstName).toHaveAttribute('autocomplete', 'given-name');
  await expect(cardButton).toHaveAttribute('aria-expanded', 'false');
  expect(await firstName.evaluate((input) => input.closest('#paypal-inline-card-fields'))).toBeNull();

  const firstNameBox = await firstName.boundingBox();
  expect(firstNameBox).not.toBeNull();
  expect(firstNameBox!.height).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 1024) < 1024 ? 44 : 40);

  if ((page.viewportSize()?.width ?? 1024) < 640) {
    const fontSize = await firstName.evaluate((input) => getComputedStyle(input).fontSize);
    expect(Number.parseFloat(fontSize)).toBeGreaterThanOrEqual(16);
  }

  if ((page.viewportSize()?.width ?? 1024) < 1024) {
    const artworkSummary = page.getByTestId('checkout-artwork-summary');
    await expect(artworkSummary).toBeVisible();
    await expect(artworkSummary.locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(1);
    const paymentBox = await contactHeading.boundingBox();
    const orderSummaryBox = await artworkSummary.boundingBox();
    expect(paymentBox).not.toBeNull();
    expect(orderSummaryBox).not.toBeNull();
    expect(orderSummaryBox!.y).toBeLessThan(paymentBox!.y);
    await expect(artworkSummary.getByRole('button', { name: 'Edit order', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  const shippingSame = page.getByLabel('Billing address is the same as shipping');
  await expect(shippingSame).toBeChecked();
  await shippingSame.uncheck();
  await expect(page.getByLabel(/Shipping Name/)).toBeVisible();

  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth + 1
  ))).toBe(true);
});

test('order summary above payment enlarges artwork directly, and keeps all items after editing', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1024) >= 1024, 'Mobile summary only');
  const second = { ...CHECKOUT_ITEM, id: 'second-checkout-banner', width_in: 72 };
  const { paymentEndpointRequests } = await installCheckoutHarness(page, [CHECKOUT_ITEM, second]);
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
  const summary = page.getByTestId('checkout-artwork-summary');
  await expect(summary.locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await summary.getByRole('button', { name: /Enlarge artwork for item 1/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await summary.getByRole('button', { name: 'Edit order', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toContainText('Review your order');
  await editor.getByRole('button', { name: /Increase quantity/ }).first().click();
  await editor.getByRole('button', { name: 'Back to checkout', exact: true }).click();
  await expect(summary.locator('[data-checkout-artwork-item="mobile-checkout-banner"]')).toContainText('Qty 2');
  await expect(summary.locator('[data-preview-ready="true"], [data-realistic-artwork-ready="true"]')).toHaveCount(2);
  expect(paymentEndpointRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('debit or credit card disclosure opens before required contact details are complete', async ({ page }) => {
  const { paymentEndpointRequests } = await installCheckoutHarness(page);
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });

  const firstName = page.getByLabel(/First Name/);
  const cardButton = page.getByRole('button', { name: 'Pay with Debit or Credit Card' });

  await expect(firstName).toBeVisible({ timeout: 20_000 });
  await expect(firstName).toHaveValue('');
  await expect(cardButton).toBeEnabled();
  await expect(cardButton).toHaveAttribute('aria-expanded', 'false');

  await cardButton.click();

  const cardFields = page.locator('#paypal-inline-card-fields');
  await expect(cardButton).toHaveAttribute('aria-expanded', 'true');
  await expect(cardFields).toHaveCount(1);
  await expect(cardFields).toBeVisible();
  await expect(cardFields.locator('[data-paypal-card-field]')).toHaveCount(4);
  expect(paymentEndpointRequests).toEqual([]);
});
