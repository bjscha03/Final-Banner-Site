import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

const baseItem = {
  id: 'realistic-checkout-banner', product_type: 'banner', width_in: 72, height_in: 36,
  quantity: 1, material: '13oz', grommets: 'none', pole_pockets: 'none', rope_feet: 0,
  area_sqft: 18, unit_price_cents: 9000, rope_cost_cents: 0, pole_pocket_cost_cents: 0,
  line_total_cents: 9000, final_render_url: 'https://assets.example.test/exact-realistic-art.png',
  created_at: '2026-10-02T12:00:00.000Z',
};

async function setup(page: Page, overrides = {}) {
  const item = { ...baseItem, ...overrides };
  await page.addInitScript((cartItem) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('cart-storage', JSON.stringify({ state: { items: [cartItem], _cartOwnerId: null }, version: 0 }));
  }, item);
  const aw = item.width_in * 10; const ah = item.height_in * 10;
  const portrait = ah > aw;
  const fs = portrait ? 52 : 78;
  const tx = portrait ? 20 : 40; const ty = portrait ? 200 : 135;
  const artwork = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${aw}" height="${ah}" viewBox="0 0 ${aw} ${ah}"><rect width="${aw}" height="${ah}" fill="#0b2340"/><path d="M${aw * .9} 0 H${aw} V${ah} H${aw * .3}Z" fill="#f58220"/><text x="${tx}" y="${ty}" font-family="sans-serif" font-weight="bold" font-size="${fs}" fill="white">GRAND</text><text x="${tx}" y="${ty + fs * 1.12}" font-family="sans-serif" font-weight="bold" font-size="${fs}" fill="white">OPENING</text><text x="${tx}" y="${ty + fs * 2.1}" font-family="sans-serif" font-size="${portrait ? 15 : 24}" fill="white">COME CELEBRATE WITH US!</text><rect x="0" y="0" width="8" height="${ah}" fill="#10b981"/><rect x="${aw - 8}" y="0" width="8" height="${ah}" fill="#e11d48"/></svg>`)).png().toBuffer();
  const writes: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'assets.example.test') return route.fulfill({ status: 200, contentType: 'image/png', body: artwork });
    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (/create-order|capture|send-|stripe-create/.test(url.pathname)) writes.push(url.pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('cart-load') ? { cartData: [item] } : url.pathname.endsWith('paypal-config') ? { enabled: false } : { success: true }) });
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.goto('/checkout');
  return { item, writes };
}

for (const scenario of [
  { name: 'vinyl-no-grommets', width_in: 72, height_in: 36, material: '13oz', grommets: 'none', count: 0 },
  { name: 'portrait-mesh-four-corners', width_in: 36, height_in: 72, material: 'mesh', grommets: '4-corners', count: 4 },
  { name: 'vinyl-spaced-grommets', width_in: 72, height_in: 36, material: '18oz_double', grommets: 'every-2-3ft', count: 10 },
  { name: 'large-twenty-foot-banner', width_in: 240, height_in: 120, material: '13oz', grommets: '4-corners', count: 4 },
]) {
  test(`${scenario.name}: artwork, hardware, enlargement and close`, async ({ page }, testInfo) => {
    const { writes } = await setup(page, scenario);
    const preview = page.locator('[data-realistic-preview]:visible').first();
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-realistic-artwork-ready="true"]')).toHaveCount(1);
    await expect(preview.locator('[data-realistic-grommet]')).toHaveCount(scenario.count);
    await expect(preview.locator('[data-realistic-anchor]')).toHaveCount(scenario.count);
    const surface = await preview.locator('[data-realistic-surface]').boundingBox();
    expect(surface!.width / surface!.height).toBeCloseTo(scenario.width_in / scenario.height_in, 2);
    await preview.screenshot({ path: testInfo.outputPath(`${scenario.name}-thumbnail.png`) });
    await preview.getByRole('button').click();
    const lightbox = page.locator('[data-realistic-lightbox]');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator('[data-realistic-artwork-ready="true"]')).toHaveCount(1);
    await expect(lightbox.locator('[data-realistic-grommet]')).toHaveCount(scenario.count);
    await expect(lightbox.locator('[data-banner-dimensions]')).toContainText(`${scenario.width_in / 12} ft × ${scenario.height_in / 12} ft`);
    await expect(lightbox.locator('[data-banner-dimensions]')).toContainText(`(${scenario.width_in}″ × ${scenario.height_in}″)`);
    await expect(lightbox.locator('[data-realistic-size-reference]')).toHaveCount(0);
    await expect(lightbox).not.toContainText('person');
    await expect(lightbox.locator('img').first()).toHaveAttribute('src', baseItem.final_render_url);
    await expect(lightbox.locator('[data-preview-bleed-compensated]')).toHaveAttribute('data-preview-bleed-compensated', 'false');
    await expect(lightbox.locator('[data-realistic-scene]')).toHaveAttribute('data-realistic-material', scenario.material === 'mesh' ? 'mesh' : 'vinyl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const maskAlpha = await lightbox.locator('[data-realistic-surface]').evaluate(async (surface) => {
      const mask = getComputedStyle(surface).maskImage || getComputedStyle(surface).webkitMaskImage;
      const match = mask.match(/url\(["']?(.*?)["']?\)$/);
      if (!match) throw new Error('Material mask missing');
      const image = new Image(); image.src = match[1]; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 360;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 360, 360);
      const pixels = ctx.getImageData(80, 80, 200, 200).data;
      let sum = 0; for (let i = 3; i < pixels.length; i += 4) sum += pixels[i];
      for (const path of ['/images/preview/brick-wall.webp', '/images/preview/vinyl-surface.webp']) {
        const asset = new Image(); asset.src = path; await asset.decode();
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return sum / (pixels.length / 4);
    });
    if (scenario.material === 'mesh') {
      expect(maskAlpha).toBeGreaterThan(150);
      expect(maskAlpha).toBeLessThan(235);
      const surfaceImage = sharp(await lightbox.locator('[data-realistic-surface]').screenshot());
      const { width = 0, height = 0 } = await surfaceImage.metadata();
      const patch = await surfaceImage.extract({ left: Math.round(width * .3), top: Math.round(height * .1), width: 12, height: 12 }).toBuffer();
      const color = await sharp(patch).stats();
      // The wall must actually show through the navy print, not merely exist
      // in an unused mask URL. Catch CSS-mask rendering failures in Safari.
      expect(color.channels[0].mean).toBeGreaterThan(20);
      expect(color.channels[0].mean).toBeLessThan(100);
    }
    else expect(maskAlpha).toBeGreaterThan(250);
    await lightbox.screenshot({ path: testInfo.outputPath(`${scenario.name}.png`) });
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);
    await expect(preview.getByRole('button')).toBeFocused();
    await preview.getByRole('button').click();
    await page.getByRole('button', { name: 'Close preview', exact: true }).click();
    await expect(lightbox).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test('mobile review dialog supports a nested realistic preview without closing the order', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 1440) >= 1024, 'Mobile order dialog');
  await setup(page, { grommets: 'top-corners', pole_pockets: 'bottom', pole_pocket_size: '3', rope_feet: 6, rope_placement: 'top' });
  await page.getByRole('button', { name: 'Edit order', exact: true }).click();
  const order = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Review your order' }) });
  await order.getByRole('button', { name: /Enlarge realistic preview/ }).click();
  const lightbox = page.locator('[data-realistic-lightbox]');
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('[data-realistic-grommet]')).toHaveCount(2);
  await expect(lightbox.locator('[data-realistic-pocket="bottom"]')).toHaveCount(1);
  await expect(lightbox.locator('[data-realistic-rope="top"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);
  await expect(order).toBeVisible();
  await order.getByRole('button', { name: 'Back to checkout', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('artwork load failure does not block checkout or display substituted artwork', async ({ page }) => {
  await setup(page, { final_render_url: 'https://assets.example.test/missing.png' });
  await page.route('https://assets.example.test/missing.png', route => route.fulfill({ status: 404 }));
  await page.reload();
  const preview = page.locator('[data-realistic-preview]:visible').first();
  await expect(preview.locator('[data-preview-failed="true"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(preview).toContainText('Preview unavailable');
  await expect(page.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible();
  await preview.getByRole('button').click();
  await expect(page.locator('[data-realistic-lightbox]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-realistic-lightbox]')).toHaveCount(0);
});
