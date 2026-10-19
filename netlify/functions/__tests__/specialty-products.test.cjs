'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {catalog,templates,priceSpecialty,resolveSpecialtyTemplate,normalizeSpecialtyItem}=require('../_shared/specialty-products.cjs');
const {normalizeCartItemPlacement,buildCompositionSignatureFromPreview}=require('../_shared/preview-artifact.cjs');
const {repriceStripeCart}=require('../_shared/stripe-server-pricing.cjs');
const {validateFitRequest,buildFitPrompt}=require('../_shared/ai-designer/fit.cjs');
const engine=require('../../../shared/specialty-options.cjs');
const {computeTotals}=require('../_shared/checkoutTotals.cjs');
test('every specialty family has owner-approved free Next Day Air independent of pricing',()=>{
 for(const p of catalog){
  assert.equal(p.shippingPolicy,'free_overnight_after_production');
  for(const v of p.variants)if(!v.priceMatch){assert.ok(v.priceCents>0, v.id);assert.equal(v.priceProposal.status,'pending_john_approval');}
 }
});
test('release controls block both quotes and server checkout and retain the canonical supplier',()=>{
 const release=require('../../../shared/specialty-release.json');
 const {requireSpecialtyFulfillment}=require('../_shared/specialty-products.cjs');
 const product=catalog.find(p=>p.slug==='feather-flags'),variant=product.variants[0];
 const item=normalizeSpecialtyItem(itemFor(product.slug));
 assert.equal(item.specialty_config.fulfillmentSupplier,'B2Sign');
 const before=release.products[product.slug];
 try{release.products[product.slug]=false;assert.equal(engine.priceConfiguration(product,variant,25,80,{}).verified,false);assert.throws(()=>requireSpecialtyFulfillment([item]),{code:'SPECIALTY_PRODUCT_UNAVAILABLE'});}
 finally{release.products[product.slug]=before;}
 assert.equal(normalizeSpecialtyItem(itemFor('acrylic-signs')).specialty_config.fulfillmentSupplier,'Signs365');
});
function itemFor(slug,variantIndex=0,options={},width,height){
 const product=catalog.find(p=>p.slug===slug),variant=product.variants[variantIndex];
 const panels=engine.panelDefinitions(variant,options).map(p=>{const registered=templates[p.templateId],t=width&&height?{...registered,widthIn:width,heightIn:height}:registered,source=`https://res.cloudinary.com/test/image/upload/${p.id}.png`,preview=`https://res.cloudinary.com/test/image/upload/${p.id}-preview.png`,type=`specialty:${slug}:${variant.id}:${p.id}`;return {...p,artwork:{url:source,fileKey:p.id},composition:{version:3,fitMode:'fit',sourceUrl:source,sourceIdentity:p.id,productType:type,widthIn:t.widthIn,heightIn:t.heightIn,revision:3,transform:{xPct:2,yPct:-1,scaleX:1.2,scaleY:1.2}},preview:{version:3,fitMode:'fit',previewPublicId:p.id+'-preview',previewWidthPx:800,previewHeightPx:600,sourceUrl:source,sourceIdentity:p.id,productType:type,widthIn:t.widthIn,heightIn:t.heightIn,compositionRevision:3,positionPct:{x:2,y:-1},scaleX:1.2,scaleY:1.2,uploadStatus:'uploaded',url:preview},productionUrl:`https://res.cloudinary.com/test/raw/upload/${p.id}.pdf`,productionFileKey:p.id+'-print'};});
 for(const p of panels)p.preview.compositionSignature=buildCompositionSignatureFromPreview(p.preview);
 return {product_type:'specialty',quantity:2,width_in:panels[0].composition.widthIn,height_in:panels[0].composition.heightIn,line_total_cents:1,unit_price_cents:1,specialty_config:{version:1,productSlug:slug,variantId:variant.id,options,panels}};
}
test('all 58 configurations have registered artwork panels and catalog images',()=>{
 assert.equal(catalog.length,19);assert.equal(catalog.reduce((n,p)=>n+p.variants.length,0),58);
 for(const p of catalog)for(const v of p.variants){if(v.priceMatch)assert.ok(v.priceCents>0);assert.ok(v.panels.length);assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname,'../../../public',p.image)));for(const panel of v.panels){const t=templates[panel.templateId];assert.ok(t.widthIn>0&&t.heightIn>0);assert.ok(t.exportScale>0&&t.exportScale<=1);}}
});
test('retail totals are rebuilt from the registered variant, ignoring browser amounts',()=>{
 const item=itemFor('deluxe-retractable-banner',1);const clean=normalizeSpecialtyItem(item);assert.equal(clean.unit_price_cents,48821);assert.equal(clean.line_total_cents,97642);assert.equal(clean.specialty_config.panels.length,2);
});
test('tent panels, source placement and permanent production uploads are required',()=>{
 const complete=itemFor('custom-event-tents',2);assert.equal(normalizeSpecialtyItem(complete).specialty_config.panels.length,4);
 for(const change of [x=>x.specialty_config.panels.pop(),x=>x.specialty_config.panels[0].composition.transform.xPct=9,x=>x.specialty_config.panels[0].templateId='wrong',x=>x.specialty_config.panels[0].productionUrl='blob:temporary']){const item=structuredClone(complete);change(item);assert.throws(()=>normalizeSpecialtyItem(item));}
});
test('custom signs enforce shipped dimensions and poster minimums',()=>{
 const poster=catalog.find(p=>p.slug==='display-posters');assert.equal(priceSpecialty(poster,poster.variants[0],6,6),8262);
 const aluminum=catalog.find(p=>p.slug==='aluminum-signs');assert.equal(priceSpecialty(aluminum,aluminum.variants[0],24,18),10463);assert.throws(()=>priceSpecialty(aluminum,aluminum.variants[0],96,48));
});
test('payment accepts matched prices and shipping without a blanket specialty block',()=>{
 assert.equal(repriceStripeCart([itemFor('standard-retractable-banner')])[0].unit_price_cents,20570);
 let checked=0;
 for(const product of catalog)for(const [index,variant] of product.variants.entries()){
  for(const match of variant.priceMatch?[variant.priceMatch]:product.priceMatches||[]){
   const item=itemFor(product.slug,index,{},match.widthIn,match.heightIn);
   item.specialty_config.priceVerified=false; // An older saved cart is not authoritative.
   const [priced]=repriceStripeCart([item]);
   assert.equal(priced.unit_price_cents,priceSpecialty(product,variant,item.width_in,item.height_in),product.slug);
   assert.equal(priced.line_total_cents,priced.unit_price_cents*2);
   assert.equal(priced.specialty_config.priceVerified,true);
   assert.equal(computeTotals([priced],.06,{freeShipping:true}).shipping_cents,0);
   checked++;
  }
 }
 assert.equal(checked,18);
});
test('flag options and quantity reach payment at their canonical price with free shipping',()=>{
 for(const [base,addition] of Object.entries({PG:0,PB:2084,PBG:6396,PBW:2750,PBS:13830})){
  const [priced]=repriceStripeCart([itemFor('feather-flags',0,{sides:'2',flaghardware:base,carrybag:'1'})]);
  const expected=20849+6772+addition+3919;
  assert.equal(priced.unit_price_cents,expected);
  const totals=computeTotals([priced],.06,{freeShipping:true});
  assert.equal(totals.raw_subtotal_cents,expected*2);
  assert.equal(totals.shipping_cents,0);
  assert.equal(totals.applied_discount_cents,0);
  assert.equal(totals.total_cents,expected*2+Math.round(expected*2*.06));
 }
 const unpriced=itemFor('feather-flags',0,{sides:'-1'});unpriced.specialty_config.priceVerified=true;
 assert.equal(repriceStripeCart([unpriced])[0].unit_price_cents,20849);
});
test('a missing accessory price does not change a matched product shipping policy',()=>{
 const product=catalog.find(p=>p.slug==='custom-event-tents'),variant=structuredClone(product.variants[0]);
 delete variant.optionPrices.tent_full_wall.A;
 const quote=engine.priceConfiguration(product,variant,119,84.275,{tent_full_wall:'A'});
 assert.equal(quote.verified,false);
 assert.equal(quote.shippingPolicy,'free_overnight_after_production');
 assert.ok(quote.missing.some(x=>x.includes('Full Wall')));
});
test('proposed prices include air shipping without claiming an external price match',()=>{
 for(const [slug,index,w,h] of [['standard-retractable-banner',0,23,66],['feather-flags',4,25,80],['standard-table-throws',0,48,30],['aluminum-composite-signs',0,20,30]]){
  const product=catalog.find(p=>p.slug===slug),q=engine.priceConfiguration(product,product.variants[index],w,h);
  assert.equal(q.baseVerified,true,slug);assert.equal(q.verified,true,slug);assert.equal(q.proposed,true,slug);
  assert.equal(q.shippingPolicy,'free_overnight_after_production',slug);
 }
 const unlisted=catalog.find(p=>p.slug==='acrylic-signs');
 assert.equal(engine.priceConfiguration(unlisted,unlisted.variants[0],24,18).shippingPolicy,'free_overnight_after_production');
 const product=catalog.find(p=>p.slug==='standard-retractable-banner'),variant=product.variants[2];
 const [priced]=repriceStripeCart([itemFor(product.slug,2)]);
 assert.equal(priced.unit_price_cents,17634);assert.equal(priced.line_total_cents,35268);
 assert.equal(variant.priceMatch.status,'owner_retail_mapping');
 assert.equal(templates[variant.panels[0].templateId].widthIn,33);
});
test('mixed-cart shipping is free and specialty quantity does not alter banner discounts',()=>{
 const banner={product_type:'banner',width_in:48,height_in:24,quantity:2,material:'13oz'};
 const original=computeTotals(repriceStripeCart([banner]),.06,{freeShipping:true});
 const mixed=computeTotals(repriceStripeCart([banner,itemFor('feather-flags')]),.06,{freeShipping:true});
 assert.equal(original.applied_discount_cents,400);
 assert.equal(mixed.applied_discount_cents,400);
 assert.equal(mixed.shipping_cents,0);
 assert.equal(mixed.total_cents,52256);
});
test('specialty AI remains unavailable even for a valid registered template',()=>{
 const p=catalog.find(p=>p.slug==='feather-flags'),v=p.variants[0],t=templates[v.panels[0].templateId];const type=`specialty:${p.slug}:${v.id}:front`;const body={productType:type,widthIn:t.widthIn,heightIn:t.heightIn,sourceImage:'data:image/png;base64,eA=='};
 assert.throws(()=>validateFitRequest(body),{code:'SPECIALTY_AI_UNAVAILABLE'});assert.throws(()=>validateFitRequest({...body,widthIn:t.widthIn+2}));
 assert.match(buildFitPrompt({...body,plan:{strategy:'native'},source:{lines:['FARM MARKET'],elements:[]}}),/Printable boundary/);
});
test('20 ft tent template scale and table front/top regions remain distinct',()=>{
 const tent=templates['20ft-event-tent-canopy-short-side'];assert.equal(tent.exportScale,.25);assert.equal(tent.widthIn,128);
 for(const t of Object.values(templates).filter(t=>t.faces)){assert.ok(t.faces.front[1]>=t.faces.top[1]+t.faces.top[3]-.00001);assert.ok(t.faces.front[0]>0&&t.faces.front[2]<1);assert.ok(t.geometrySource);}
});

test('cart save/load accepts registered per-panel identities and preserves every panel',()=>{
 const original=itemFor('custom-event-tents',2);
 const saved=normalizeCartItemPlacement(original),loaded=normalizeCartItemPlacement(JSON.parse(JSON.stringify(saved)));
 assert.equal(loaded.specialty_config.panels.length,4);
 assert.equal(loaded.placement_preview.productType,loaded.specialty_config.panels[0].composition.productType);
 assert.deepEqual(loaded.specialty_config.panels,saved.specialty_config.panels);
 const forged=structuredClone(original);forged.specialty_config.panels[0].preview.compositionSignature='invalid';
 assert.throws(()=>normalizeCartItemPlacement(forged),/canonical composition signature/);
});
test('custom sign price dimensions cannot differ from uploaded artwork dimensions',()=>{
 const item=itemFor('aluminum-signs');item.width_in=6;item.height_in=6;
 assert.throws(()=>normalizeSpecialtyItem(item),e=>e.code==='SPECIALTY_ARTWORK_STALE');
 assert.throws(()=>resolveSpecialtyTemplate('specialty:standard-retractable-banner:standard:front',NaN,81));
});

test('revised prices supersede the retained historical retail references',()=>{
 for(const [slug,indices,prices] of [
 ['standard-retractable-banner',[2],[17634]],
 ['feather-flags',[0,1,2,3],[20849,20849,21224,24820]],
 ['standard-table-throws',[2,3,4,5],[21475,26279,24264,30191]],
 ['custom-event-tents',[0,1,2],[104007,160162,190149]],
 ['step-and-repeat-backdrop',[0,1],[48846,50900]]]){
  const p=catalog.find(x=>x.slug===slug);
  indices.forEach((i,n)=>{assert.equal(priceSpecialty(p,p.variants[i],24,18),prices[n]);assert.equal(p.variants[i].priceMatch.shippingPolicy,'free_overnight_after_production');});
 }
 const acm=catalog.find(p=>p.slug==='aluminum-composite-signs');
 for(const [w,h,cents] of [[18,24,6000],[24,36,11500],[6,24,3500],[6,36,4500]]){
  assert.equal(priceSpecialty(acm,acm.variants[0],w,h),cents);assert.equal(priceSpecialty(acm,acm.variants[0],h,w),cents);
 }
 assert.equal(catalog.reduce((n,p)=>n+p.variants.filter(v=>v.priceMatch).length+(p.priceMatches?.length||0),0),18);
});

test('flag accessories and reverse print use the revised proposal',()=>{
 const engine=require('../../../shared/specialty-options.cjs'),p=catalog.find(p=>p.slug==='feather-flags'),v=p.variants[0];
 for(const [base,addition] of Object.entries({PG:0,PB:2084,PBG:6396,PBW:2750,PBS:13830})){
  const q=engine.priceConfiguration(p,v,25,80,{sides:'2',flaghardware:base,carrybag:'1'});
  assert.equal(q.unitCents,20849+6772+addition+3919);assert.equal(q.verified,true);assert.equal(engine.panelDefinitions(v,q.options)[0].id,'both-sides');
 }
 const reverse=engine.priceConfiguration(p,v,25,80,{sides:'-1'});assert.equal(reverse.verified,true);assert.equal(reverse.unitCents,20849);assert.equal(reverse.proposed,true);
 assert.throws(()=>engine.optionsFor(v,{size:'xlarge'},true));assert.throws(()=>engine.optionsFor(v,{madeUp:'1'},true));
});
test('tent walls require every selected face and the 20-foot wall uses its own half scale',()=>{
 const engine=require('../../../shared/specialty-options.cjs'),p=catalog.find(p=>p.slug==='custom-event-tents');
 const panels=engine.panelDefinitions(p.variants[0],{tent_full_wall:'AB',tent_half_wall:'2x2'});assert.equal(panels.length,10);assert.equal(new Set(panels.map(p=>p.id)).size,10);
 const wall=engine.panelDefinitions(p.variants[2],{tent_full_wall_long:'L1'}).find(p=>p.id==='tent_full_wall_long-1-1');assert.equal(templates[wall.templateId].exportScale,.5);assert.equal(templates[wall.templateId].widthIn,230.1214);
 const q=engine.priceConfiguration(p,p.variants[0],119,84.275,{tent_sandbag:'1'});assert.equal(q.unitCents,113305);assert.equal(q.verified,true);
 assert.equal(engine.priceConfiguration(p,p.variants[0],119,84.275,{tent_full_wall:'A'}).verified,true);
});
test('ACM double-sided prices are dimension-specific and add a second artwork panel',()=>{
 const engine=require('../../../shared/specialty-options.cjs'),p=catalog.find(p=>p.slug==='aluminum-composite-signs'),v=p.variants[0];
 for(const [w,h,total] of [[18,24,7250],[24,36,14000],[6,24,3750],[6,36,5250]]){const q=engine.priceConfiguration(p,v,w,h,{sides:'2'});assert.equal(q.unitCents,total);assert.equal(q.verified,true);assert.equal(engine.panelDefinitions(v,q.options).length,2);}
 const custom=engine.priceConfiguration(p,v,20,30,{sides:'2'});assert.equal(custom.unitCents,9639);assert.equal(custom.verified,true);assert.equal(custom.proposed,true);
});
test('large specialty originals and print PDFs use the existing trusted storage route',()=>{
 const item=itemFor('custom-event-tents'),p=item.specialty_config.panels[0];
 const original='https://bannersonthefly.com/artwork-original/12345678-1234-1234-1234-123456789abc/original.pdf';
 p.artwork.url=original;p.artwork.productionUrl=original;p.productionUrl=original;
 assert.equal(normalizeSpecialtyItem(item).specialty_config.panels[0].productionUrl,original);
 for(const bad of [original.replace('bannersonthefly.com','example.com'),original.replace('/original.pdf','/private-data'),original.replace('https:','http:')]){
  p.productionUrl=bad;assert.throws(()=>normalizeSpecialtyItem(item),{code:'SPECIALTY_UPLOAD_INCOMPLETE'});
 }
});
test('every flag face has a cut outline and visible supplier guide, including convex XL',()=>{
 for(const product of catalog.filter(p=>p.visual==='flag'))for(const variant of product.variants)for(const panel of engine.allPanelDefinitions(variant)){
  const t=templates[panel.templateId];assert.ok(t.outline,`${variant.id}: cut outline missing`);assert.ok(t.guides?.length,`${variant.id}: guide missing`);
 }
 assert.ok(templates['convex-x-large'].sourceSha256);
});

test('older cropped specialty placements cannot reach payment without a new review',()=>{
 const item=itemFor('feather-flags');item.specialty_config.panels[0].composition.transform.crop={x:0,y:0,width:.5,height:1};
 assert.throws(()=>normalizeSpecialtyItem(item),{code:'SPECIALTY_ARTWORK_STALE'});
});
