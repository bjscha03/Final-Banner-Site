import { expect, test, type Page, type Request } from '@playwright/test';
import sharp from 'sharp';
type UploadHarness = {
  originalUrl: string;
  artifactUrl: string;
  artifactBuffer: Buffer | null;
  savedCarts: any[][];
};

function extractMultipartFile(request: Request): { filename: string; bytes: Buffer } {
  const contentType = request.headers()['content-type'] || '';
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
  const body = request.postDataBuffer();
  if (!boundary || !body) throw new Error('Direct-upload multipart body was unavailable.');

  const filenameMarker = Buffer.from('filename="');
  const filenameStartMarker = body.indexOf(filenameMarker);
  if (filenameStartMarker < 0) throw new Error('Direct-upload filename was unavailable.');
  const filenameStart = filenameStartMarker + filenameMarker.length;
  const filenameEnd = body.indexOf(Buffer.from('"'), filenameStart);
  const filename = body.subarray(filenameStart, filenameEnd).toString('utf8');
  const headersEnd = body.indexOf(Buffer.from('\r\n\r\n'), filenameEnd);
  const fileStart = headersEnd + 4;
  const fileEnd = body.indexOf(Buffer.from(`\r\n--${boundary}`), fileStart);
  if (headersEnd < 0 || fileEnd < 0) throw new Error('Direct-upload file bytes were unavailable.');
  return { filename, bytes: body.subarray(fileStart, fileEnd) };
}

async function installUploadAndFunctionHarness(
  page: Page,
  originalBytes: Buffer,
  scenario: string,
): Promise<UploadHarness> {
  const state: UploadHarness = {
    originalUrl: `http://127.0.0.1:4175/__compact-test-asset?scenario=${scenario}&kind=original`,
    artifactUrl: `http://127.0.0.1:4175/__compact-test-asset?scenario=${scenario}&kind=placement`,
    artifactBuffer: null,
    savedCarts: [],
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/.netlify/functions/cloudinary-upload-signature') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          apiKey: 'browser-test-key',
          cloudName: 'browser-test-cloud',
          expiresAt: Date.now() + 60_000,
          folder: 'browser-tests',
          overwrite: false,
          resourceType: 'image',
          signature: 'browser-test-signature',
          timestamp: Math.floor(Date.now() / 1000),
          uniqueFilename: true,
          uploadUrl: `http://127.0.0.1:4175/__compact-test-upload?scenario=${scenario}`,
          useFilename: true,
        }),
      });
      return;
    }

    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (url.pathname.endsWith('/cart-save')) {
        const payload = JSON.parse(request.postData() || '{}');
        state.savedCarts.push(payload.cartData || []);
      }
      const body = url.pathname.endsWith('/cart-load')
        ? { cartData: [] }
        : url.pathname.endsWith('/paypal-config')
          ? { enabled: false }
          : { success: true };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }

    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  return state;
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


test('compact banner builder preserves dimensions, finishing, artwork and cart handoff', async ({ page }, testInfo) => {
  const artwork = await asymmetricArtwork();
  const harness = await installUploadAndFunctionHarness(page, artwork, `compact-${testInfo.project.name}`);
  await page.goto('/google-ads-banner', { waitUntil: 'domcontentloaded' });
  const action = page.locator('[data-banner-primary-action]:visible');
  const price = page.getByTestId('price-breakdown');
  await expect(action).toHaveCount(1);
  await expect(action).toHaveText('Choose a size');
  await expect(price).toContainText('$0.00');
  const size = page.locator('#size-section');
  await expect(size.getByRole('button', { name: 'Feet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await action.click();
  await size.getByRole('button', { name: "6' × 3' — Most popular — 25% off automatically", exact: true }).click();
  await expect(price).toContainText('$60.75');
  await expect(action).toHaveText('Upload artwork');
  await size.getByRole('button', { name: 'Inches', exact: true }).click();
  await expect(page.getByLabel('Banner width in inches')).toHaveValue('72');
  await size.getByRole('button', { name: 'Feet', exact: true }).click();
  await expect(page.getByLabel('Banner width feet')).toHaveValue('6');
  const finishing = page.locator('#options-section');
  await finishing.getByRole('button', { name: /Rope in Welded Hem/ }).click();
  await expect(page.getByLabel('Rope placement')).toBeVisible();
  await page.getByLabel('Rope placement').selectOption('top');
  await expect(price).toContainText('$69.75');
  await finishing.getByRole('button', { name: /Pole Pockets/ }).click();
  await expect(price).toContainText('$81.00');
  await finishing.getByRole('button', { name: /Grommets/ }).click();
  await expect(price).toContainText('$60.75');
  await expect(page.getByLabel('Grommet placement')).toBeVisible();
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await expect(price).toContainText('$121.50');
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  const chooserPromise = page.waitForEvent('filechooser');
  await action.click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'compact-test.png', mimeType: 'image/png', buffer: artwork });
  const preview = page.getByAltText('Uploaded artwork preview').first();
  await expect(preview).toBeVisible({ timeout: 30000 });
  await expect(action).toHaveText('Add to cart');
  await size.getByRole('button', { name: "8' × 3' — 25% off automatically", exact: true }).click();
  await expect(preview).toBeVisible();
  await size.getByRole('button', { name: "6' × 3' — Most popular — 25% off automatically", exact: true }).click();
  await preview.click();
  await page.getByRole('button', { name: 'Fit', exact: true }).first().click();
  await expect(price).toContainText('$60.75');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.locator('#upload-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('compact-builder.png'), fullPage: true });
  await action.click();
  const cart = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(cart).toBeVisible({ timeout: 60000 });
  await expect(cart.locator(`img[src="${harness.artifactUrl}"]`).first()).toBeVisible();
  await expect(cart).toContainText('$60.75');
  const artifactResponse = await page.request.get(harness.artifactUrl);
  expect(artifactResponse.ok()).toBe(true);
  const baked = await artifactResponse.body();
  expect(baked.equals(artwork)).toBe(false);
  const dimensions = await sharp(baked).metadata();
  expect(dimensions.width! / dimensions.height!).toBeCloseTo(2, 2);
  await cart.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.locator(`img[src="${harness.artifactUrl}"]`).first()).toBeVisible();
  await expect(page.getByText('$60.75', { exact: true }).first()).toBeVisible();
});
