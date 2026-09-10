import { expect, test, type Page, type Request } from '@playwright/test';
import sharp from 'sharp';

const REAL_ROUTE_PROJECTS = new Set([
  'chromium-1440x900',
  'chromium-pixel8-portrait',
  'chromium-pixel8-landscape',
  'chromium-galaxy-tab-s9-portrait',
  'chromium-galaxy-tab-s9-landscape',
]);

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
    originalUrl: `https://assets.example.test/${scenario}-original.png`,
    artifactUrl: `https://assets.example.test/${scenario}-placement.jpg`,
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
          uploadUrl: 'https://upload.example.test/image/upload',
          useFilename: true,
        }),
      });
      return;
    }

    if (url.hostname === 'upload.example.test') {
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
        return;
      }
      const uploaded = extractMultipartFile(request);
      const placement = uploaded.filename.startsWith('placement-v3-');
      const metadata = await sharp(uploaded.bytes).metadata();
      if (placement) state.artifactBuffer = uploaded.bytes;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          secure_url: placement ? state.artifactUrl : state.originalUrl,
          public_id: placement ? `${scenario}-placement` : `${scenario}-original`,
          asset_id: `${scenario}-${placement ? 'placement' : 'original'}-asset`,
          version: 7,
          resource_type: 'image',
          format: placement ? 'jpg' : 'png',
          bytes: uploaded.bytes.length,
          width: metadata.width,
          height: metadata.height,
        }),
      });
      return;
    }

    if (url.hostname === 'assets.example.test') {
      const placement = url.pathname.endsWith('-placement.jpg');
      const body = placement ? state.artifactBuffer : originalBytes;
      if (!body) {
        await route.fulfill({ status: 404, body: 'artifact not uploaded yet' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: placement ? 'image/jpeg' : 'image/png',
        headers: {
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        },
        body,
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

async function selectLargeBannerAndUpload(page: Page, fileBytes: Buffer, filename: string) {
  await page.goto('/design?product=banner', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: "10' × 4'" }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: fileBytes,
  });
  await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true }).last()).toBeEnabled({ timeout: 30_000 });
}

async function completeActualCartToCheckout(page: Page, harness: UploadHarness) {
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).last().click();
  const upsell = page.locator('[data-upsell-modal]');
  await expect(upsell).toBeVisible({ timeout: 30_000 });
  await expect(upsell.locator(`img[src="${harness.artifactUrl}"]`).first()).toBeVisible();
  await expect(upsell.locator(`img[src="${harness.originalUrl}"]`)).toHaveCount(0);
  await upsell.getByRole('button', { name: 'No thanks, continue without' }).click();

  const headerCart = page.getByRole('button', { name: 'Shopping cart' }).first();
  await expect(headerCart).toBeVisible({ timeout: 20_000 });
  await headerCart.click();
  const cart = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(cart).toBeVisible();
  await expect(cart.locator(`img[src="${harness.artifactUrl}"]`).first()).toBeVisible();
  await expect(cart.locator(`img[src="${harness.originalUrl}"]`)).toHaveCount(0);
  await cart.getByRole('button', { name: 'Enlarge preview' }).click();
  const cartLightbox = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close preview' }) });
  await expect(cartLightbox.locator(`img[src="${harness.artifactUrl}"]`).first()).toBeVisible();
  await cartLightbox.getByRole('button', { name: 'Close preview' }).last().click();
  await cart.getByRole('button', { name: 'Proceed to Checkout' }).click();

  await expect(page).toHaveURL(/\/checkout(?:[?#]|$)/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Secure Checkout' })).toBeVisible();
  await expect(page.locator(`img[src="${harness.artifactUrl}"]`).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`img[src="${harness.originalUrl}"]`)).toHaveCount(0);

  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem('cart-storage');
    return raw ? JSON.parse(raw)?.state?.items?.[0] : null;
  });
  expect(persisted).toMatchObject({
    width_in: 120,
    height_in: 48,
    thumbnail_url: harness.artifactUrl,
    web_preview_url: harness.artifactUrl,
    file_url: harness.originalUrl,
    placement_preview: {
      sourceUrl: harness.originalUrl,
      previewUrl: harness.artifactUrl,
      uploadStatus: 'uploaded',
    },
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!REAL_ROUTE_PROJECTS.has(testInfo.project.name), 'Actual designer route is covered by Chromium desktop and device profiles.');
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test('120×48 Fill keeps the baked placement—not the larger original—through real checkout', async ({ page }, testInfo) => {
  const artwork = await asymmetricArtwork();
  const harness = await installUploadAndFunctionHarness(page, artwork, 'asymmetric');
  await selectLargeBannerAndUpload(page, artwork, 'asymmetric-1080x305.png');
  await page.getByRole('button', { name: 'Fill', exact: true }).first().click();
  await completeActualCartToCheckout(page, harness);

  expect(harness.artifactBuffer).not.toBeNull();
  const metadata = await sharp(harness.artifactBuffer!).metadata();
  const expectedWidth = testInfo.project.name === 'chromium-1440x900' ? 1400 : 1080;
  expect(metadata.width).toBe(expectedWidth);
  expect(metadata.height).toBe(Math.round(expectedWidth / 2.5));
  expect(harness.artifactBuffer!.equals(artwork)).toBe(false);
  expect(harness.savedCarts.at(-1)?.[0]).toMatchObject({
    thumbnail_url: harness.artifactUrl,
    web_preview_url: harness.artifactUrl,
  });
});

test('sparse visible artwork reaches real checkout without the exact-preview error', async ({ page }) => {
  const artwork = await sparseArtwork();
  const harness = await installUploadAndFunctionHarness(page, artwork, 'sparse');
  await selectLargeBannerAndUpload(page, artwork, 'sparse-1672x941.png');
  await page.getByRole('button', { name: 'Fit', exact: true }).first().click();
  await completeActualCartToCheckout(page, harness);

  await expect(page.getByText(/Could not prepare your exact preview/i)).toHaveCount(0);
  await expect(page.getByText(/PREVIEW_RENDERED_BLANK/i)).toHaveCount(0);
  expect(harness.artifactBuffer).not.toBeNull();
  const rendered = await sharp(harness.artifactBuffer!).removeAlpha().raw().toBuffer();
  let darkest = 255;
  for (let index = 0; index < rendered.length; index += 3) {
    darkest = Math.min(darkest, rendered[index], rendered[index + 1], rendered[index + 2]);
  }
  expect(darkest).toBeLessThan(80);
});
