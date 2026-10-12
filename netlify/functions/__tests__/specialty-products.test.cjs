'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {catalog,templates,priceSpecialty,resolveSpecialtyTemplate,normalizeSpecialtyItem}=require('../_shared/specialty-products.cjs');
const {normalizeCartItemPlacement,buildCompositionSignatureFromPreview}=require('../_shared/preview-artifact.cjs');
const {repriceStripeCart}=require('../_shared/stripe-server-pricing.cjs');
const {validateFitRequest,buildFitPrompt}=require('../_shared/ai-designer/fit.cjs');
function itemFor(slug,variantIndex=0){
 const product=catalog.find(p=>p.slug===slug),variant=product.variants[variantIndex];
 const panels=variant.panels.map(p=>{const t=templates[p.templateId],source=`https://res.cloudinary.com/test/image/upload/${p.id}.png`,preview=`https://res.cloudinary.com/test/image/upload/${p.id}-preview.png`,type=`specialty:${slug}:${variant.id}:${p.id}`;return {...p,artwork:{url:source,fileKey:p.id},composition:{version:3,fitMode:'fit',sourceUrl:source,sourceIdentity:p.id,productType:type,widthIn:t.widthIn,heightIn:t.heightIn,revision:3,transform:{xPct:2,yPct:-1,scaleX:1.2,scaleY:1.2}},preview:{version:3,fitMode:'fit',previewPublicId:p.id+'-preview',previewWidthPx:800,previewHeightPx:600,sourceUrl:source,sourceIdentity:p.id,productType:type,widthIn:t.widthIn,heightIn:t.heightIn,compositionRevision:3,positionPct:{x:2,y:-1},scaleX:1.2,scaleY:1.2,uploadStatus:'uploaded',url:preview},productionUrl:`https://res.cloudinary.com/test/raw/upload/${p.id}.pdf`,productionFileKey:p.id+'-print'};});
 for(const p of panels)p.preview.compositionSignature=buildCompositionSignatureFromPreview(p.preview);
 return {product_type:'specialty',quantity:2,width_in:panels[0].composition.widthIn,height_in:panels[0].composition.heightIn,line_total_cents:1,unit_price_cents:1,specialty_config:{version:1,productSlug:slug,variantId:variant.id,panels}};
}
test('all 51 configurations have priced, registered artwork panels and catalog images',()=>{
 assert.equal(catalog.length,19);assert.equal(catalog.reduce((n,p)=>n+p.variants.length,0),51);
 for(const p of catalog)for(const v of p.variants){assert.ok(v.priceCents>0);assert.ok(v.panels.length);assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname,'../../../public',p.image)));for(const panel of v.panels){const t=templates[panel.templateId];assert.ok(t.widthIn>0&&t.heightIn>0);assert.ok(t.exportScale>0&&t.exportScale<=1);}}
});
test('retail totals are rebuilt from the registered variant, ignoring browser amounts',()=>{
 const item=itemFor('deluxe-retractable-banner',1);const clean=normalizeSpecialtyItem(item);assert.equal(clean.unit_price_cents,45299);assert.equal(clean.line_total_cents,90598);assert.equal(clean.specialty_config.panels.length,2);
});
test('tent panels, source placement and permanent production uploads are required',()=>{
 const complete=itemFor('custom-event-tents',2);assert.equal(normalizeSpecialtyItem(complete).specialty_config.panels.length,4);
 for(const change of [x=>x.specialty_config.panels.pop(),x=>x.specialty_config.panels[0].composition.transform.xPct=9,x=>x.specialty_config.panels[0].templateId='wrong',x=>x.specialty_config.panels[0].productionUrl='blob:temporary']){const item=structuredClone(complete);change(item);assert.throws(()=>normalizeSpecialtyItem(item));}
});
test('custom signs enforce shipped dimensions and poster minimums',()=>{
 const poster=catalog.find(p=>p.slug==='display-posters');assert.equal(priceSpecialty(poster,poster.variants[0],6,6),1799);
 const aluminum=catalog.find(p=>p.slug==='aluminum-signs');assert.equal(priceSpecialty(aluminum,aluminum.variants[0],24,18),4497);assert.throws(()=>priceSpecialty(aluminum,aluminum.variants[0],96,48));
});
test('specialty items cannot reach payment before pricing and fulfillment are verified',()=>{
 assert.throws(()=>repriceStripeCart([itemFor('standard-retractable-banner')]),e=>e.code==='SPECIALTY_PRICE_NOT_VERIFIED');
 assert.throws(()=>repriceStripeCart([itemFor('feather-flags')]),e=>e.code==='SPECIALTY_FULFILLMENT_NOT_READY');
});
test('AI fit uses a registered template and rejects mismatched dimensions',()=>{
 const p=catalog.find(p=>p.slug==='feather-flags'),v=p.variants[0],t=templates[v.panels[0].templateId];const type=`specialty:${p.slug}:${v.id}:front`;const body={productType:type,widthIn:t.widthIn,heightIn:t.heightIn,sourceImage:'data:image/png;base64,eA=='};
 assert.equal(validateFitRequest(body).productType,type);assert.throws(()=>validateFitRequest({...body,widthIn:t.widthIn+2}));
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

test('new matched prices follow Lexington configurations without changing legacy pricing',()=>{
 for(const [slug,indices,prices] of [
 ['feather-flags',[0,1,2,3],[17500,19500,20500,24500]],
 ['standard-table-throws',[2,3,4,5],[18500,22000,21000,25000]],
 ['custom-event-tents',[0,1,2],[75500,116000,142000]],
 ['step-and-repeat-backdrop',[0,1],[46500,52500]]]){
  const p=catalog.find(x=>x.slug===slug);
  indices.forEach((i,n)=>{assert.equal(priceSpecialty(p,p.variants[i],24,18),prices[n]);assert.equal(p.variants[i].priceMatch.shippingPolicy,'free_overnight_after_production');});
 }
 const acm=catalog.find(p=>p.slug==='aluminum-composite-signs');
 for(const [w,h,cents] of [[18,24,4800],[24,36,9000],[6,24,2600],[6,36,3600]]){
  assert.equal(priceSpecialty(acm,acm.variants[0],w,h),cents);assert.equal(priceSpecialty(acm,acm.variants[0],h,w),cents);
 }
 assert.equal(catalog.reduce((n,p)=>n+p.variants.filter(v=>v.priceMatch).length+(p.priceMatches?.length||0),0),17);
});
