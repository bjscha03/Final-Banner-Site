import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
async function installUploadAndFunctionHarness(page: Page, scenario: string) {
  // WebKit globally intercepts multipart bodies when any page.route is active,
  // even when its URL predicate excludes the upload. Serve mocks in Vite instead.
  await page.context().addCookies([{
    name: 'compact_browser_scenario', value: scenario, url: 'http://127.0.0.1:4175',
  }]);
  return {
    artifactUrl: `http://127.0.0.1:4175/__compact-test-asset?scenario=${scenario}&kind=placement`,
  };
}

async function asymmetricArtwork(): Promise<Buffer> {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="305">
      <rect width="1080" height="305" fill="#f8fafc"/>
      <rect x="0" y="0" width="180" height="305" fill="#ef4444"/>
      <rect x="900" y="0" width="180" height="305" fill="#2563eb"/>
      <path d="M540 20 L700 285 L380 285 Z" fill="#111827"/>
      <circle cx="540" cy="152" r="52" fill="#facc15"/>
    </svg>
  `);
  return sharp(svg).png().toBuffer();
}

async function sparseArtwork(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1672,
      height: 941,
      channels: 3,
      background: '#ffffff',
    },
  }).composite([{
    input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#111827"/></svg>'),
    left: 826,
    top: 460,
  }]).png().toBuffer();
}


test('banner finishing preserves the artwork, price and cart through add-another and checkout', async ({ page }, testInfo) => {
  const artwork = await asymmetricArtwork();
  const harness = await installUploadAndFunctionHarness(page, `compact-${testInfo.project.name}`);
  await page.goto('/google-ads-banner', { waitUntil: 'domcontentloaded' });
  const mobile = (page.viewportSize()?.width ?? 1024) < 1024;
  const footer = page.getByTestId('mobile-subtotal-bar');
  const size = page.locator('#size-section');
  if (mobile) {
    await expect(footer.getByRole('button', { name: 'Add artwork', exact: true })).toBeVisible();
    await expect(footer).toContainText("6' × 3'");
    await expect(footer).toContainText('$72.00');
    await expect(footer.locator('del')).toHaveText('$90.00');
    await expect(footer).toContainText('20% off applied');
    expect((await footer.boundingBox())!.height).toBeLessThan(100);
    await expect(page.locator('#options-section')).toHaveCount(0);
    await expect(page.getByTestId('mobile-banner-hero')).toContainText('Estimated delivery');
    await expect(page.getByTestId('google-reviews')).toHaveCount(0);
    await expect(page.locator('[data-real-orders-strip]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open AI artwork help' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('landing-first-screen.png') });
    const heroBox = await page.getByTestId('mobile-banner-hero').boundingBox();
    expect(heroBox!.height).toBeLessThan(440);
    const sixByTwo = size.getByRole('button', { name: "6' × 2' — $48.00", exact: true });
    await sixByTwo.click();
    await expect(sixByTwo.locator('del')).toHaveText('$60.00');
    await expect(sixByTwo.locator('[data-banner-current-price]')).toHaveCSS('color', 'rgb(4, 120, 87)');
    await expect(sixByTwo.locator('[data-banner-dimensions]')).toHaveCSS('color', 'rgb(6, 26, 49)');
    await expect(footer.locator('[data-banner-current-price]')).toHaveText('$48.00');
    await expect(footer.locator('del')).toHaveText('$60.00');
    await size.screenshot({ path: testInfo.outputPath('mobile-size-prices.png') });
    await size.getByRole('button', { name: "6' × 3' — $72.00", exact: true }).click();
    await expect(footer.locator('[data-banner-current-price]')).toHaveText('$72.00');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }
  await expect(size.getByRole('button', { name: 'Custom size', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await size.getByRole('button', { name: 'Custom size', exact: true }).click();
  await size.getByRole('button', { name: 'Inches', exact: true }).click();
  await expect(page.getByLabel('Banner width in inches')).toHaveValue('72');
  await size.getByRole('button', { name: 'Feet', exact: true }).click();
  await size.getByRole('button', { name: 'Custom size', exact: true }).click();
  const upload = async () => {
    const chooserPromise = page.waitForEvent('filechooser');
    if (mobile) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      if (await footer.getByRole('button', { name: 'Add artwork', exact: true }).isVisible()) await footer.getByRole('button', { name: 'Add artwork', exact: true }).click();
      await expect(page.getByTestId('fading-google-reviews').locator('figure')).toHaveCount(7);
      await expect(page.getByTestId('fading-google-reviews').locator('figure[aria-hidden=false]')).toHaveCount(1);
      await footer.getByRole('button', { name: 'Upload artwork', exact: true }).click();
      // The upload choice must remain visible if the native picker is cancelled.
      // Short artwork pages cannot always scroll the card to the old 180px offset.
      const uploadChoice = page.locator('#upload-section').getByRole('button', { name: /I have artwork/ });
      await expect(uploadChoice).toBeInViewport();
      const choiceBox = (await uploadChoice.boundingBox())!;
      const footerBox = (await footer.boundingBox())!;
      expect(choiceBox.y).toBeGreaterThanOrEqual(0);
      // Allow a one-pixel border/viewport rounding difference in landscape WebKit.
      expect(choiceBox.y + choiceBox.height).toBeLessThanOrEqual(footerBox.y + 1);
    } else {
      await page.locator('#upload-section').getByRole('button', { name: /Upload your artwork/ }).click();
    }
    await (await chooserPromise).setFiles({ name: 'compact-test.png', mimeType: 'image/png', buffer: artwork });
    await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Want your banner to match/)).toHaveCount(0);
  };
  await upload();
  // A size upgrade must preserve uploaded artwork and remain selected across units.
  if (mobile) await page.getByRole('button', { name: 'Back to banner', exact: true }).click();
  await size.getByRole('button', { name: mobile ? "8' × 4' — $111.20" : "8' × 4' — Bigger presence", exact: true }).click();
  await expect(size.getByRole('button', { name: mobile ? "8' × 4' — $111.20" : "8' × 4' — Bigger presence", exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (mobile) {
    await expect(footer.locator('[data-banner-current-price]')).toHaveText('$111.20');
    await expect(footer.locator('del')).toHaveText('$139.00');
  }
  await expect(page.getByAltText('Uploaded artwork preview').first()).toHaveCount(1);
  await size.getByRole('button', { name: 'Inches', exact: true }).click();
  await expect(size.getByRole('button', { name: mobile ? '96" × 48" — $111.20' : '96" × 48" — Bigger presence', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await size.getByRole('button', { name: 'Feet', exact: true }).click();
  await size.getByRole('button', { name: mobile ? "6' × 3' — $72.00" : "6' × 3' — Everyday displays", exact: true }).click();
  if (mobile) await expect(footer.locator('[data-banner-current-price]')).toHaveText('$72.00');
  if (mobile) await footer.getByRole('button', { name: 'Add artwork', exact: true }).click();
  await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible();
  const finish = page.getByTestId('mobile-finishing-step');
  const openFinishing = async () => {
    if (mobile) {
      await footer.getByRole('button', { name: 'Review & finish', exact: true }).click();
      await expect(finish).toBeVisible();
      await finish.getByTestId('review-finishing-options').locator(':scope > summary').click();
      await expect(finish.getByRole('heading', { name: 'Realistic preview', exact: true })).toBeVisible();
      await expect(finish.getByAltText('Your artwork with the selected finishing')).toBeVisible();
      await expect.poll(() => finish.getByAltText('Your artwork with the selected finishing').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  };
  await openFinishing();
  const choices = mobile ? finish : page.locator('#options-section');
  await expect(choices.getByRole('button', { name: /Grommets/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(choices.getByLabel('Grommet placement')).toHaveValue('every-2-3ft');
  if (mobile) {
    await expect(finish.getByRole('button', { name: mobile ? 'Checkout' : 'Continue to checkout', exact: true })).toBeEnabled();
    await expect(finish.getByRole('button', { name: 'Add & design another', exact: true })).toBeEnabled();
    await expect(finish.locator('[data-testid=mobile-review-summary] [data-price-delivery-estimate]').first()).toContainText('Estimated delivery:');
  }
  await choices.getByRole('button', { name: /Rope in Welded Hem/ }).click();
  await choices.getByLabel('Rope placement').selectOption('bottom');
  if (mobile) await expect(finish.locator('[data-realistic-rope="bottom"]')).toHaveCount(1);
  await choices.getByLabel('Rope placement').selectOption('top');
  if (mobile) {
    await expect(finish.locator('[data-realistic-rope="top"]')).toHaveCount(1);
    await expect(finish.locator('[data-realistic-rope="bottom"]')).toHaveCount(0);
  }
  await choices.getByRole('button', { name: /Pole Pockets/ }).click();
  await expect(choices.getByLabel('Pole pocket placement')).toHaveValue('top');
  if (mobile) {
    await expect(finish.locator('[data-realistic-pocket="top"]')).toHaveCount(1);
    await expect(finish.locator('[data-realistic-rope]')).toHaveCount(0);
  }
  await choices.getByRole('button', { name: /Grommets/ }).click();
  await choices.getByLabel('Grommet placement').selectOption('every-2-3ft');
  if (mobile) {
    await expect.poll(() => finish.locator('[data-realistic-grommet]').count()).toBeGreaterThan(4);
    await expect(finish.locator('[data-realistic-pocket]')).toHaveCount(0);
    await expect(finish.getByRole('button', { name: mobile ? 'Checkout' : 'Continue to checkout', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
    const inlinePreview = finish.getByTestId('finishing-realistic-preview');
    const inlineWidth = (await inlinePreview.locator('[data-realistic-scene]').boundingBox())!.width;
    const hardwareCount = await inlinePreview.locator('[data-realistic-grommet]').count();
    const artworkStyle = await inlinePreview.getByAltText('Your artwork with the selected finishing').getAttribute('style');
    await inlinePreview.getByRole('button', { name: 'Enlarge realistic preview', exact: true }).click();
    const expandedPreview = page.getByTestId('finishing-realistic-lightbox');
    await expect(expandedPreview).toBeVisible();
    await expect(expandedPreview.locator('[data-realistic-grommet]')).toHaveCount(hardwareCount);
    await expect(expandedPreview.getByAltText('Your artwork with the selected finishing')).toHaveAttribute('style', artworkStyle!);
    expect((await expandedPreview.locator('[data-realistic-scene]').boundingBox())!.width).toBeGreaterThan(inlineWidth);
    await expandedPreview.getByRole('button', { name: 'Close preview', exact: true }).click();
    await expect(expandedPreview).toHaveCount(0);
    await expect(finish).toBeVisible();
    await expect(choices.getByRole('button', { name: /Grommets/ })).toHaveAttribute('aria-pressed', 'true');
    if (page.viewportSize()!.height > 600) {
      const previewBox = (await finish.getByTestId('finishing-realistic-preview').boundingBox())!;
      const optionsBox = (await finish.getByTestId('review-finishing-options').boundingBox())!;
      expect(optionsBox.y).toBeGreaterThanOrEqual(previewBox.y + previewBox.height);
      expect(optionsBox.height).toBeGreaterThan(88);
    }
    await finish.getByTestId('finishing-realistic-preview').screenshot({ path: testInfo.outputPath('finishing-realistic-preview.png') });
  }
  if (mobile) {
    await finish.getByRole('button', { name: 'Edit design', exact: true }).click();
    await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible();
    await openFinishing();
    await expect(choices.getByRole('button', { name: /Grommets/ })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Add & design another', exact: true }).filter({ visible: true }).click();
  await expect(page.getByAltText('Uploaded artwork preview')).toHaveCount(0, { timeout: 60000 });
  if (mobile) await expect(page.getByLabel('1 items in cart')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage') || '{}').state.items);
  expect(stored).toHaveLength(1);
  expect(stored[0].grommets).toBe('every-2-3ft');
  expect(stored[0].placement_preview.uploadStatus).toBe('uploaded');
  const savedId = stored[0].id;
  const artifactResponse = await page.request.get(harness.artifactUrl);
  expect(artifactResponse.ok()).toBe(true);
  const baked = await artifactResponse.body();
  expect(baked.equals(artwork)).toBe(false);
  const dimensions = await sharp(baked).metadata();
  expect(dimensions.width! / dimensions.height!).toBeCloseTo(2, 2);
  await upload();
  await openFinishing();
  await expect(choices.getByRole('button', { name: /Grommets/ })).toHaveAttribute('aria-pressed', 'true');
  if (mobile) {
    await expect(finish.getByRole('button', { name: mobile ? 'Checkout' : 'Continue to checkout', exact: true })).toBeEnabled();
    await choices.getByRole('button', { name: /No hanging hardware/ }).click();
    await expect(finish.locator('[data-realistic-grommet], [data-realistic-pocket], [data-realistic-rope]')).toHaveCount(0);
  } else {
    await choices.getByRole('button', { name: /Grommets/ }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('finishing-step.png') });
  await page.getByRole('button', { name: mobile ? 'Checkout' : 'Continue to checkout', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/checkout/, { timeout: 60000 });
  await expect(page.locator('[data-checkout-header]')).toContainText('Secure checkout');
  await expect(page.locator('header nav')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /menu/i })).toHaveCount(0);
  const finalCart = await page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage') || '{}').state.items);
  expect(finalCart).toHaveLength(2);
  expect(finalCart[0].id).toBe(savedId);
  expect(finalCart[1].grommets).toBe('none');
  await expect(page.getByTestId('payment-order-summary')).toBeVisible();
  await expect(page.getByTestId('checkout-order-totals')).toHaveCount(1);
  const artworkItems = page.getByTestId('payment-order-summary').locator('[data-checkout-artwork-item]');
  await expect(artworkItems).toHaveCount(2);
  const firstItem = artworkItems.first();
  const printPreview = firstItem.locator('[data-commerce-preview]');
  await expect(printPreview).toHaveAttribute('data-preview-ready', 'true');
  // Landscape phones bound large previews by viewport height to preserve their aspect ratio.
  const expectedWidth = Math.min((await firstItem.boundingBox())!.width, (page.viewportSize()!.height - 160) * 2, 600);
  expect((await printPreview.boundingBox())!.width).toBeGreaterThan(expectedWidth * 0.8);
  await expect(firstItem.getByText('Realistic preview', { exact: true })).toBeVisible();
  await firstItem.screenshot({ path: testInfo.outputPath('checkout-large-previews.png') });
  await firstItem.getByRole('button', { name: /Enlarge realistic preview/ }).click();
  await expect(page.locator('[data-realistic-lightbox]')).toBeVisible();
  await expect(page.locator('[data-realistic-lightbox] [data-realistic-grommet]')).toHaveCount(await firstItem.locator('[data-realistic-grommet]').count());
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
});


test('every banner designer route uses the shared mobile ordering controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone15pro-portrait', 'Shared route coverage on mobile Safari; the complete flow runs on all browsers.');
  await installUploadAndFunctionHarness(page, 'banner-route-coverage');
  for (const route of ['/design', '/design?product=banner', '/halloween-banner', '/large-banners-fast', '/double-sided-banners', '/fall-festival-banners']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    if (!['/large-banners-fast', '/fall-festival-banners'].includes(route)) {
      await page.getByTestId('mobile-subtotal-bar').getByRole('button', { name: 'Add artwork', exact: true }).click();
    }
    const uploadButton = page.getByTestId('mobile-subtotal-bar').getByRole('button', { name: 'Upload artwork', exact: true });
    await expect(uploadButton).toBeVisible();
    await expect(uploadButton).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.locator('#upload-section')).toHaveCount(1);
    await expect(page.locator('#options-section')).toHaveCount(0);
  }
});


test('single and double sided pricing, artwork and cart editing share one designer', async ({ page }, info) => {
  // Two upload/save/checkout cycles plus screenshots can exceed two minutes
  // in WebKit on shared CI runners; retain the normal per-action timeouts.
  test.setTimeout(180_000);
  await installUploadAndFunctionHarness(page, `print-sides-${info.project.name}`);
  // Include the smallest supported phone width in the existing browser matrix.
  if (info.project.name === 'webkit-iphonese-portrait') await page.setViewportSize({ width: 320, height: 700 });
  const mobile = page.viewportSize()!.width < 1024;
  await page.goto('/design?width=48&height=24&utm_source=print-sides-test');
  const size = page.locator('#size-section');
  const single = page.getByRole('radio', { name: /Single-sided/ });
  const double = page.getByRole('radio', { name: /Double-sided/ });
  const price = mobile ? page.getByTestId('mobile-subtotal-bar') : page.getByTestId('price-breakdown').filter({ visible: true }).first();
  if (mobile) await price.getByRole('button', { name: 'Add artwork', exact: true }).click();
  await expect(single).toBeChecked();
  await expect(price).toContainText('$32.00');
  await page.locator('#material-section').getByRole('button').click();
  await page.getByRole('option', { name: /15.*oz/i }).click();
  await double.check();
  await expect(page.locator('#material-section')).toContainText('18 oz vinyl');
  await expect(price).toContainText('$40.00');
  await single.check();
  await expect(page.locator('#material-section')).toContainText(/15.*oz/i);
  await page.locator('#material-section').getByRole('button').click();
  await page.getByRole('option', { name: /13.*oz/i }).click();
  if (mobile) await page.getByRole('button', { name: 'Back to banner', exact: true }).click();
  await size.getByRole('button', { name: mobile ? "6' × 3' — $72.00" : "6' × 3' — Everyday displays", exact: true }).click();
  await expect(price).toContainText('$72.00');
  if (mobile) await price.getByRole('button', { name: 'Add artwork', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await (mobile ? page.getByTestId('mobile-subtotal-bar').getByRole('button', { name: 'Upload artwork', exact: true })
    : page.locator('#upload-section').getByRole('button', { name: /Upload your artwork/ })).click();
  await (await chooser).setFiles({ name: 'print-sides.png', mimeType: 'image/png', buffer: await asymmetricArtwork() });
  const preview = page.getByAltText('Uploaded artwork preview').first();
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const originalSrc = await preview.getAttribute('src');
  const placementStyle = () => preview.evaluate(el => (el.parentElement as HTMLElement).style.cssText);
  await expect.poll(placementStyle).toContain('width:');
  const originalStyle = await placementStyle();
  await double.check();
  await expect(double).toBeChecked();
  await expect(page).toHaveURL(/sides=double/);
  expect(new URL(page.url()).searchParams.get('utm_source')).toBe('print-sides-test');
  // URL size params must not reset the size the customer selected in the editor.
  await expect(size.getByRole('button', { name: /6' × 3' —/, includeHidden: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(price).toContainText('$90.00');
  await expect(preview).toHaveAttribute('src', originalSrc!);
  await expect.poll(placementStyle).toBe(originalStyle);
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await expect(price).toContainText('$180.00');
  await single.check();
  await expect(price).toContainText('$144.00');
  await double.check();
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  await expect(price).toContainText('$90.00');
  await expect(preview).toHaveAttribute('src', originalSrc!);
  await expect.poll(placementStyle).toBe(originalStyle);
  const sides = page.getByRole('group', { name: 'Print sides' });
  await sides.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await sides.screenshot({ path: info.outputPath('double-sided-selector.png') });
  await page.screenshot({ path: info.outputPath('double-sided-designer.png') });
  const finish = page.getByTestId('mobile-finishing-step');
  if (mobile) {
    await page.getByTestId('mobile-subtotal-bar').getByRole('button', { name: 'Review & finish', exact: true }).click();
    await finish.getByTestId('review-finishing-options').locator(':scope > summary').click();
  }
  const choices = mobile ? finish : page.locator('#options-section');
  await choices.getByRole('button', { name: /Rope in Welded Hem/ }).click();
  await choices.getByLabel('Rope placement').selectOption('top');
  const finalPrice = mobile ? finish.locator('footer') : price;
  await expect(finalPrice).toContainText('$99.60');
  if (mobile) await finish.screenshot({ path: info.outputPath('double-sided-finishing.png') });
  await page.getByRole('button', { name: 'Continue to checkout', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/checkout/, { timeout: 60000 });
  const readCart = () => page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage') || '{}').state.items);
  const cart = await readCart();
  expect(cart).toHaveLength(1);
  expect(cart[0]).toMatchObject({ material: '18oz_double', width_in: 72, height_in: 36, quantity: 1,
    unit_price_cents: 11250, rope_cost_cents: 1200, line_total_cents: 12450 });
  expect(cart[0].placement_preview.uploadStatus).toBe('uploaded');
  await expect(page.getByTestId('checkout-order-totals')).toContainText('$124.50');
  await expect(page.getByTestId('checkout-order-totals')).toContainText('-$24.90');
  await expect(page.getByTestId('checkout-order-totals')).toContainText('$105.58');
  await page.getByTestId('payment-order-summary').screenshot({ path: info.outputPath('double-sided-checkout.png') });
  // Follow the actual checkout edit action, then save over the same cart item.
  await page.getByRole('button', { name: 'Edit order', exact: true }).click();
  await page.getByRole('button', { name: 'Edit banner', exact: true }).click();
  await expect(page).toHaveURL(/editItem=/);
  expect(new URL(page.url()).pathname).not.toBe('/double-sided-banners');
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(double).toBeChecked();
  await expect(preview).toBeVisible();
  await single.check();
  await expect(price).toContainText('$81.60');
  if (mobile) await page.getByTestId('mobile-subtotal-bar').getByRole('button', { name: 'Review & finish', exact: true }).click();
  await page.getByRole('button', { name: mobile ? 'Continue to checkout' : 'Save & checkout', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/checkout/, { timeout: 60000 });
  const edited = await readCart();
  expect(edited).toHaveLength(1);
  expect(edited[0]).toMatchObject({ id: cart[0].id, material: '13oz', width_in: 72, height_in: 36,
    unit_price_cents: 9000, rope_cost_cents: 1200, line_total_cents: 10200 });
  expect(cart[0].image_position).toBeDefined();
  expect(edited[0].image_position).toEqual(cart[0].image_position);
  expect(edited[0].image_scale).toBe(cart[0].image_scale);
  expect(edited[0].file_url).toBe(cart[0].file_url);
  expect(JSON.parse(edited[0].canvas_state_json).normalizedPlacement).toEqual(JSON.parse(cart[0].canvas_state_json).normalizedPlacement);
  await expect(page.getByTestId('checkout-order-totals')).toContainText('$102.00');
  await expect(page.getByTestId('checkout-order-totals')).toContainText('-$20.40');
  await expect(page.getByTestId('checkout-order-totals')).toContainText('$86.50');
});
