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

    if (url.protocol !== 'blob:' && url.protocol !== 'data:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
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


test('banner finishing preserves the artwork, price and cart through add-another and checkout', async ({ page }, testInfo) => {
  const artwork = await asymmetricArtwork();
  const harness = await installUploadAndFunctionHarness(page, artwork, `compact-${testInfo.project.name}`);
  await page.goto('/google-ads-banner', { waitUntil: 'domcontentloaded' });
  const mobile = (page.viewportSize()?.width ?? 1024) < 1024;
  const footer = page.getByTestId('mobile-subtotal-bar');
  const size = page.locator('#size-section');
  if (mobile) {
    await expect(footer.getByRole('button', { name: 'Upload artwork', exact: true })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'View cart (0)', exact: true })).toBeVisible();
    await expect(page.locator('#options-section')).toHaveCount(0);
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
  expect(stored[0].placement_preview.uploadStatus).toBe('ready');
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
