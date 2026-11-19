import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const path = '/google-ads-banner?product=banner&gclid=issue-regression';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('botf_internal_traffic_device', '1');
    sessionStorage.setItem('preview_access_granted', 'true');
  });
  await page.route('**/.netlify/functions/**', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ success: true, enabled: false, cartData: [] }),
  }));
});

test('a transient module failure recovers the banner builder exactly once and preserves browser storage', async ({ page }) => {
  let failed = false;
  const navigations: string[] = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.addInitScript(() => {
    if (!new URL(location.href).searchParams.has('_botf_refresh')) sessionStorage.setItem('qa-design-marker', 'keep-my-design');
  });
  await page.route('**/assets/GoogleAdsBanner-*.js', async route => {
    if (!failed) { failed = true; await route.abort('failed'); }
    else await route.continue();
  });
  await page.goto(path, { waitUntil: 'commit' });
  await expect(page.getByLabel(/^Upload (?:your )?artwork$/i).first()).toBeVisible();
  expect(failed).toBe(true);
  expect(navigations.filter(url => url.includes('_botf_refresh='))).toHaveLength(1);
  expect(new URL(page.url()).searchParams.get('product')).toBe('banner');
  expect(await page.evaluate(() => sessionStorage.getItem('qa-design-marker'))).toBe('keep-my-design');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toHaveCount(0);
});

test('a persistent module failure stops after one recovery and offers a working manual retry', async ({ page }) => {
  let blocking = true;
  const navigations: string[] = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.route('**/assets/GoogleAdsBanner-*.js', route => blocking ? route.abort('failed') : route.continue());
  await page.goto(path, { waitUntil: 'commit' });
  await expect(page).toHaveURL(/_botf_refresh=/);
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  expect(navigations.filter(url => url.includes('_botf_refresh='))).toHaveLength(1);
  blocking = false;
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByLabel(/^Upload (?:your )?artwork$/i).first()).toBeVisible();
});

test('WebP goes through the banner uploader unchanged and displays a usable preview', async ({ page }) => {
  const artwork = await sharp({ create: { width: 1200, height: 600, channels: 4, background: '#f97316' } }).webp({ lossless: true }).toBuffer();
  const url = 'https://res.cloudinary.com/issue-regression/image/upload/v1/uploads/webp-check.webp';
  let uploads = 0;
  await page.route('https://res.cloudinary.com/issue-regression/**', route => route.fulfill({ contentType: 'image/webp', headers: { 'access-control-allow-origin': '*' }, body: artwork }));
  await page.route('**/.netlify/functions/upload-file', async route => {
    expect(route.request().postDataBuffer()!.includes(artwork)).toBe(true);
    expect(route.request().postDataBuffer()!.toString('latin1')).toContain('image/webp');
    uploads++;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ secure_url: url, public_id: 'uploads/webp-check', format: 'webp', width: 1200, height: 600, bytes: artwork.length }) });
  });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const picker = page.getByLabel(/^Upload (?:your )?artwork$/i).first();
  await expect(picker).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), picker.click()]);
  await chooser.setFiles({ name: 'webp-regression.webp', mimeType: 'image/webp', buffer: artwork });
  await expect.poll(() => uploads).toBe(1);
  await expect(page.getByText('webp-regression.webp', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Replace uploaded artwork')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Retry upload', exact: true })).toHaveCount(0);
  await expect(page.getByAltText('Uploaded artwork preview').first()).toBeVisible();
});

for (const product of ['banner', 'yard-signs']) {
  test(`${product} native chooser allows the advertised WebP format`, async ({ page }) => {
    await page.goto(`/google-ads-banner?product=${product}&gclid=issue-regression`);
    const action = page.getByLabel(/^Upload (?:your )?artwork$/i).first();
    await expect(action).toBeVisible();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), action.click()]);
    expect(await chooser.element().getAttribute('accept')).toContain('image/webp');
    expect(await chooser.element().getAttribute('accept')).toContain('.webp');
  });
}
