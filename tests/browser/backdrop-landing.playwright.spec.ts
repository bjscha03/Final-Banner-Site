import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

async function fixtures(page: Page, mismatch = false) {
  const uploads = new Map<string, { buffer: Buffer; mime: string }>();
  const requests: Record<string, any>[] = [];
  let currentFit: any;
  await page.route('https://res.cloudinary.com/backdrop-test/**', async route => {
    const filename = new URL(route.request().url()).pathname.split('/').pop()!;
    const file = uploads.get(filename);
    if (!file) return route.fulfill({ status: 404 });
    await route.fulfill({ body: file.buffer, contentType: file.mime, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route('**/.netlify/functions/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/upload-file')) {
      const request = route.request(), body = request.postDataBuffer()!;
      const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(request.headers()['content-type'])!;
      const separator = Buffer.from(`\r\n--${boundary[1] || boundary[2]}`);
      const headerEnd = body.indexOf('\r\n\r\n'), header = body.subarray(0, headerEnd).toString();
      const buffer = body.subarray(headerEnd + 4, body.indexOf(separator, headerEnd + 4));
      const mime = /Content-Type: ([^\r\n]+)/i.exec(header)![1];
      const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
      const name = `upload-${uploads.size + 1}.${ext}`;
      uploads.set(name, { buffer, mime });
      const meta = ext === 'pdf' ? {} : await sharp(buffer).metadata();
      return route.fulfill({ json: { secure_url: `https://res.cloudinary.com/backdrop-test/${ext === 'pdf' ? 'raw' : 'image'}/upload/v1/${name}`, public_id: name, resource_type: ext === 'pdf' ? 'raw' : 'image', format: ext, bytes: buffer.length, width: meta.width, height: meta.height } });
    }
    if (path.endsWith('/ai-designer-status')) return route.fulfill({ json: { ready: true } });
    if (path.endsWith('/ai-designer-fit')) {
      const body = route.request().postDataJSON(); requests.push(body);
      const widthPx = body.widthIn === 96 ? 800 : 1000, heightPx = 800;
      const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}"><rect width="100%" height="100%" fill="#061a31"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="64">ACME EVENT</text></svg>`)).jpeg().toBuffer();
      currentFit = { id: `fit-${requests.length}`, sourceHash: 'source', productType: body.productType, widthIn: mismatch ? 108 : body.widthIn, heightIn: body.heightIn, widthPx, heightPx, imageBase64: image.toString('base64'), mimeType: 'image/jpeg', verification: { passed: true, canApply: true, originalText: ['ACME EVENT'], detectedText: ['ACME EVENT'], missing: [], added: [], issues: [], confidence: 1 }, diagnostics: { model: 'test', durationMs: 1 } };
      return route.fulfill({ json: { jobRef: `job-${requests.length}`, pollAfterMs: 1000 } });
    }
    if (path.endsWith('/ai-designer-worker-background')) return route.fulfill({ status: 202, json: {} });
    if (path.endsWith('/ai-designer-job')) return route.fulfill({ json: { status: 'completed', fit: currentFit } });
    return route.fulfill({ json: {} });
  });
  return { uploads, requests };
}

async function upload(page: Page) {
  const buffer = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#ff6a00"/><text x="400" y="300" text-anchor="middle" fill="white" font-size="60">ACME EVENT</text></svg>')).png().toBuffer();
  await page.getByLabel('Upload Front artwork', { exact: true }).setInputFiles({ name: 'original-event.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('button', { name: 'Fit my design with AI', exact: true })).toBeEnabled();
  await expect(page.getByTestId('specialty-live-preview').locator('svg').first()).toBeVisible();
}

test('layout, artwork dimensions, live prices, package options and cart controls', async ({ page }, info) => {
  await fixtures(page);
  await page.goto('/google-ads-backdrops?utm_source=google&utm_campaign=backdrops');
  await expect(page.locator('h1:visible')).toContainText('Custom backdrops.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.getByTestId('specialty-subtotal')).toHaveText('$390.77');
  for (const image of await page.locator('.product-hero-media img:visible, .compact-product-hero img:visible').all()) {
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('backdrop-hero.png') });
  await page.getByRole('radio', { name: '10 × 8 ft', exact: true }).check();
  await expect(page.getByTestId('specialty-subtotal')).toHaveText('$407.20');
  await page.locator('#specialty-qty').fill('2');
  await expect(page.getByTestId('specialty-subtotal')).toHaveText('$814.40');
  await page.locator('#specialty-qty').fill('1');
  await page.locator('#option-hardware').selectOption('p');
  await expect(page.getByTestId('specialty-subtotal')).toHaveText('$254.14');
  await page.getByText('Artwork size & safe-area guidance', { exact: true }).click();
  await expect(page.locator('#specialty-artwork')).toContainText('120″ × 96″ artwork');
  await expect(page.locator('#specialty-artwork')).toContainText('top 4″, right 1″, bottom 4″, left 1″');
  await page.getByRole('radio', { name: '8 × 8 ft', exact: true }).check();
  await expect(page.locator('#specialty-artwork')).toContainText('96″ × 96″ artwork');
  await expect(page.getByTestId('specialty-subtotal')).toHaveText('$390.77');
  await page.getByRole('button', { name: 'Shopping cart', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Shopping cart', exact: true })).toContainText('Your cart is empty');
  await page.getByRole('button', { name: 'Close cart', exact: true }).click();
  await page.locator('#specialty-builder').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('backdrop-builder.png') });
});

for (const size of [{ label: '8 × 8 ft', width: 96, id: 'step-and-repeat-backdrop-8x8', base: 48846 }, { label: '10 × 8 ft', width: 120, id: 'step-and-repeat-backdrop-1', base: 50900 }]) {
  test(`${size.label}: AI fits selected template, saves original, exports and checks out`, async ({ page }, info) => {
    const { requests, uploads } = await fixtures(page);
    await page.goto('/google-ads-backdrops');
    await page.getByRole('radio', { name: size.label, exact: true }).check();
    await upload(page);
    const image = page.getByTestId('artwork-canvas').locator('img').first();
    const original = await image.getAttribute('src');
    await page.getByRole('button', { name: 'Fit my design with AI', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Approve design', exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ widthIn: size.width, heightIn: 96, productType: `specialty:step-and-repeat-backdrop:${size.id}:front` });
    await expect(image).toHaveAttribute('src', original!);
    await page.getByRole('button', { name: 'Approve design', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Restore original', exact: true })).toBeVisible();
    await expect(image).not.toHaveAttribute('src', original!);
    const approve = page.getByRole('checkbox', { name: /I checked the front artwork/ });
    await approve.check();
    await page.locator('#specialty-artwork').getByRole('button', { name: 'Add to cart', exact: true }).click();
    await expect(page).toHaveURL(/\/checkout/);
    const item = await page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage')!).state.items[0]);
    expect(item).toMatchObject({ product_type: 'specialty', unit_price_cents: size.base, width_in: size.width, height_in: 96 });
    const saved = item.specialty_config.panels[0];
    expect(saved.originalArtwork.name).toBe('original-event.png');
    expect(saved.artwork.editorIdentity).toBe('ai-fit:fit-1');
    expect(saved.composition).toMatchObject({ widthIn: size.width, heightIn: 96, productType: `specialty:step-and-repeat-backdrop:${size.id}:front` });
    const pdfFile = uploads.get(saved.productionUrl.split('/').pop());
    expect(pdfFile?.mime).toBe('application/pdf');
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(pdfFile!.buffer);
    expect(pdf.getPage(0).getSize()).toEqual({ width: size.width * 72, height: 96 * 72 });
    await page.screenshot({ path: info.outputPath('backdrop-checkout.png') });
    await page.goto(`/products/step-and-repeat-backdrop?editItem=${item.id}`);
    await expect(page.getByRole('button', { name: 'Restore original', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restore original', exact: true }).click();
    await expect(page.getByTestId('artwork-canvas').locator('img').first()).toHaveAttribute('src', original!);
    await expect(page.getByRole('checkbox', { name: /I checked the front artwork/ })).not.toBeChecked();
  });
}

test('mismatched AI output never replaces uploaded artwork', async ({ page }) => {
  await fixtures(page, true); await page.goto('/google-ads-backdrops'); await upload(page);
  const image = page.getByTestId('artwork-canvas').locator('img').first(), original = await image.getAttribute('src');
  await page.getByRole('button', { name: 'Fit my design with AI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve design', exact: true })).toHaveCount(0);
  await expect(image).toHaveAttribute('src', original!);
});
