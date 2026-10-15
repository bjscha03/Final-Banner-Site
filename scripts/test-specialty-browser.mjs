/** Local integration checks with intercepted upload/AI transports; never a live-provider test. */
import {createServer} from 'vite';
import {chromium,firefox,webkit,devices} from 'playwright';
import sharp from 'sharp';
import {PDFDocument,rgb} from 'pdf-lib';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
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
// Serve actual HTTPS so PDF workers use the same origin in every browser.
const tlsDir=await mkdtemp(tmpdir()+'/specialty-qa-tls-');
let https;
if(process.env.BOF_QA_TEST_CHECKOUT){
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tlsDir+'/key.pem','-out',tlsDir+'/cert.pem','-days','1','-subj','/CN='+qaHost,'-addext','subjectAltName=DNS:'+qaHost],{stdio:'ignore'});
 https={key:await readFile(tlsDir+'/key.pem'),cert:await readFile(tlsDir+'/cert.pem')};
}
const server=await createServer({root,configFile:root+'vite.config.ts',optimizeDeps:{include:['pdfjs-dist','pdf-lib']},server:{host:'127.0.0.1',port:8096,allowedHosts:[qaHost],https}});await server.listen();
const browserName=process.env.BOF_QA_BROWSER||'chromium';
const browserType={chromium,firefox,webkit}[browserName];
if(!browserType)throw new Error('Unknown QA browser '+browserName);
const browser=await browserType.launch({...(process.env.BOF_QA_CHANNEL?{channel:process.env.BOF_QA_CHANNEL}:{}),...(process.env.BOF_CHROMIUM_PATH?{executablePath:process.env.BOF_CHROMIUM_PATH}:{}),...(browserName==='chromium'?{args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu',`--host-resolver-rules=MAP ${qaHost} 127.0.0.1`]}:{})});
const page=await browser.newPage({...process.env.BOF_QA_DEVICE?devices[process.env.BOF_QA_DEVICE]:{viewport:{width:1280,height:900}},ignoreHTTPSErrors:true}),errors=[],checks=[],uploads=new Map(),jobs=new Map(),aiRequests=[];
const initialViewport=page.viewportSize();
page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(60000);
// WebKit's request interception omits file bytes in multipart postDataBuffer.
// Mock only the storage boundary, reading the real File/Blob in the page first.
await page.exposeFunction('__qaStoreUpload',async file=>{
 const bytes=Buffer.from(file.base64,'base64');assert.ok(bytes.length>0,'Uploaded file must contain bytes');
 const id='qa-'+createHash('sha256').update(bytes).digest('hex').slice(0,20);
 uploads.set(id,{bytes,type:file.type,name:file.name});const meta=file.type==='application/pdf'?{}:await sharp(bytes).metadata();
 return {secure_url:`https://res.cloudinary.com/test/image/upload/${id}.${file.type==='application/pdf'?'pdf':'png'}`,public_id:id,resource_type:'image',format:file.type==='application/pdf'?'pdf':'png',bytes:bytes.length,width:meta.width,height:meta.height};
});
await page.addInitScript(()=>{
 const nativeFetch=window.fetch;
 window.fetch=async function(input,init){
  // Lifecycle snapshots are already mocked below. Answer at the fetch boundary
  // so WebKit does not report an intercepted keepalive request after page exit.
  const requestUrl=typeof input==='string'?input:input?.url||String(input);
  if(requestUrl.endsWith('/.netlify/functions/save-cart-snapshot')){
   return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(String(input).endsWith('/.netlify/functions/upload-file')&&init?.body instanceof FormData){
   const file=init.body.get('file');
   const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
   return new Response(JSON.stringify(await window.__qaStoreUpload({base64,type:file.type,name:file.name})),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return nativeFetch.call(this,input,init);
 };
});
page.on('pageerror',e=>errors.push(e.message));
const diagnostics=[];
page.on('console',m=>{if(['error','warning'].includes(m.type()))diagnostics.push(m.type()+': '+m.text());});
page.on('requestfailed',r=>diagnostics.push('request failed: '+r.url()+' '+r.failure()?.errorText));
const fixture=await sharp(Buffer.from('<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="1000" fill="#123b42"/><circle cx="400" cy="275" r="135" fill="#dd9b52"/><text x="400" y="570" text-anchor="middle" font-size="80" font-family="sans-serif" fill="white">MARKET</text><text x="400" y="680" text-anchor="middle" font-size="36" font-family="sans-serif" fill="white">BROWSER QA FIXTURE</text></svg>')).png().toBuffer();
const json=(r,obj)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
await page.route('https://res.cloudinary.com/**',async route=>{
 const url=route.request().url();const key=[...uploads.keys()].find(k=>url.includes(k));const file=key?uploads.get(key):null;
 return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:file?.type||'image/png',body:file?.bytes||fixture});
});
await page.route('https://www.b2sign.com/**',r=>r.fulfill({status:200,contentType:'image/png',body:fixture}));
await page.route('**/.netlify/functions/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
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
async function uploadArt(){await page.locator('#specialty-artwork input[type=file]').setInputFiles({name:'qa-market.png',mimeType:'image/png',buffer:fixture});await page.waitForFunction(()=>document.querySelector('#specialty-artwork input[type=file]').value==='');await page.getByRole('button',{name:'Replace artwork',exact:true}).waitFor();await page.getByLabel('I checked the', {exact:false}).waitFor({timeout:30000});await page.waitForFunction(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.includes('I checked the'))?.querySelector('input')?.disabled===false);}
try{
 await check('all 19 product pages and 58 variants render valid supplier selections',async()=>{
  const catalog=JSON.parse(await readFile(root+'shared/specialty-catalog.json','utf8'));
  for(const product of catalog){await open(product.slug);for(const variant of product.variants){await page.locator('#specialty-variant').selectOption(variant.id);assert.equal(await page.locator('select').evaluateAll(els=>els.some(el=>!el.value||![...el.options].some(o=>o.value===el.value))),false,variant.id);assert.doesNotMatch(await page.getByTestId('specialty-price').innerText(),/Price coming soon/);assert.match(await page.getByTestId('specialty-subtotal').innerText(),/^\$[1-9]/);}}
 });
 await check('premium size selection changes the branded product photograph',async()=>{
  await open('premium-retractable-banner');const hero=page.locator('button[aria-label^="Enlarge"] img').first();const before=await hero.getAttribute('src');await page.locator('#specialty-variant').selectOption('premium-retractable-banner-3');assert.notEqual(await hero.getAttribute('src'),before);
 });
 await check('catalog shows revised cost-led prices and free shipping; retractable defaults to the revised 33-inch kit',async()=>{
  await open('standard-retractable-banner');
  assert.equal(await page.locator('#specialty-variant').inputValue(),'standard-retractable-banner-3');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$176.34');
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.locator('#specialty-qty').fill('2');assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$352.68');
  await page.locator('#specialty-variant').selectOption('standard-retractable-banner-1');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$411.40');
  assert.match(await page.getByTestId('specialty-price').innerText(),/Tax calculated separately/);
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.goto(origin+'/products');await page.getByRole('heading',{name:'Make the entire space yours.'}).waitFor();
  for(const [slug,price] of [['standard-retractable-banner','$176.34'],['feather-flags','$204.79'],['standard-table-throws','$185.70'],['custom-event-tents','$1040.07'],['step-and-repeat-backdrop','$488.46'],['aluminum-composite-signs','$35.00']]){
   const card=page.locator(`a[href="/products/${slug}"]`).filter({has:page.locator('h3')});
   assert.ok((await card.innerText()).includes(price),slug);assert.match(await card.innerText(),/Free Next Day Air shipping/);
  }
  const unpriced=page.locator('a[href="/products/acrylic-signs"]').filter({has:page.locator('h3')});
  assert.match(await unpriced.innerText(),/\$120\.00/);assert.doesNotMatch(await unpriced.innerText(),/Price coming soon/);assert.match(await unpriced.innerText(),/Free Next Day Air/);
  await page.locator('#stands').screenshot({path:out+'/catalog-prices.png'});
 });
 await check('flag size, options and quantities update the price while shipping remains free',async()=>{
  await open('feather-flags');const subtotal=page.getByTestId('specialty-subtotal');
  assert.equal(await subtotal.innerText(),'$208.49');
  assert.match(await page.locator('#option-sides option[value="2"]').innerText(),/\$276\.21 total/);
  assert.match(await page.locator('#option-flaghardware option[value="PB"]').innerText(),/\$229\.33 total/);
  await page.locator('#option-sides').selectOption('2');
  await page.locator('#option-flaghardware').selectOption('PB');
  await page.locator('#option-carrybag').selectOption('1');
  assert.equal(await subtotal.innerText(),'$336.24');
  await page.locator('#specialty-qty').fill('3');assert.equal(await subtotal.innerText(),'$1008.72');
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.locator('#specialty-variant').selectOption('feather-flags-2');
  assert.equal(await subtotal.innerText(),'$625.47');
 });
 await check('tent and ACM prices follow their selected accessories and sizes',async()=>{
  await open('custom-event-tents');await page.locator('#option-tent_sandbag').selectOption('1');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$1133.05');
  await page.locator('#option-tent_full_wall').selectOption('A');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$1475.74');
  assert.match(await page.getByTestId('specialty-price').innerText(),/Tax calculated separately/);
  assert.doesNotMatch(await page.getByTestId('specialty-price').innerText(),/Price coming soon/);
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await open('aluminum-composite-signs');await page.getByRole('button',{name:'24 × 36 in · $115.00',exact:true}).click();
  await page.locator('#option-sides').selectOption('2');await page.locator('#specialty-qty').fill('2');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$280.00');
 });
 await check('proposed custom rates, replacements and quantity use the same price on mobile',async()=>{
  await open('acrylic-signs');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$155.00');
  await page.locator('#option-hardware').selectOption('acrylic');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$120.00');
  assert.doesNotMatch(await page.getByTestId('specialty-price').innerText(),/\+\$-/);
  await page.getByLabel('Width (in)',{exact:true}).fill('6');await page.getByLabel('Height (in)',{exact:true}).fill('6');
  await page.locator('#specialty-qty').fill('3');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$255.00');
  await page.setViewportSize({width:390,height:844});
  await open('standard-retractable-banner');await page.locator('#option-hardware').selectOption('p');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$129.24');
  assert.match(await page.getByTestId('specialty-price').innerText(),/FREE Next Day Air/);
  await page.getByTestId('specialty-price').screenshot({path:out+'/proposed-mobile-price.png'});
  await open('aluminum-signs');await page.locator('#option-size').selectOption('12x18');
  assert.equal(await page.getByLabel('Width (in)',{exact:true}).inputValue(),'12');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$90.82');
  await page.getByLabel('Width (in)',{exact:true}).fill('20');
  assert.equal(await page.locator('#option-size').inputValue(),'custom_size');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$98.47');
  await open('display-posters');await page.getByLabel('Height (in)',{exact:true}).fill('36');
  assert.equal(await page.getByTestId('specialty-subtotal').innerText(),'$88.00');
  await page.setViewportSize(initialViewport);
 });
 await check('specialty AI actions stay hidden and uploaded artwork reaches checkout unchanged',async()=>{
  await open('feather-flags');
  assert.equal(await page.getByRole('button',{name:'Create with AI',exact:true}).count(),0);
  await uploadArt();assert.equal(await page.getByRole('button',{name:'Fit my design with AI',exact:true}).count(),0);
  await page.getByLabel('I checked the front artwork', {exact:false}).check();await page.getByRole('button',{name:'Add to cart',exact:true}).click();await page.waitForURL('**/checkout',{timeout:60000});await page.locator('[aria-label="Your artwork on Feather Flags"]').first().waitFor();await page.reload();await page.locator('[aria-label="Your artwork on Feather Flags"]').first().waitFor();await page.screenshot({path:out+'/flag-cart.png',fullPage:true});
  const item=await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');return useCartStore.getState().items.find(i=>i.product_type==='specialty')});assert.equal(item.specialty_config.panels[0].composition.widthIn,25);assert.equal(item.specialty_config.panels[0].artwork.name,'qa-market.png');assert.ok(item.specialty_config.panels[0].productionUrl.endsWith('.pdf'));assert.equal(aiRequests.length,0);
  const totals=page.getByTestId('checkout-order-totals');assert.match(await totals.innerText(),/\$208\.49/);assert.match(await totals.innerText(),/First-order savings · 20%/);assert.match(await totals.innerText(),/\$176\.80/);assert.match(await totals.innerText(),/FREE/);assert.doesNotMatch(await totals.innerText(),/Pending|Not yet calculated/);
  if(process.env.BOF_QA_TEST_CHECKOUT)assert.equal(await page.getByRole('button',{name:/^Place test order · \$/}).isEnabled(),true);
 });
 await check('saved cart reprices options and quantity and blocks only unavailable configurations',async()=>{
  const original=await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');const s=useCartStore.getState(),item=s.items.find(i=>i.specialty_config?.productSlug==='feather-flags');if(!item)throw new Error('Run flag upload before this cart check.');s.replaceItemsFromRecovery([{...item,quantity:2,unit_price_cents:1,line_total_cents:2,specialty_config:{...item.specialty_config,priceVerified:false,options:{...item.specialty_config.options,flaghardware:'PB',carrybag:'1'}}}]);return item;});
  await page.reload();const totals=page.getByTestId('checkout-order-totals');await totals.waitFor();await totals.getByText('First-order savings · 20%',{exact:true}).waitFor();
  assert.match(await totals.innerText(),/\$537\.04/);assert.match(await totals.innerText(),/First-order savings · 20%/);assert.match(await totals.innerText(),/\$455\.41/);assert.match(await totals.innerText(),/FREE/);
  if(process.env.BOF_QA_TEST_CHECKOUT)assert.equal(await page.getByRole('button',{name:/^Place test order · \$/}).isEnabled(),true);
  await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');const item=useCartStore.getState().items[0];useCartStore.getState().replaceItemsFromRecovery([{...item,specialty_config:{...item.specialty_config,priceVerified:true,options:{...item.specialty_config.options,sides:'invalid'}}}]);});
  await page.reload();await totals.waitFor();assert.match(await totals.innerText(),/Pending/);
  assert.match(await page.getByTestId('specialty-pending-price').first().innerText(),/Price coming soon/);
  await page.getByRole('status').filter({hasText:'These selections need confirmed prices'}).waitFor();
  if(process.env.BOF_QA_TEST_CHECKOUT)assert.equal(await page.getByRole('button',{name:/^Place test order · \$/}).isDisabled(),true);
  await page.evaluate(async item=>{const {useCartStore}=await import('/src/store/cart.ts');useCartStore.getState().replaceItemsFromRecovery([item]);},original);
 });
 await check('tent wall options require the correct additional artwork panels',async()=>{await open('custom-event-tents');await page.locator('#option-tent_full_wall').selectOption('AB');await page.locator('#option-tent_half_wall').selectOption('2x2');assert.equal(await page.getByRole('tab').count(),10);assert.equal(await page.getByRole('button',{name:'Add to cart',exact:true}).isDisabled(),true);await page.locator('#specialty-variant').selectOption('custom-event-tents-3');assert.equal(await page.getByRole('tab').count(),4);await page.locator('#option-tent_full_wall_long').selectOption('L1');await page.getByRole('tab',{name:'Long full wall 1',exact:true}).click();assert.match(await page.locator('#specialty-artwork').innerText(),/230.12″ × 80.03″/);assert.match(await page.locator('#specialty-artwork').innerText(),/1:2 template scale/);});
 await check('PDF upload preserves vectors, rejects extra pages and exports the selected dimensions',async()=>{
  await open('display-posters');const pdf=await PDFDocument.create();pdf.addPage([400,800]).drawText('VECTOR QA',{x:20,y:500,size:35,color:rgb(.1,.3,.35)});const bytes=await pdf.save();
  await page.locator('#specialty-artwork input[type=file]').setInputFiles({name:'qa-vector.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
  await page.getByRole('button',{name:'Replace artwork',exact:true}).waitFor({timeout:60000});await page.getByLabel('I checked the front artwork',{exact:false}).check();await page.getByRole('button',{name:'Add to cart',exact:true}).click();await page.waitForURL('**/checkout',{timeout:60000});
  // The URL updates before the lazy checkout module finishes loading. Wait for
  // the actual checkout before navigating again, so WebKit does not abort it.
  await page.getByTestId('checkout-order-totals').waitFor();
  const item=await page.evaluate(async()=>{const {useCartStore}=await import('/src/store/cart.ts');return useCartStore.getState().items.find(i=>i.specialty_config?.productSlug==='display-posters')});
  assert.equal(item.specialty_config.panels[0].artwork.isPdf,true);const printed=uploads.get(item.specialty_config.panels[0].productionFileKey),output=await PDFDocument.load(printed.bytes);assert.deepEqual(output.getPage(0).getSize(),{width:1728,height:1296});assert.match(output.getPage(0).node.Resources().toString(),/XObject/);
  await open('display-posters');pdf.addPage();await page.locator('#specialty-artwork input[type=file]').setInputFiles({name:'qa-multipage.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await page.getByRole('alert').filter({hasText:'separate single-page PDF'}).waitFor();assert.equal(await page.getByRole('button',{name:'Add to cart',exact:true}).isDisabled(),true);
  await open('acrylic-signs');await page.locator('#specialty-artwork input[type=file]').setInputFiles({name:'qa-clear-vector.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
  const clearProof=page.getByAltText('Front flat artwork without guides',{exact:true});await clearProof.waitFor({timeout:60000});await clearProof.evaluate(img=>img.decode());
  assert.equal(await clearProof.evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height*.8),1,1).data[3];}),0,'Clear acrylic must preserve transparent regions inside the PDF page');
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
 await check('every variant and default print panel uses its registered artwork size with no AI actions',async()=>{
  const catalog=JSON.parse(await readFile(root+'shared/specialty-catalog.json','utf8'));
  const templates=JSON.parse(await readFile(root+'shared/specialty-templates.json','utf8'));
  for(const product of catalog){
   await open(product.slug);
   for(const variant of product.variants){
    await page.locator('#specialty-variant').selectOption(variant.id);
    assert.equal(await page.getByRole('button',{name:'Create with AI',exact:true}).count(),0);
    for(const panel of variant.panels){
     if(variant.panels.length>1)await page.getByRole('tab',{name:panel.label,exact:true}).click();
     await uploadArt();
     assert.equal(await page.getByRole('button',{name:'Crop artwork',exact:true}).count(),0);
     const editorImage=page.getByTestId('artwork-canvas').locator('img');await editorImage.evaluate(img=>img.decode());
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const painted=await sharp(await editorImage.screenshot()).stats();assert.ok(painted.channels.some(c=>c.min<100&&c.max>150),`${variant.id}/${panel.id}: artwork must be painted in the editor`);
     const proof=page.getByAltText(`${panel.label} flat artwork without guides`,{exact:true});await proof.waitFor();await proof.evaluate(img=>img.decode());
     if(product.slug==='acrylic-signs'){const alpha=await proof.evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(1,Math.floor(c.height/2),1,1).data[3];});assert.equal(alpha,0,'Unprinted acrylic must stay transparent, not black');}
     const size=await proof.evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
     const template=templates[panel.templateId],ratio=product.priceUnit==='sqft'?24/18:template.widthIn/template.heightIn;
     assert.ok(Math.abs(size.w/size.h-ratio)/ratio<.02,`${variant.id}/${panel.id}: proof ratio`);
     assert.equal(await page.getByRole('button',{name:'Fit my design with AI',exact:true}).count(),0);
     if(!['tent','table'].includes(product.visual)){
      await page.getByRole('button',{name:'See product',exact:true}).click();
      await page.locator(`[aria-label="Your artwork on ${product.name}"]`).waitFor();
      await page.getByRole('button',{name:'See flat artwork',exact:true}).click();
     } else assert.equal(await page.getByRole('button',{name:'See product',exact:true}).count(),0);
    }
   }
   await page.locator('#specialty-artwork').screenshot({path:`${out}/artwork-${product.slug}.png`});
  }
 });
 await check('configuration changes clear approval and never retain an incompatible setup photo',async()=>{
  await open('standard-retractable-banner');await uploadArt();
  await page.getByLabel('I checked the front artwork',{exact:false}).check();
  await page.locator('#option-hardware').selectOption('p');
  assert.equal(await page.getByLabel('I checked the front artwork',{exact:false}).isChecked(),false);
  assert.equal(await page.getByRole('button',{name:'Add to cart',exact:true}).isDisabled(),true);
  await page.getByTestId('selected-configuration-guide').waitFor();
  assert.equal(await page.locator('button[aria-label^="Enlarge"] img').count(),0);
  await open('acrylic-signs');await page.getByLabel('Width (in)',{exact:true}).fill('36');
  await page.getByTestId('selected-configuration-guide').waitFor();
  assert.match(await page.getByTestId('selected-configuration-guide').innerText(),/36 × 18 in/);
  assert.equal(await page.locator('button[aria-label^="Enlarge"] img').count(),0);
 });
 await check('homepage and desktop/mobile navigation expose each product category without overflow',async()=>{
  await page.goto(origin+'/');await page.getByRole('heading',{name:'Build your entire display.'}).waitFor();
  for(const width of [320,390,768,1024,1280,1536]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Homepage overflows at ${width}`);
   if(width===390||width===1280)await page.locator('[aria-labelledby="product-selection-heading"]').screenshot({path:`${out}/homepage-products-${width}.png`});
  }
  await page.getByRole('link',{name:/Advertising flags.*Feather/}).click();
  await page.getByRole('heading',{name:'Advertising flags',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#flags');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/Open menu|Toggle menu|Open navigation|Toggle navigation/i}).click();
  const nav=page.getByRole('navigation',{name:'Mobile navigation'});
  for(const category of ['Banner stands & backdrops','Advertising flags','Table covers & tents','Rigid signs & posters'])await nav.getByRole('link',{name:category,exact:true}).waitFor();
  await nav.getByRole('link',{name:'Table covers & tents',exact:true}).click();await page.getByRole('heading',{name:'Table covers & tents',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#events');
  await page.setViewportSize({width:1280,height:900});
 });
 await check('mobile flag controls remain outside the narrow artboard',async()=>{await page.setViewportSize({width:390,height:844});await open('feather-flags');await uploadArt();const fit=page.getByRole('button',{name:/^Show entire design/});await fit.waitFor();const box=await fit.boundingBox();assert.ok(box.width>110);assert.ok(box.x>=0&&box.x+box.width<=390);await page.locator('#specialty-artwork').screenshot({path:out+'/flag-mobile.png'});});
 await check('specialty cart preview stays readable for narrow flags on desktop and mobile',async()=>{
  await page.setViewportSize({width:1280,height:900});
  await open('economy-feather-flag');await uploadArt();
  await page.getByLabel('I checked the front artwork',{exact:false}).check();
  await page.getByRole('button',{name:'Add to cart',exact:true}).click();
  await page.waitForURL('**/checkout',{timeout:60000});
  const item=page.locator('[data-checkout-artwork-item]').filter({has:page.getByRole('heading',{name:'Economy Feather Flag',exact:true})});
  const preview=item.getByTestId('saved-specialty-preview');
  await preview.waitFor();
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:900});
   const box=await preview.boundingBox(),scene=await preview.locator('svg[role=img]').boundingBox();
   assert.ok(box.width>=120,`Preview squeezed to ${box.width}px at ${width}px viewport`);
   assert.ok(box.x>=0&&box.x+box.width<=width,'Preview extends outside the viewport');
   assert.ok(Math.abs(scene.width/scene.height-500/450)<.02,'Product scene is distorted');
   assert.equal(await preview.getByText(/Appearance preview/).count(),0,'Detailed caption must not crowd the thumbnail');
   assert.ok((await preview.getByRole('button',{name:'Review artwork',exact:true}).boundingBox()).height>=44);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Page overflows horizontally');
   await page.getByTestId('checkout-artwork-summary').screenshot({path:`${out}/economy-flag-checkout-${width}.png`});
  }
  await preview.getByRole('button',{name:'Review artwork',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.match(await dialog.innerText(),/Appearance preview.*saved flat artwork/);
  await dialog.screenshot({path:out+'/economy-flag-artwork-review-mobile.png'});
  await page.keyboard.press('Escape');
  await page.goto(origin+'/products');
  await page.getByRole('button',{name:'Shopping cart',exact:true}).click();
  const cart=page.getByRole('dialog',{name:'Shopping cart',exact:true});await cart.waitFor();
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   for(const saved of await cart.getByTestId('saved-specialty-preview').all()){
    assert.ok((await saved.boundingBox()).width>=240,'Cart preview is too narrow');
    assert.equal(await saved.getByText(/Appearance preview/).count(),0);
   }
   await cart.screenshot({path:`${out}/specialty-cart-drawer-${width}.png`});
  }
  await cart.getByRole('button',{name:'Close cart',exact:true}).click();
  await page.setViewportSize({width:1280,height:900});
 });
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({browser:browserName,device:process.env.BOF_QA_DEVICE||'desktop',checks:checks.length,pageErrors:errors,uploadTransportsMocked:true,AIProviderMocked:true}));
 await writeFile(out+'/result.json',JSON.stringify({browser:browserName,device:process.env.BOF_QA_DEVICE||'desktop',checks,pageErrors:errors,uploadTransportsMocked:true,AIProviderMocked:true},null,2));
}catch(error){console.error('BROWSER FAILURE',error.stack||error.message,'PAGE ERRORS',errors,'DIAGNOSTICS',diagnostics.slice(-40));await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});console.error('ALERTS',await page.getByRole('alert').allTextContents().catch(()=>[]));process.exitCode=1;}
finally{await browser.close();await server.close();await rm(tlsDir,{recursive:true,force:true});}
