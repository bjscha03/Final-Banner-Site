import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';

const path = '/google-ads-banner?product=banner&gclid=issue-regression';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('botf_internal_traffic_device', '1');
    sessionStorage.setItem('preview_access_granted', 'true');
  });
  await page.route('**/.netlify/functions/**', route => route.request().url().endsWith('/upload-file') ? route.continue() : route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ success: true, enabled: false, cartData: [] }),
  }));
});

test('a transient module failure recovers the banner builder exactly once and preserves browser storage', async ({ page, context, baseURL }) => {
  const id = randomUUID();
  await context.addCookies([{ name: 'bof_issue_qa_case', value: id, url: baseURL! }]);
  await page.request.get(`/__issue_qa/failure/${id}?mode=transient`);
  const failedAssets: string[] = [];
  page.on('response', response => { if (response.status() === 503 && response.url().includes('/assets/GoogleAdsBanner-')) failedAssets.push(response.url()); });
  const navigations: string[] = [];
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(request.url()); });
  await page.addInitScript(() => {
    if (!new URL(location.href).searchParams.has('_botf_refresh')) sessionStorage.setItem('qa-design-marker', 'keep-my-design');
  });
  await page.goto(path, { waitUntil: 'commit' });
  await expect(page.getByLabel(/^Upload (?:your )?artwork$/i).first()).toBeVisible();
  expect(failedAssets).toHaveLength(1);
  expect(navigations.filter(url => url.includes('_botf_refresh='))).toHaveLength(1);
  expect(new URL(page.url()).searchParams.get('product')).toBe('banner');
  expect(await page.evaluate(() => sessionStorage.getItem('qa-design-marker'))).toBe('keep-my-design');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toHaveCount(0);
});

test('a persistent module failure stops after one recovery and offers a working manual retry', async ({ page, context, baseURL }) => {
  const id = randomUUID();
  await context.addCookies([{ name: 'bof_issue_qa_case', value: id, url: baseURL! }]);
  await page.request.get(`/__issue_qa/failure/${id}?mode=persistent`);
  const navigations: string[] = [];
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(request.url()); });
  await page.goto(path, { waitUntil: 'commit' });
  await expect(page).toHaveURL(/_botf_refresh=/);
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  expect(navigations.filter(url => url.includes('_botf_refresh='))).toHaveLength(1);
  await page.request.get(`/__issue_qa/failure/${id}?mode=off`);
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByLabel(/^Upload (?:your )?artwork$/i).first()).toBeVisible();
});

test('WebP goes through the banner uploader unchanged and displays a usable preview', async ({ page }) => {
  const artwork = await sharp({ create: { width: 1200, height: 600, channels: 4, background: '#f97316' } }).webp({ lossless: true }).toBuffer();
  const name = `webp-regression-${randomUUID()}.webp`;
  await page.route('https://res.cloudinary.com/issue-regression/**', route => route.fulfill({ contentType: 'image/webp', headers: { 'access-control-allow-origin': '*' }, body: artwork }));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const picker = page.getByLabel(/^Upload (?:your )?artwork$/i).first();
  await expect(picker).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), picker.click()]);
  await chooser.setFiles({ name, mimeType: 'image/webp', buffer: artwork });
  await expect.poll(async () => (await page.request.get(`/__issue_qa/upload/${name}`)).json()).toEqual({
    name, mimeType: 'image/webp', bytes: artwork.length, sha256: createHash('sha256').update(artwork).digest('hex'), count: 1,
  });
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
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
