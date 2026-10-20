import { expect, test } from '@playwright/test';

const routes = [
  '/design', '/google-ads-banner', '/large-banners-fast',
  '/design?product=yard-signs', '/design?product=car-magnets',
  '/yard-signs', '/car-magnets', '/fall-festival-banners',
  '/products', '/products/standard-retractable-banner', '/products/deluxe-retractable-banner', '/products/feather-flags', '/political-signs', '/blog', '/about', '/shipping', '/custom-quote',
];

for (const route of routes) {
  test(`${route} has readable, complete imagery and usable navigation`, async ({ page }, testInfo) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const heading = page.locator('h1:visible').first();
    await expect(heading).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(heading).not.toHaveCSS('text-transform', 'uppercase');
    await expect(page.locator('[data-site-header]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('button', { name: 'Shopping cart', exact: true })).toBeVisible();
    for (const photo of await page.locator('.product-hero-media img:visible, .compact-product-hero img:visible').all()) {
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const headingBox = await heading.boundingBox();
    expect(headingBox!.x).toBeGreaterThanOrEqual(0);
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    if (['/design', '/google-ads-banner'].includes(route) && testInfo.project.name === 'mobile') {
      const hero = page.getByTestId('mobile-banner-hero');
      const photo = hero.locator('img');
      await expect(photo).toHaveCSS('object-fit', 'contain');
      await expect(hero).toContainText('Shipping date');
      await expect(hero).toContainText('Delivery date');
      await expect(hero.locator('[data-hero-delivery-status]')).toHaveAttribute('data-variant', 'featured');
      await expect(page.locator('#order-builder')).not.toContainText('20% off your first order');
    }
    const compact = page.locator('.compact-product-hero:visible');
    if (await compact.count()) {
      const review = compact.getByTestId('google-reviews');
      const photoBox = await compact.locator('.compact-product-photo').boundingBox();
      if(route === '/products/standard-retractable-banner' && testInfo.project.name === 'small-mobile') expect(photoBox!.height).toBeGreaterThanOrEqual(130);
      expect(photoBox!.height).toBeLessThanOrEqual(photoBox!.width * 2 / 3 + 1);
      const bar = page.getByTestId('mobile-subtotal-bar');
      await expect(review).toBeVisible();
      await expect(compact).toContainText('Shipping date');
      await expect(compact).toContainText('Delivery date');
      await expect.poll(async () => {
        const reviewBox = await review.boundingBox();
        const barBox = await bar.count() ? await bar.boundingBox() : null;
        return reviewBox!.y + reviewBox!.height <= (barBox?.y || page.viewportSize()!.height) + 1;
      }).toBe(true);
      await review.getByRole('button', { name: 'Pause Google reviews' }).click();
      await expect(review.getByRole('button', { name: 'Play Google reviews' })).toBeVisible();
    }
    const productRoute = !['/blog','/about','/shipping','/custom-quote'].includes(route);
    if(productRoute) {
      const badge = page.locator('.first-order-badge:visible').first();
      await expect(badge).toBeVisible();
      // Text corners must remain inside the circular border, including the narrow top/bottom chords.
      expect(await badge.evaluate(el => {
        const b=el.getBoundingClientRect(), cx=b.x+b.width/2, cy=b.y+b.height/2, r=b.width/2-3;
        return Array.from(el.children).every(child=>{ const t=child.getBoundingClientRect(); return [[t.left,t.top],[t.right,t.top],[t.left,t.bottom],[t.right,t.bottom]].every(([x,y])=>Math.hypot(x-cx,y-cy)<=r); });
      })).toBe(true);
      const dateCard=page.locator('.delivery-date-card:visible').first();
      await expect(dateCard).toHaveCSS('background-color','rgb(6, 26, 49)');
      await expect(dateCard).toHaveCSS('border-top-color','rgb(255, 106, 0)');
      if(testInfo.project.name.includes('desktop')) {
        const badgeBox=await badge.boundingBox();
        expect(badgeBox!.y+badgeBox!.height).toBeLessThan(page.viewportSize()!.height);
      }
    }
    await page.screenshot({ path: testInfo.outputPath('hero.png') });
    if (await compact.count() && route.startsWith('/products')) {
      await compact.locator('summary').click();
      await expect(compact).toContainText('2 p.m. Pacific / 5 p.m. Eastern');
      await compact.locator('summary').click();
      if(route === '/products') {
        await compact.locator('.compact-product-action a').click();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      } else {
        await expect(page.getByTestId('mobile-subtotal-bar')).toBeVisible();
        await expect(page.getByTestId('mobile-subtotal-bar')).toContainText('20% off applied');
      }
    }
    const start = page.locator('button.product-hero-cta:visible');
    if (await start.count()) {
      await start.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    }
  });
}

test('catalog cards use the complete landscape photo without square padding',async({page},testInfo)=>{
  await page.goto('/products');
  const photo=page.locator('[data-product-card-photo]').first();
  await photo.scrollIntoViewIfNeeded();
  const box=await photo.boundingBox();
  expect(box!.width/box!.height).toBeCloseTo(1.5,1);
  await expect(photo.locator('img')).toHaveCSS('object-fit','contain');
  await expect(photo.locator('.first-order-badge')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('cards.png')});
});

test('specialty quantity updates the same discounted price in the builder and sticky bar',async({page},testInfo)=>{
  await page.goto('/products/standard-retractable-banner');
  await expect(page.getByTestId('specialty-price')).toContainText('20% off applied');
  const amount=async()=>Number((await page.getByTestId('specialty-subtotal').innerText()).replace(/[^0-9.]/g,''));
  const initial=await amount();
  await page.locator('#specialty-qty').fill('3');
  expect(await amount()).toBeCloseTo(initial*3,1);
  const bar=page.getByTestId('mobile-subtotal-bar');
  if(page.viewportSize()!.width<1024) {
    await expect(bar).toContainText(await page.getByTestId('specialty-subtotal').innerText());
    await expect(bar).toContainText('3 ×');
    await expect(bar).toContainText('Free FedEx Next-Day Air shipping');
    const chooser=page.waitForEvent('filechooser');
    await bar.getByRole('button',{name:'Upload artwork'}).click();
    await chooser;
  }
  await page.screenshot({path:testInfo.outputPath('configuration.png')});
});
