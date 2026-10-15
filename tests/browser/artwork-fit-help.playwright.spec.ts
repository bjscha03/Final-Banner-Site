import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

async function uploadSquare(page: Page, path: string, scenario: string) {
  await page.context().addCookies([{ name: 'compact_browser_scenario', value: scenario, url: 'http://127.0.0.1:4175' }]);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  if (path === '/design' && !mobile) await page.getByRole('button', { name: "6' × 3' — Most popular", exact: true }).click();
  const picker = page.waitForEvent('filechooser');
  if (mobile) await page.getByTestId('mobile-subtotal-bar').getByRole('button', { name: 'Upload artwork', exact: true }).click();
  else await page.locator('#upload-section').getByRole('button', { name: /Upload your artwork/ }).click();
  const buffer = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#061A31"/><text x="400" y="360" text-anchor="middle" fill="#ff8a3d" font-size="90" font-family="sans-serif">GRAND</text><text x="400" y="470" text-anchor="middle" fill="white" font-size="90" font-family="sans-serif">OPENING</text></svg>')).png().toBuffer();
  await (await picker).setFiles({ name: 'square-design.png', mimeType: 'image/png', buffer });
  const image = page.getByAltText('Uploaded artwork preview').first();
  await expect(image).toBeVisible();
  await expect(page.locator('#upload-section [data-artwork-toolbar=true]').getByRole('button', { name: /Fit my (banner|design) with AI/ })).toBeEnabled();
  await page.getByTestId('artwork-canvas').first().scrollIntoViewIfNeeded();
  return image;
}

async function adjust(page: Page) {
  const selection = page.getByTestId('artwork-selection').first();
  const box = (await selection.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if ((page.viewportSize()?.width ?? 1440) < 600 && page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 18, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 18, y, { steps: 6 }); await page.mouse.up();
  }
  await page.waitForTimeout(400);
}

for (const path of ['/design', '/google-ads-banner']) {
  test(`${path}: help is branded, dismissible, and does not change artwork or reappear`, async ({ page }, info) => {
    const image = await uploadSquare(page, path, `fit-help-dismiss-${path.slice(1)}-${info.project.name}`);
    const source = await image.getAttribute('src');
    const help = page.getByRole('dialog', { name: 'Having difficulty fitting your artwork?' });
    await expect(help).toHaveCount(0);
    await adjust(page); await adjust(page);
    await page.waitForTimeout(1800); await expect(help).toHaveCount(0);
    await adjust(page); await expect(help).toBeVisible();
    const placement = await page.getByTestId('artwork-selection').first().getAttribute('style');
    await expect(help.getByAltText('Banners On The Fly')).toHaveAttribute('src', '/images/header-logo.png');
    await expect(help.getByRole('button', { name: 'Fit with AI', exact: true })).toHaveCSS('background-color', 'rgb(234, 88, 12)');
    await expect(help.getByRole('button', { name: 'Keep editing', exact: true })).toBeInViewport();
    await expect(help.getByRole('button', { name: 'Close fitting help' })).toBeInViewport();
    expect(await help.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('orange-fit-help.png') });
    await help.getByRole('button', { name: path === '/design' ? 'Keep editing' : 'Close fitting help', exact: true }).click();
    await expect(help).toHaveCount(0);
    await expect(image).toHaveAttribute('src', source!);
    await expect(page.getByTestId('artwork-selection').first()).toHaveAttribute('style', placement!);
    await adjust(page); await adjust(page); await adjust(page);
    await page.waitForTimeout(1800); await expect(help).toHaveCount(0);
  });
}

test('Fit with AI opens the existing preview flow without starting or applying generation', async ({ page }, info) => {
  const image = await uploadSquare(page, '/google-ads-banner', `fit-help-action-${info.project.name}`);
  const source = await image.getAttribute('src');
  await page.route('**/.netlify/functions/ai-designer-status', route => route.fulfill({ json: { ready: true } }));
  let generationRequests = 0;
  page.on('request', request => { if (request.url().includes('/ai-designer-fit')) generationRequests++; });
  await adjust(page); await adjust(page); await adjust(page);
  const help = page.getByRole('dialog', { name: 'Having difficulty fitting your artwork?' });
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Fit with AI', exact: true }).click();
  await expect(help).toHaveCount(0);
  const fitter = page.getByRole('dialog', { name: /Fit your design to/ });
  await expect(fitter).toBeVisible();
  await expect(fitter.getByRole('button', { name: 'Create fitted version' })).toBeEnabled();
  expect(generationRequests).toBe(0);
  await fitter.getByRole('button', { name: 'Keep original', exact: true }).click();
  await expect(image).toHaveAttribute('src', source!);
});
