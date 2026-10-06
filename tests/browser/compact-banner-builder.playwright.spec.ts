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
  const header = page.locator('[data-site-header]');
  await expect(header).toBeVisible();
  await expect(header.getByAltText('Banners On The Fly')).toBeVisible();
  await expect(header.getByRole('button', { name: 'Shopping cart', exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: /navigation menu/i })).toHaveCount(0);
  await expect(header.getByRole('navigation')).toHaveCount(0);
  const mobile = (page.viewportSize()?.width ?? 1024) < 1024;
  const footer = page.getByTestId('mobile-subtotal-bar');
  const size = page.locator('#size-section');
  if (mobile) {
    await expect(footer.getByRole('button', { name: 'Upload artwork', exact: true })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Upload artwork', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(footer.getByRole('button', { name: 'View cart (0)', exact: true })).toBeVisible();
    await expect(page.locator('#options-section')).toHaveCount(0);
    await expect(page.getByTestId('mobile-banner-hero')).toContainText('Estimated delivery');
    await expect(page.getByRole('button', { name: 'Pause Google reviews' })).toBeVisible();
    const deliveryStrip = page.locator('[data-real-orders-strip]');
    await expect(deliveryStrip).toHaveCount(1);
    await expect(deliveryStrip.getByRole('button', { name: 'Pause delivery photos' })).toBeVisible();
    expect((await deliveryStrip.boundingBox())!.y).toBeLessThan((await size.boundingBox())!.y);
    await deliveryStrip.getByRole('button', { name: 'Pause delivery photos' }).click();
    await expect(deliveryStrip).toHaveAttribute('data-paused', 'true');
    await deliveryStrip.getByRole('button', { name: 'Play delivery photos' }).click();
    const heading = page.getByTestId('mobile-banner-hero').getByRole('heading', { level: 1 });
    expect(await heading.evaluate(el => getComputedStyle(el).fontFamily)).not.toMatch(/Bebas|Impact/);
    await page.screenshot({ path: testInfo.outputPath('landing-first-screen.png') });
    const heroBox = await page.getByTestId('mobile-banner-hero').boundingBox();
    expect(heroBox!.height).toBeLessThan(330);
    if (page.viewportSize()!.height >= 640) {
      const dimensions = await size.boundingBox();
      const footerBox = await footer.boundingBox();
      expect(dimensions!.y).toBeLessThan(footerBox!.y);
    }
    const proofBox = await page.getByTestId('mobile-banner-proof').boundingBox();
    const uploadBox = await page.locator('#upload-section').boundingBox();
    expect(proofBox!.y).toBeGreaterThan(uploadBox!.y + uploadBox!.height);

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
      await footer.getByRole('button', { name: 'Upload artwork', exact: true }).click();
      // The page must land at upload even if the customer cancels the picker.
      await expect.poll(async () => (await page.locator('#upload-section').boundingBox())!.y).toBeLessThan(180);
      expect((await page.locator('#upload-section').boundingBox())!.y).toBeGreaterThanOrEqual(0);
    } else {
      await page.locator('#upload-section').getByRole('button', { name: /Upload your artwork/ }).click();
    }
    await (await chooserPromise).setFiles({ name: 'compact-test.png', mimeType: 'image/png', buffer: artwork });
    await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible({ timeout: 30000 });
  };
  await upload();
  // A size upgrade must preserve uploaded artwork and remain selected across units.
  await size.getByRole('button', { name: "8' × 4' — Bigger presence", exact: true }).click();
  await expect(size.getByRole('button', { name: "8' × 4' — Bigger presence", exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible();
  await size.getByRole('button', { name: 'Inches', exact: true }).click();
  await expect(size.getByRole('button', { name: '96" × 48" — Bigger presence', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await size.getByRole('button', { name: 'Feet', exact: true }).click();
  await size.getByRole('button', { name: "6' × 3' — Everyday displays", exact: true }).click();
  await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible();
  const finish = page.getByTestId('mobile-finishing-step');
  const openFinishing = async () => {
    if (mobile) {
      await footer.getByRole('button', { name: 'Next: Finishing', exact: true }).click();
      await expect(finish).toBeVisible();
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
    await expect(finish.getByRole('button', { name: 'Continue to checkout', exact: true })).toBeEnabled();
    await expect(finish.getByRole('button', { name: 'Add & design another', exact: true })).toBeEnabled();
    await expect(finish.locator('footer [data-price-delivery-estimate]')).toContainText('Estimated delivery:');
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
    await expect(finish.getByRole('button', { name: 'Continue to checkout', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
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
      const optionsBox = (await finish.getByTestId('finishing-options-scroll').boundingBox())!;
      expect(optionsBox.y).toBeGreaterThanOrEqual(previewBox.y + previewBox.height);
      expect(optionsBox.height).toBeGreaterThan(88);
    }
    await finish.getByTestId('finishing-realistic-preview').screenshot({ path: testInfo.outputPath('finishing-realistic-preview.png') });
  }
  if (mobile) {
    await finish.getByRole('button', { name: 'Back to design', exact: true }).click();
    await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible();
    await openFinishing();
    await expect(choices.getByRole('button', { name: /Grommets/ })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Add & design another', exact: true }).filter({ visible: true }).click();
  await expect(page.getByAltText('Uploaded artwork preview')).toHaveCount(0, { timeout: 60000 });
  if (mobile) await expect(footer.getByRole('button', { name: 'View cart (1)', exact: true })).toBeVisible();
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
    await expect(finish.getByRole('button', { name: 'Continue to checkout', exact: true })).toBeEnabled();
    await choices.getByRole('button', { name: /No hanging hardware/ }).click();
    await expect(finish.locator('[data-realistic-grommet], [data-realistic-pocket], [data-realistic-rope]')).toHaveCount(0);
  } else {
    await choices.getByRole('button', { name: /Grommets/ }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('finishing-step.png') });
  await page.getByRole('button', { name: 'Continue to checkout', exact: true }).filter({ visible: true }).click();
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
    const uploadButton = page.getByTestId('mobile-subtotal-bar').getByRole('button', { name: 'Upload artwork', exact: true });
    await expect(uploadButton).toBeVisible();
    await expect(uploadButton).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.locator('#upload-section')).toHaveCount(1);
    await expect(page.locator('#options-section')).toHaveCount(0);
  }
});
