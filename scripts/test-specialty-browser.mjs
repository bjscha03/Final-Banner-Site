/** Local integration checks with intercepted upload/AI transports; never a live-provider test. */
import {createServer} from 'vite';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {PDFDocument,rgb} from 'pdf-lib';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname;
const out=process.env.BOF_QA_DIR||'/tmp/bof-browser-qa';await mkdir(out,{recursive:true});
process.env.VITE_AI_BANNER_ENABLED='true';
// Exercise the application's existing no-payment preview mode on a local host.
// Requests are routed to this Vite server; no hosted preview or real payment is used.
const qaHost=process.env.BOF_QA_TEST_CHECKOUT?'deploy-preview-0--bof-local.netlify.app':'127.0.0.1';
const localPreviewPassword='local-browser-qa-fixture';
if(process.env.BOF_QA_TEST_CHECKOUT)process.env.VITE_PREVIEW_ACCESS_PASSWORD=localPreviewPassword;
// A secure test origin keeps WebCrypto available for upload/AI identities.
const origin=`${process.env.BOF_QA_TEST_CHECKOUT?'https':'http'}://${qaHost}:8096`;
const server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:8096,allowedHosts:[qaHost]}});await server.listen();
const browser=await chromium.launch({...(process.env.BOF_CHROMIUM_PATH?{executablePath:process.env.BOF_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu',`--host-resolver-rules=MAP ${qaHost} 127.0.0.1`]});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[],uploads=new Map(),jobs=new Map(),aiRequests=[];
if(process.env.BOF_QA_TEST_CHECKOUT)await page.route(origin+'/**',async route=>{
 try{await route.fulfill({response:await route.fetch({url:route.request().url().replace(origin,'http://127.0.0.1:8096'),maxRetries:2})});}
 catch{await route.abort().catch(()=>{});} // Navigation can cancel outstanding module requests.
});
page.on('pageerror',e=>errors.push(e.message));
const fixture=await sharp(Buffer.from('<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="1000" fill="#123b42"/><circle cx="400" cy="275" r="135" fill="#dd9b52"/><text x="400" y="570" text-anchor="middle" font-size="80" font-family="sans-serif" fill="white">MARKET</text><text x="400" y="680" text-anchor="middle" font-size="36" font-family="sans-serif" fill="white">BROWSER QA FIXTURE</text></svg>')).png().toBuffer();
const json=(r,obj)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
await page.route('https://res.cloudinary.com/**',async route=>{
 const url=route.request().url();const key=[...uploads.keys()].find(k=>url.includes(k));const file=key?uploads.get(key):null;
 return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:file?.type||'image/png',body:file?.bytes||fixture});
});
await page.route('https://www.b2sign.com/**',r=>r.fulfill({status:200,contentType:'image/png',body:fixture}));
await page.route('**/.netlify/functions/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 if(path.endsWith('/upload-file')){
  const form=await new Response(req.postDataBuffer(),{headers:{'Content-Type':req.headers()['content-type']}}).formData();
  const file=form.get('file'),bytes=Buffer.from(await file.arrayBuffer()),id='qa-'+createHash('sha256').update(bytes).digest('hex').slice(0,20);
  uploads.set(id,{bytes,type:file.type,name:file.name});const meta=file.type==='application/pdf'?{}:await sharp(bytes).metadata();
  return json(route,{secure_url:`https://res.cloudinary.com/test/image/upload/${id}.${file.type==='application/pdf'?'pdf':'png'}`,public_id:id,resource_type:'image',format:file.type==='application/pdf'?'pdf':'png',bytes:bytes.length,width:meta.width,height:meta.height});
 }
 if(path.endsWith('/ai-designer-status'))return json(route,{authorized:true,sessionKey:'qa-session',ready:true,enabled:true});
 if(path.endsWith('/ai-designer-fit')){
  const body=req.postDataJSON();aiRequests.push(body);const h=1200,w=Math.round(h*body.widthIn/body.heightIn);const buf=await sharp(fixture).resize(w,h,{fit:'contain',background:'#123b42'}).jpeg().toBuffer();
  jobs.set('fit-qa',{status:'completed',fit:{id:'qa-fit',productType:body.productType,widthIn:body.widthIn,heightIn:body.heightIn,widthPx:w,heightPx:h,imageBase64:buf.toString('base64'),mimeType:'image/jpeg',verification:{passed:true,canApply:true,originalText:['MARKET'],detectedText:['MARKET'],missing:[],added:[],issues:[],confidence:1},diagnostics:{model:'mock',durationMs:1}}});
  return json(route,{jobRef:'fit-qa',pollAfterMs:1});
 }
 if(path.endsWith('/ai-designer-job'))return json(route,jobs.get(req.postDataJSON().jobRef)||{status:'failed',message:'Unknown QA job'});
 if(path.endsWith('/ai-designer-worker-background'))return json(route,{ok:true});
 return json(route,{});
});
async function check(name,task){if(process.env.BOF_QA_FILTER&&!new RegExp(process.env.BOF_QA_FILTER).test(name))return;await task();checks.push(name);console.log('PASS',name);}
async function open(slug){
 await page.goto(origin+'/products/'+slug);
 await page.locator('#specialty-variant, input[type=password]').first().waitFor();
 if(process.env.BOF_QA_TEST_CHECKOUT&&await page.locator('input[type=password]').isVisible()){
  await page.locator('input[type=password]').fill(localPreviewPassword);
  await page.locator('form button[type=submit]').click();
 }
 await page.locator('#specialty-variant').waitFor();
}
async function uploadArt(){await page.locator('#specialty-artwork input[type=file]').setInputFiles({name:'qa-market.png',mimeType:'image/png',buffer:fixture});await page.getByRole('button',{name:'Replace artwork',exact:true}).waitFor();await page.getByLabel('I checked the', {exact:false}).waitFor({timeout:30000});}
try{
 await check('all 19 product pages and 58 variants render valid supplier selections',async()=>{
  const catalog=JSON.parse(await readFile(root+'shared/specialty-catalog.json','utf8'));
  for(const product of catalog){await open(product.slug);for(const variant of product.variants){await page.locator('#specialty-variant').selectOption(variant.id);assert.equal(await page.locator('select').evaluateAll(els=>els.some(el=>!el.value||![...el.options].some(o=>o.value===el.value))),false,variant.id);assert.doesNotMatch(await page.getByTestId('specialty-price').innerText(),/Price coming soon/);assert.match(await page.getByTestId('specialty-subtotal').innerText(),/^\$[1-9]/);}}
 });
 await check('premium size selection changes the branded product photograph',async()=>{
  await open('premium-retractable-banner');const hero=page.locator('button[aria-label^="Enlarge"] img').first();const before=await hero.getAttribute('src');await page.locator('#specialty-variant').selectOption('premium-retractable-banner-3');assert.notEqual(await hero.getAttribute('src'),before);
 });
 await check('catalog shows Lexington prices and free shipping; retractable defaults to the 189 dollar kit',async()=>{
  await open('standard-retractable-banner');
  assert.equal(await page.locator('#specialty-variant').inputValue(),'standard-retractable-banner-3');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$189.00');
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.locator('#specialty-qty').fill('2');assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$378.00');
  await page.locator('#specialty-variant').selectOption('standard-retractable-banner-1');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$159.00');
  assert.match(await page.getByTestId('specialty-price').innerText(),/Proposed price/);
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.goto(origin+'/products');await page.getByRole('heading',{name:'Make the entire space yours.'}).waitFor();
  for(const [slug,price] of [['standard-retractable-banner','$159.00'],['feather-flags','$175.00'],['standard-table-throws','$165.00'],['custom-event-tents','$755.00'],['step-and-repeat-backdrop','$465.00'],['aluminum-composite-signs','$26.00']]){
   const card=page.locator(`a[href="/products/${slug}"]`).filter({has:page.locator('h3')});
   assert.ok((await card.innerText()).includes(price),slug);assert.match(await card.innerText(),/Free Next Day Air shipping/);
  }
  const unpriced=page.locator('a[href="/products/acrylic-signs"]').filter({has:page.locator('h3')});
  assert.match(await unpriced.innerText(),/\$90\.00/);assert.doesNotMatch(await unpriced.innerText(),/Price coming soon/);assert.match(await unpriced.innerText(),/Free Next Day Air/);
  await page.locator('#stands').screenshot({path:out+'/catalog-prices.png'});
 });
 await check('flag size, options and quantities update the price while shipping remains free',async()=>{
  await open('feather-flags');const subtotal=page.getByTestId('specialty-subtotal');
  assert.equal(await subtotal.innerText(),'$175.00');
  assert.match(await page.locator('#option-sides option[value="2"]').innerText(),/\+\$70\.00/);
  assert.match(await page.locator('#option-flaghardware option[value="PB"]').innerText(),/\+\$30\.00/);
  await page.locator('#option-sides').selectOption('2');
  await page.locator('#option-flaghardware').selectOption('PB');
  await page.locator('#option-carrybag').selectOption('1');
  assert.equal(await subtotal.innerText(),'$295.00');
  await page.locator('#specialty-qty').fill('3');assert.equal(await subtotal.innerText(),'$885.00');
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.locator('#specialty-variant').selectOption('feather-flags-2');
  assert.equal(await subtotal.innerText(),'$585.00');
 });
 await check('tent and ACM prices follow their selected accessories and sizes',async()=>{
  await open('custom-event-tents');await page.locator('#option-tent_sandbag').selectOption('1');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$815.00');
  await page.locator('#option-tent_full_wall').selectOption('A');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$1064.00');
  assert.match(await page.getByTestId('specialty-price').innerText(),/Proposed price/);
  assert.doesNotMatch(await page.getByTestId('specialty-price').innerText(),/Price coming soon/);
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await open('aluminum-composite-signs');await page.getByRole('button',{name:'24 × 36 in · $90.00',exact:true}).click();
  await page.locator('#option-sides').selectOption('2');await page.locator('#specialty-qty').fill('2');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$220.00');
 });
 await check('proposed custom rates, replacements and quantity use the same price on mobile',async()=>{
  await open('acrylic-signs');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$121.00');
  await page.locator('#option-hardware').selectOption('acrylic');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$96.00');
  assert.doesNotMatch(await page.getByTestId('specialty-price').innerText(),/\+\$-/);
  await page.getByLabel('Width (in)',{exact:true}).fill('6');await page.getByLabel('Height (in)',{exact:true}).fill('6');
  await page.locator('#specialty-qty').fill('3');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$195.00');
  await page.setViewportSize({width:390,height:844});
  await open('standard-retractable-banner');await page.locator('#option-hardware').selectOption('p');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$119.00');
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.getByTestId('specialty-price').screenshot({path:out+'/proposed-mobile-price.png'});
  await open('aluminum-signs');await page.locator('#option-size').selectOption('12x18');
  assert.equal(await page.getByLabel('Width (in)',{exact:true}).inputValue(),'12');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$45.00');
  await page.getByLabel('Width (in)',{exact:true}).fill('20');
  assert.equal(await page.locator('#option-size').inputValue(),'custom_size');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$50.00');
  await open('display-posters');await page.getByLabel('Height (in)',{exact:true}).fill('36');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$51.00');
  await page.setViewportSize({width:1280,height:900});
 });
 await check('flag studio opens with its product and exact print size',async()=>{
  await open('feather-flags');await page.getByRole('button',{name:'Create with AI',exact:true}).click();await page.getByTestId('ai-product-example').waitFor();assert.equal(await page.locator('.ai-studio-banner-showcase').count(),0);assert.match(await page.getByTestId('ai-workspace').innerText(),/25 in × 80 in/);await page.getByRole('button',{name:'Back to order'}).click();
 });
 await check('flag upload, Fit with AI, preview approval and cart preserve exact identity',async()=>{
  await uploadArt();await page.getByRole('button',{name:'Fit my design with AI',exact:true}).click();await page.getByRole('button',{name:'Create fitted version',exact:true}).click();await page.getByText('Automated wording and design checks passed',{exact:true}).waitFor();assert.equal(aiRequests[0].productType,'specialty:feather-flags:feather-flags-1:front');assert.deepEqual([aiRequests[0].widthIn,aiRequests[0].heightIn],[25,80]);await page.getByLabel('I checked the wording, logos and images and want to use this layout.',{exact:true}).check();await page.getByRole('button',{name:'Use this version',exact:true}).click();await page.getByRole('button',{name:'Restore original',exact:true}).waitFor();await page.getByLabel('I checked the front artwork', {exact:false}).check();await page.getByRole('button',{name:'Add to cart',exact:true}).click();await page.waitForURL('**/checkout',{timeout:60000});await page.locator('[aria-label="Your artwork on Feather Flags"]').first().waitFor();await page.reload();await page.locator('[aria-label="Your artwork on Feather Flags"]').first().waitFor();await page.screenshot({path:out+'/flag-cart.png',fullPage:true});
  const item=await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');return useCartStore.getState().items.find(i=>i.product_type==='specialty')});assert.equal(item.specialty_config.panels[0].composition.widthIn,25);assert.ok(item.specialty_config.panels[0].originalArtwork);assert.ok(item.specialty_config.panels[0].productionUrl.endsWith('.pdf'));
  const totals=page.getByTestId('checkout-order-totals');assert.match(await totals.innerText(),/\$175\.00/);assert.match(await totals.innerText(),/NEW20 \(20% off\)/);assert.match(await totals.innerText(),/\$148\.40/);assert.match(await totals.innerText(),/FREE/);assert.doesNotMatch(await totals.innerText(),/Pending|Not yet calculated/);
  if(process.env.BOF_QA_TEST_CHECKOUT)assert.equal(await page.getByRole('button',{name:'Place Test Order — No Payment',exact:true}).isEnabled(),true);
 });
 await check('saved cart reprices options and quantity and blocks only unavailable configurations',async()=>{
  const original=await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');const s=useCartStore.getState(),item=s.items.find(i=>i.specialty_config?.productSlug==='feather-flags');if(!item)throw new Error('Run flag upload before this cart check.');s.replaceItemsFromRecovery([{...item,quantity:2,unit_price_cents:1,line_total_cents:2,specialty_config:{...item.specialty_config,priceVerified:false,options:{...item.specialty_config.options,flaghardware:'PB',carrybag:'1'}}}]);return item;});
  await page.reload();const totals=page.getByTestId('checkout-order-totals');await totals.waitFor();
  assert.match(await totals.innerText(),/\$450\.00/);assert.match(await totals.innerText(),/NEW20 \(20% off\)/);assert.match(await totals.innerText(),/\$381\.60/);assert.match(await totals.innerText(),/FREE/);
  if(process.env.BOF_QA_TEST_CHECKOUT)assert.equal(await page.getByRole('button',{name:'Place Test Order — No Payment',exact:true}).isEnabled(),true);
  await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');const item=useCartStore.getState().items[0];useCartStore.getState().replaceItemsFromRecovery([{...item,specialty_config:{...item.specialty_config,priceVerified:true,options:{...item.specialty_config.options,sides:'invalid'}}}]);});
  await page.reload();await totals.waitFor();assert.match(await totals.innerText(),/Pending/);assert.match(await totals.innerText(),/FREE/);
  assert.match(await page.getByTestId('specialty-pending-price').first().innerText(),/Price coming soon/);
  await page.getByRole('status').filter({hasText:'These selections need confirmed prices'}).waitFor();
  if(process.env.BOF_QA_TEST_CHECKOUT)assert.equal(await page.getByRole('button',{name:'Place Test Order — No Payment',exact:true}).isDisabled(),true);
  await page.evaluate(async item=>{const {useCartStore}=await import('/src/store/cart.ts');useCartStore.getState().replaceItemsFromRecovery([item]);},original);
 });
 await check('tent wall options require the correct additional artwork panels',async()=>{await open('custom-event-tents');await page.locator('#option-tent_full_wall').selectOption('AB');await page.locator('#option-tent_half_wall').selectOption('2x2');assert.equal(await page.getByRole('tab').count(),10);assert.equal(await page.getByRole('button',{name:'Add to cart',exact:true}).isDisabled(),true);await page.locator('#specialty-variant').selectOption('custom-event-tents-3');assert.equal(await page.getByRole('tab').count(),4);await page.locator('#option-tent_full_wall_long').selectOption('L1');await page.getByRole('tab',{name:'Long full wall 1',exact:true}).click();assert.match(await page.locator('#specialty-artwork').innerText(),/230.12″ × 80.03″/);assert.match(await page.locator('#specialty-artwork').innerText(),/1:2 template scale/);});
 await check('PDF upload preserves vectors, rejects extra pages and exports the selected dimensions',async()=>{
  await open('display-posters');const pdf=await PDFDocument.create();pdf.addPage([400,800]).drawText('VECTOR QA',{x:20,y:500,size:35,color:rgb(.1,.3,.35)});const bytes=await pdf.save();
  await page.locator('#specialty-artwork input[type=file]').setInputFiles({name:'qa-vector.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
  await page.getByRole('button',{name:'Replace artwork',exact:true}).waitFor({timeout:60000});await page.getByLabel('I checked the front artwork',{exact:false}).check();await page.getByRole('button',{name:'Add to cart',exact:true}).click();await page.waitForURL('**/checkout',{timeout:60000});
  const item=await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');return useCartStore.getState().items.find(i=>i.specialty_config?.productSlug==='display-posters')});
  assert.equal(item.specialty_config.panels[0].artwork.isPdf,true);const printed=uploads.get(item.specialty_config.panels[0].productionFileKey),output=await PDFDocument.load(printed.bytes);assert.deepEqual(output.getPage(0).getSize(),{width:1728,height:1296});assert.match(output.getPage(0).node.Resources().toString(),/XObject/);
  await open('display-posters');pdf.addPage();await page.locator('#specialty-artwork input[type=file]').setInputFiles({name:'qa-multipage.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await page.getByRole('alert').filter({hasText:'separate single-page PDF'}).waitFor();assert.equal(await page.getByRole('button',{name:'Add to cart',exact:true}).isDisabled(),true);
 });
 await check('selected tent wall artwork guide downloads at the correct print scale',async()=>{
  await open('custom-event-tents');await page.locator('#specialty-variant').selectOption('custom-event-tents-3');await page.locator('#option-tent_full_wall_long').selectOption('L1');
  await page.getByText('Artwork templates & file setup',{exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:/Long full wall 1.*PDF guide/}).click()]);
  const file=out+'/tent-long-wall-guide.pdf';await download.saveAs(file);const guide=await PDFDocument.load(await readFile(file));
  assert.equal(guide.getPageCount(),2);assert.ok(Math.abs(guide.getPage(0).getWidth()-230.1214*72*.5)<.001);assert.ok(Math.abs(guide.getPage(0).getHeight()-80.02778*72*.5)<.01);
 });
 await check('product galleries load local branded images for every variant',async()=>{
  const catalog=JSON.parse(await readFile(root+'shared/specialty-catalog.json','utf8'));
  for(const product of catalog){await open(product.slug);assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);for(const variant of product.variants){await page.locator('#specialty-variant').selectOption(variant.id);const hero=page.locator('button[aria-label^="Enlarge"] img').first();assert.match(await hero.getAttribute('src'),/^\/images\/products\//);await hero.evaluate(img=>img.decode());assert.equal(await page.locator('img[src*="b2sign.com"]').count(),0);}}
 });
 await check('mobile flag controls remain outside the narrow artboard',async()=>{await page.setViewportSize({width:390,height:844});await open('feather-flags');await uploadArt();const fit=page.getByRole('button',{name:/^Show entire design/});await fit.waitFor();const box=await fit.boundingBox();assert.ok(box.width>110);assert.ok(box.x>=0&&box.x+box.width<=390);await page.locator('#specialty-artwork').screenshot({path:out+'/flag-mobile.png'});});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks:checks.length,pageErrors:errors,uploadTransportsMocked:true,AIProviderMocked:true}));
 await writeFile(out+'/result.json',JSON.stringify({checks,pageErrors:errors,uploadTransportsMocked:true,AIProviderMocked:true},null,2));
}catch(error){await page.screenshot({path:out+'/failure.png',fullPage:true});console.error('BROWSER FAILURE',error.message,'ALERTS',await page.getByRole('alert').allTextContents(),'PAGE ERRORS',errors);process.exitCode=1;}
finally{await browser.close();await server.close();}
