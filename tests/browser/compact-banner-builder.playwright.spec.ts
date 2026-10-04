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
    await expect(footer.getByRole('button', { name: 'Upload artwork', exact: true })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'View cart (0)', exact: true })).toBeVisible();
    await expect(page.locator('#options-section')).toHaveCount(0);
    await expect(page.getByTestId('mobile-banner-hero')).toContainText('Estimated delivery');
    await expect(page.getByRole('button', { name: 'Pause Google reviews' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('landing-first-screen.png') });
    const heroBox = await page.getByTestId('mobile-banner-hero').boundingBox();
    expect(heroBox!.height).toBeLessThan(330);
    if (page.viewportSize()!.height >= 640) {
      const dimensions = await page.getByLabel('Banner width feet').boundingBox();
      const footerBox = await footer.boundingBox();
      expect(dimensions!.y + dimensions!.height).toBeLessThanOrEqual(footerBox!.y);
    }
    const proofBox = await page.getByTestId('mobile-banner-proof').boundingBox();
    const uploadBox = await page.locator('#upload-section').boundingBox();
    expect(proofBox!.y).toBeGreaterThan(uploadBox!.y + uploadBox!.height);

  }
  await size.getByRole('button', { name: 'Inches', exact: true }).click();
  await expect(page.getByLabel('Banner width in inches')).toHaveValue('72');
  await size.getByRole('button', { name: 'Feet', exact: true }).click();
  const upload = async () => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#upload-section').getByRole('button', { name: /Upload your artwork/ }).click();
    await (await chooserPromise).setFiles({ name: 'compact-test.png', mimeType: 'image/png', buffer: artwork });
    await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible({ timeout: 30000 });
  };
  await upload();
  const finish = page.getByTestId('mobile-finishing-step');
  const openFinishing = async () => {
    if (mobile) {
      await footer.getByRole('button', { name: 'Next: Finishing', exact: true }).click();
      await expect(finish).toBeVisible();
    }
  };
  await openFinishing();
  const choices = mobile ? finish : page.locator('#options-section');
  if (mobile) {
    await expect(finish.getByRole('button', { name: 'Choose a finishing option', exact: true })).toBeDisabled();
    await expect(finish.getByRole('button', { name: 'Add & design another', exact: true })).toBeDisabled();
  }
  await choices.getByRole('button', { name: /Rope in Welded Hem/ }).click();
  await choices.getByLabel('Rope placement').selectOption('top');
  await choices.getByRole('button', { name: /Pole Pockets/ }).click();
  await expect(choices.getByLabel('Pole pocket placement')).toHaveValue('top');
  await choices.getByRole('button', { name: /Grommets/ }).click();
  await choices.getByLabel('Grommet placement').selectOption('every-2-3ft');
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
  if (mobile) {
    await expect(finish.getByRole('button', { name: 'Choose a finishing option', exact: true })).toBeDisabled();
    await choices.getByRole('button', { name: /No hanging hardware/ }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('finishing-step.png') });
  await page.getByRole('button', { name: 'Continue to checkout', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/checkout/, { timeout: 60000 });
  const finalCart = await page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage') || '{}').state.items);
  expect(finalCart).toHaveLength(2);
  expect(finalCart[0].id).toBe(savedId);
  expect(finalCart[1].grommets).toBe('none');
  await expect(page.getByTestId('payment-order-summary')).toBeVisible();
  await expect(page.getByTestId('checkout-order-totals')).toHaveCount(1);
});
