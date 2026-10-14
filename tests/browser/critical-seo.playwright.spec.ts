import { expect, test } from '@playwright/test';

const variants = [
  ['/design','Custom Vinyl Banner Designer','https://bannersonthefly.com/design'],
  ['/design?product=yard-signs&utm_source=seo-test','Custom Yard Sign Designer','https://bannersonthefly.com/design?product=yard-signs'],
  ['/design?product=car-magnets','Custom Car Magnet Designer','https://bannersonthefly.com/design?product=car-magnets'],
];
for (const [url,title,canonical] of variants) {
  test(`initial HTML and mounted app agree on product identity: ${url}`, async ({page, request}) => {
    const html = await (await request.get(url)).text();
    expect(html).toContain('<h1');
    expect(html).toContain(title);
    expect(html).toContain(`href="${canonical}"`);
    expect(html).not.toContain('content="noindex');
    const errors:string[]=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.route('**/.netlify/functions/**', route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,cartData:[],enabled:false})}));
    await page.goto(url);
    await expect(page).toHaveTitle(new RegExp(title));
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',canonical);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','index, follow');
    await expect(page.locator('input[type=file]').first()).toBeAttached();
    expect(errors).toEqual([]);
  });
}

test('homepage and support pages retain unique metadata after client mount',async ({page})=>{
  for(const path of ['/','/faq','/terms','/privacy','/about','/shipping','/contact','/custom-quote']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',`https://bannersonthefly.com${path}`);
  }
});

test('paid ad route remains noindex',async ({page})=>{
  await page.goto('/google-ads-banner');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex, nofollow');
});
