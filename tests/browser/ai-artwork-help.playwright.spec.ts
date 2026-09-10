import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

test('expanded prompt stays above the copy button at narrow and desktop widths', async ({ page }) => {
  await installDesignerHarness(page, 'ai-help-layout');
  for (const width of [320, 390, 667, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/google-ads-banner', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: "6' × 3' — Most popular — 25% off automatically", exact: true }).click();
    await page.getByRole('button', { name: 'Open AI artwork help' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[data-ai-prompt]')).not.toBeVisible();
    await dialog.getByText('View the full prompt', { exact: true }).click();
    for (const mode of ['Create New Artwork with AI', 'Fix Existing Artwork with AI']) {
      await dialog.getByRole('tab', { name: mode, exact: true }).click();
      const prompt = dialog.locator('[data-ai-prompt]');
      await expect(prompt).toBeVisible();
      await expect(prompt).toHaveCSS('overflow-y', 'auto');
      const promptBox = await prompt.boundingBox();
      const copyBox = await dialog.getByRole('button', { name: 'Copy Prompt', exact: true }).boundingBox();
      expect(promptBox!.y + promptBox!.height).toBeLessThan(copyBox!.y);
      expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
});

async function installDesignerHarness(page: Page, scenario: string) {
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
}

test('AI artwork help updates prompts, copies, warns conservatively, and preserves the upload', async ({ page }, testInfo) => {
  await installDesignerHarness(page, `ai-help-${testInfo.project.name}`);
  await page.goto('/design?product=banner', { waitUntil: 'domcontentloaded' });

  const helpButton = page.getByRole('button', { name: 'Open AI artwork help' });
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Choose your banner size above first');
  await dialog.getByRole('button', { name: 'Close' }).click();

  const size = page.locator('#size-section');
  await size.getByRole('button', { name: "6' × 3' — Most popular — 25% off automatically", exact: true }).click();
  await helpButton.click();
  await expect(dialog.getByText('72 × 36 inches', { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('72:36 shape');
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('high-quality JPEG/JPG');
  await dialog.getByPlaceholder(/Grand opening this Saturday/).fill('Grand opening this Saturday');
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('Grand opening this Saturday');
  await dialog.getByRole('button', { name: 'Copy Prompt' }).click();
  await expect(dialog.getByRole('button', { name: 'Copied!' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await size.getByRole('button', { name: "8' × 3' — 25% off automatically", exact: true }).click();
  await helpButton.click();
  await expect(dialog.getByText('96 × 36 inches', { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('96:36 shape');
  await dialog.getByRole('button', { name: 'Close' }).click();

  await size.getByRole('button', { name: "6' × 3' — Most popular — 25% off automatically", exact: true }).click();
  const squareArtwork = await sharp({
    create: { width: 900, height: 900, channels: 3, background: '#1d4ed8' },
  }).jpeg().toBuffer();
  const uploader = page.getByRole('button', { name: /Upload your artwork.*PNG, JPG, or PDF/i }).first();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), uploader.click()]);
  await chooser.setFiles({ name: 'square-artwork.jpg', mimeType: 'image/jpeg', buffer: squareArtwork });

  const preview = page.getByAltText('Uploaded artwork preview').first();
  await expect(preview).toBeVisible({ timeout: 30_000 });
  const previewSource = await preview.getAttribute('src');
  const warning = page.locator('[data-ai-whitespace-warning]');
  await expect(warning).toContainText('may leave white space');
  await warning.getByRole('button', { name: 'Fix it with AI' }).click();
  await expect(dialog.getByRole('tab', { name: 'Fix Existing Artwork with AI' })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('72 × 36 inch vinyl banner');
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('Do not give me a PNG');
  await dialog.getByRole('button', { name: 'Close' }).click();

  await expect(preview).toHaveAttribute('src', previewSource || '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('Google Ads banner page serves the same dimension-aware AI artwork help', async ({ page }, testInfo) => {
  await installDesignerHarness(page, `ai-help-landing-${testInfo.project.name}`);
  await page.goto('/google-ads-banner?product=banner', { waitUntil: 'domcontentloaded' });

  const size = page.locator('#size-section');
  await size.getByRole('button', { name: "6' × 3' — Most popular — 25% off automatically", exact: true }).click();
  await page.getByRole('button', { name: 'Open AI artwork help' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('72 × 36 inches', { exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Fix Existing Artwork with AI' }).click();
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('72:36 shape');
  await expect(dialog.locator('[data-ai-prompt]')).toContainText('high-quality JPEG/JPG');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
