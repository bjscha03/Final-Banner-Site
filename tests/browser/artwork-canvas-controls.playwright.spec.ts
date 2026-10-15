import { expect, test, type Page, type Locator } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

test.use({ video: { mode: 'on', size: { width: 1440, height: 1000 } } });
const close = (a: number, b: number, tolerance = 1) => expect(Math.abs(a-b)).toBeLessThan(tolerance);
async function box(el: Locator) { return (await el.boundingBox())!; }
async function drag(page: Page, target: Locator, dx: number, dy: number) {
  const b = await box(target);
  if ((page.viewportSize()?.width || 1440) < 600 && page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const x = b.x+b.width/2, y = b.y+b.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for (let i=1;i<=12;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
  } else {
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
    await page.mouse.down();
    await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:12});
    await page.mouse.up();
  }
}
async function upload(page: Page, scenario: string, artwork: Buffer, name = 'artwork.png') {
  await page.context().addCookies([{name:'compact_browser_scenario',value:scenario,url:'http://127.0.0.1:4175'}]);
  await page.goto('/google-ads-banner',{waitUntil:'domcontentloaded'});
  const chooser = page.waitForEvent('filechooser');
  if ((page.viewportSize()?.width || 1440)<1024) await page.getByTestId('mobile-subtotal-bar').getByRole('button',{name:'Upload artwork',exact:true}).click();
  else await page.locator('#upload-section').getByRole('button',{name:/Upload your artwork/}).click();
  await (await chooser).setFiles({name,mimeType:'image/png',buffer:artwork});
  const image = page.getByAltText('Uploaded artwork preview').first();
  await expect(image).toBeVisible();
  await expect(page.getByTestId('artwork-selection')).toBeVisible();
  await page.getByTestId('artwork-workspace').scrollIntoViewIfNeeded();
  // A customer who has already opened AI fit should not be prompted during
  // manual editing. Exercise that path before the exhaustive resize/undo loop;
  // the dedicated fitting-help suite covers spontaneous prompts and dismissal.
  await page.getByRole('button', { name: 'Fit my banner with AI', exact: true }).click();
  const fitter = page.getByRole('dialog', { name: /Fit your design to/ });
  await expect(fitter).toBeVisible();
  await fitter.getByRole('button', { name: 'Keep original', exact: true }).click();
  await expect(fitter).toHaveCount(0);
  await page.locator('[data-artwork-image="true"]').first().click();
  await expect(page.getByTestId('artwork-selection')).toBeVisible();
  await page.getByTestId('artwork-workspace').scrollIntoViewIfNeeded();
  return image;
}
async function patternedArtwork() {
  return sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#e0f2fe"/><rect x="0" width="200" height="600" fill="#fb7185"/><rect x="1000" width="200" height="600" fill="#1d4ed8"/><circle cx="600" cy="300" r="160" fill="#facc15"/><path d="M600 190 L695 355 L505 355 Z" fill="#0f172a"/></svg>')).png().toBuffer();
}

test('all eight handles, crop, snap, undo and deletion work in the actual banner designer', async ({page},info) => {
  test.setTimeout(180_000);
  const original = await patternedArtwork();
  const scenario = `canvas-${info.project.name}`;
  const image = await upload(page,scenario,original);
  const canvas = page.getByTestId('artwork-canvas');
  const selection = page.getByTestId('artwork-selection');
  const undo = page.getByRole('button',{name:'Undo artwork change',exact:true});
  await expect(canvas.locator('[data-handle]')).toHaveCount(8);
  await expect(canvas).toHaveCSS('touch-action','none');
  await expect(page.locator('#upload-section .grommet-overlay')).toHaveCount(0);
  const toolbarBox = await box(page.getByRole('toolbar',{name:'Selected artwork',exact:true}));
  const topHandle = await box(canvas.locator('[data-handle=t]'));
  expect(toolbarBox.y+toolbarBox.height).toBeLessThanOrEqual(topHandle.y);
  for (const action of await page.getByRole('toolbar',{name:'Selected artwork',exact:true}).getByRole('button').all()) {
    const target = await box(action);
    expect(target.x).toBeGreaterThanOrEqual(toolbarBox.x);
    expect(target.x+target.width).toBeLessThanOrEqual(toolbarBox.x+toolbarBox.width);
  }
  if (info.project.name === 'webkit-iphone15pro-landscape') {
    const footer = await box(page.getByTestId('mobile-subtotal-bar'));
    const header = await box(page.locator('[data-site-header]'));
    expect(toolbarBox.y).toBeGreaterThanOrEqual(header.y+header.height);
    for (const handle of await canvas.locator('[data-handle]').all()) {
      const target = await box(handle);
      expect(target.y+target.height).toBeLessThanOrEqual(footer.y);
    }
  }
  const c = await box(canvas);
  await drag(page,canvas.locator('[data-handle=br]'),-c.width*0.25,-c.height*0.25);
  for (const handle of ['tl','tr','bl','br']) {
    const before = await box(selection);
    await drag(page,canvas.locator(`[data-handle=${handle}]`),handle.includes('r') ? -12 : 12,handle.includes('b') ? -6 : 6);
    const after = await box(selection);
    close(after.width/after.height,before.width/before.height,0.005);
    close(after.x+(handle.includes('l')?after.width:0),before.x+(handle.includes('l')?before.width:0));
    close(after.y+(handle.includes('t')?after.height:0),before.y+(handle.includes('t')?before.height:0));
    expect(after.width).toBeLessThan(before.width);
    await undo.click();
    close((await box(selection)).width,before.width);
  }
  // Keep this isolated crop check away from the center snap zone even when the
  // landscape canvas is small; magnetic alignment is exercised below.
  const cropStep = Math.min(12,c.height/20);
  for (const handle of ['t','r','b','l']) {
    const before = await box(selection), source = await box(image);
    await drag(page,canvas.locator(`[data-handle=${handle}]`),handle==='l'?cropStep:-cropStep,handle==='t'?cropStep:-cropStep);
    const after = await box(selection), sourceAfter = await box(image);
    close(sourceAfter.width,source.width);close(sourceAfter.height,source.height);close(sourceAfter.x,source.x);close(sourceAfter.y,source.y);
    close(after.width,before.width-(['l','r'].includes(handle)?cropStep:0));
    close(after.height,before.height-(['t','b'].includes(handle)?cropStep:0));
    await expect(image).toHaveCSS('clip-path',/inset/);
    await undo.click();
  }
  await drag(page,canvas.locator('[data-handle=r]'),-40,0);
  await page.getByRole('button',{name:'Crop artwork',exact:true}).click();
  const cropped = await box(selection), source = await box(image);
  await drag(page,selection,-15,0);
  close((await box(selection)).x,cropped.x);close((await box(selection)).width,cropped.width);
  expect((await box(image)).x).toBeLessThan(source.x);
  await drag(page,canvas.locator('[data-handle=br]'),25,12.5);
  close((await box(selection)).width,cropped.width);
  await page.getByRole('button',{name:'Done cropping',exact:true}).click();
  await drag(page,selection,25,18);
  const moved = await box(selection), area = await box(canvas);
  await page.mouse.move(moved.x+moved.width/2,moved.y+moved.height/2);
  await page.mouse.down();
  await page.mouse.move(area.x+area.width/2+3,area.y+area.height/2+3,{steps:20});
  await expect(canvas.getByTestId('artwork-guide-x')).toBeVisible();
  await expect(canvas.getByTestId('artwork-guide-y')).toBeVisible();
  await page.screenshot({path:info.outputPath('center-snapping.png')});
  await page.mouse.up();
  await expect(canvas.locator('[data-testid^=artwork-guide]')).toHaveCount(0);
  const centered = await box(selection);
  close(centered.x+centered.width/2,area.x+area.width/2);close(centered.y+centered.height/2,area.y+area.height/2);
  await page.getByRole('button',{name:'Delete selected artwork',exact:true}).click();
  await expect(image).toHaveCount(0);
  await page.getByRole('button',{name:'Undo delete',exact:true}).click();
  await expect(image).toBeVisible();
  close((await box(selection)).width,centered.width);
  if ((page.viewportSize()?.width || 1440) >= 1024) {
    await page.keyboard.press('Delete');
    await expect(image).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(image).toBeVisible();
  }
  await page.getByRole('button',{name:'Fit my banner with AI',exact:true}).click();
  await expect(page.getByRole('dialog',{name:/Fit your design to/})).toBeVisible();
  await page.keyboard.press('Escape');
  const mobile = (page.viewportSize()?.width || 1440)<1024;
  await page.locator('#size-section').getByRole('button',{name:mobile ? "8' × 4' — $111.20" : "8' × 4' — Bigger presence",exact:true}).click();
  await expect(image).toBeVisible();
  await page.locator('#size-section').getByRole('button',{name:mobile ? "6' × 3' — $72.00" : "6' × 3' — Everyday displays",exact:true}).click();
  if (mobile) {
    await page.getByTestId('mobile-subtotal-bar').getByRole('button',{name:'Review & finish',exact:true}).click();
    await expect(page.getByAltText('Your artwork with the selected finishing')).toHaveCSS('clip-path',/inset/);
    await page.getByTestId('mobile-finishing-step').getByRole('button',{name:/No hanging hardware/}).click();
  } else {
    await page.getByRole('button',{name:'Choose finishing',exact:true}).click();
    await page.locator('#options-section').getByRole('button',{name:/No hanging hardware/}).click();
  }
  await page.getByRole('button',{name:'Add & design another',exact:true}).filter({visible:true}).click();
  await expect(image).toHaveCount(0,{timeout:60000});
  const items = await page.evaluate(()=>JSON.parse(localStorage.getItem('cart-storage')||'{}').state.items);
  expect(items).toHaveLength(1);
  const item = items[0];
  expect(item.placement_preview.crop.width).toBeLessThan(1);
  expect(JSON.parse(item.canvas_state_json).canonicalComposition.transform.crop).toEqual(item.placement_preview.crop);
  expect((await (await page.request.get(`http://127.0.0.1:4175/__compact-test-asset?scenario=${scenario}&kind=original`)).body()).equals(original)).toBe(true);
  // Reload the saved cart item into a fresh page: no module-level geometry cache.
  await page.goto(`/google-ads-banner?editItem=${item.id}`);
  await expect(page.getByAltText('Uploaded artwork preview')).toBeVisible();
  await expect(page.getByAltText('Uploaded artwork preview')).toHaveCSS('clip-path',/inset/);
});

for (const kind of ['photo','logo','transparent','wide']) {
  test(`uploaded ${kind} keeps image quality through manipulation`, async ({page},info) => {
    test.skip(!['chromium-1440x900','chromium-pixel8-portrait','webkit-iphone15pro-portrait'].includes(info.project.name),'Representative desktop and phone coverage');
    let input: Buffer;
    if (kind==='photo') input = await sharp(await readFile('public/images/email/september-grand-opening-banner.jpg')).png().toBuffer();
    else if (kind==='logo') input = await readFile('public/images/header-logo.png');
    else input = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${kind==='wide'?2400:900}" height="${kind==='wide'?200:900}"><circle cx="100" cy="100" r="80" fill="#9333ea"/><path d="M100 30 L155 130 L45 130 Z" fill="#facc15"/></svg>`)).png().toBuffer();
    const scenario=`${kind}-${info.project.name}`;
    const image=await upload(page,scenario,input,`${kind}.png`);
    const canvas=page.getByTestId('artwork-canvas');
    const before=await box(image);
    for (const handle of kind === 'wide' ? ['tl','tr','bl','br'] : ['br']) {
      await drag(page,canvas.locator(`[data-handle=${handle}]`),handle.includes('r')?-10:10,handle.includes('b')?-5:5);
      const after=await box(image);
      // Browser layout quantizes tiny rendered heights to fractional CSS pixels.
      close(after.height,after.width*before.height/before.width,0.05);
      expect(after.width).toBeLessThan(before.width);
      await page.getByRole('button',{name:'Undo artwork change',exact:true}).click();
      close((await box(image)).width,before.width);
    }
    await page.screenshot({path:info.outputPath(`${kind}-artwork.png`)});
  });
}

test('native touch drag stays selected and does not scroll the page',async ({page,context},info)=>{
  test.skip(info.project.name!=='chromium-pixel8-portrait','Native touch input is exercised through Chromium CDP on the phone project');
  await upload(page,`native-touch-${info.project.name}`,await patternedArtwork());
  const cdp=await context.newCDPSession(page);
  const selected=page.getByTestId('artwork-selection');
  const b=await box(selected);
  const before=await page.evaluate(()=>window.scrollY);
  const x=b.x+b.width/2,y=b.y+b.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let i=1;i<=12;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*2,y:y+i,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(selected).toBeVisible();
  close((await box(selected)).x,b.x+24);
  close(await page.evaluate(()=>window.scrollY),before);
});
