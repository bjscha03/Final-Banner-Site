'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../../../shared/specialty-catalog.json');
const engine=require('../../../shared/specialty-options.cjs');
const quote=(slug,w,h,options={})=>{const p=catalog.find(p=>p.slug===slug);return engine.priceConfiguration(p,p.variants[0],w,h,options);};
function configurations(variant) {
 const groups=engine.profileFor(variant).groups,results=[];
 function visit(i,input){
  if(i===groups.length){results.push(input);return;}
  const group=groups[i],values={...variant.baselineOptions,...input,...variant.supplierFixed};
  if(variant.supplierFixed?.[group.key]!==undefined||!engine.matches(group.visible,values))return visit(i+1,input);
  for(const option of group.options.filter(o=>engine.matches(o.visible,values)))visit(i+1,{...input,[group.key]:String(option.key)});
 }
 visit(0,{});return results;
}
test('every selectable configuration has a positive complete quote and included next-day air',()=>{
 let count=0;
 for(const p of catalog)for(const v of p.variants)for(const options of configurations(v)){
  const size=options.size?.match(/^(\d+)x(\d+)$/),w=p.priceUnit==='sqft'&&size?Number(size[1]):24,h=p.priceUnit==='sqft'&&size?Number(size[2]):18;
  const q=engine.priceConfiguration(p,v,w,h,options);
  assert.equal(q.verified,true,`${v.id} ${JSON.stringify(options)} ${q.missing}`);
  assert.ok(Number.isInteger(q.unitCents)&&q.unitCents>0,v.id);
  assert.equal(q.shippingPolicy,'free_overnight_after_production');count++;
 }
 assert.ok(count>1000);console.log(`Checked ${count} selectable configurations across 58 variants.`);
});
test('revised configurations meet the independently audited price floors',()=>{
 const quotes=require('./fixtures/specialty-price-floors-2026-10-14.json');
 assert.equal(quotes.length,175);
 for(const row of quotes){
  const p=catalog.find(p=>p.slug===row.slug),v=p.variants.find(v=>v.id===row.variantId);
  const q=engine.priceConfiguration(p,v,row.width,row.height,row.options);
  assert.ok(q.unitCents>=row.minimumListCents,row.label);
  assert.equal(q.proposed,true);
 }
 assert.equal(quote('rectangle-flags',25,80).unitCents,43900);
 const p=catalog.find(p=>p.slug==='standard-retractable-banner');
 assert.equal(engine.priceConfiguration(p,p.variants[3],47,81).unitCents,44900);
 assert.equal(quote('custom-event-tents',119,84).unitCents,112900);
});
test('custom dimensions and source prices remain separate from the new proposals',()=>{
 for(const s of ['acrylic-signs','aluminum-signs','aluminum-composite-signs','display-posters']){
  assert.equal(quote(s,20.25,31.75).unitCents,quote(s,31.75,20.25).unitCents);
 }
 assert.throws(()=>quote('display-posters',53,53));
 assert.throws(()=>quote('aluminum-signs',24,36,{size:'12x18'}));
 assert.equal(quote('acrylic-signs',6,6).unitCents,12000);
 assert.equal(quote('acrylic-signs',6,6,{hardware:'acrylic'}).unitCents,8500);
 assert.equal(quote('display-posters',24,36).unitCents,10900);
 assert.equal(quote('aluminum-signs',18,24,{sides:'2'}).unitCents,15200);
});
test('unpriced or invalid input still cannot become a zero-dollar or client-priced order',()=>{
 const p=catalog[0],v=structuredClone(p.variants[0]);delete v.priceProposal;
 assert.equal(engine.priceConfiguration(p,v,23,66).verified,false);
 delete v.optionPrices.material['13oz_matte_vinyl_banner'];
 assert.equal(engine.priceConfiguration(p,v,23,66,{material:'13oz_matte_vinyl_banner'}).verified,false);
 assert.throws(()=>engine.priceConfiguration(p,p.variants[0],23,66,{hardware:'free'}));
});
test('historical retail references are retained without overriding current prices',()=>{
 const p=catalog.find(p=>p.slug==='aluminum-composite-signs');
 assert.equal(p.priceMatches.find(x=>x.widthIn===18).priceCents,4800);
 const q=quote(p.slug,18,24,{sides:'2'});
 assert.equal(q.unitCents,7250);assert.equal(q.proposed,true);
});
test('20% cap protects specialty and mixed carts from percentage and fixed promotions',()=>{
 const {computeTotals}=require('../_shared/checkoutTotals.cjs');
 const specialty={product_type:'specialty',quantity:1,line_total_cents:44900};
 for(const promo of [{code:'SARAH30',discountPercentage:30},{code:'FIXED',discountAmountCents:40000}]){
  const t=computeTotals([specialty],.06,{freeShipping:true},promo);
  assert.equal(t.applied_discount_cents,8980);assert.equal(t.shipping_cents,0);assert.equal(t.total_cents,38075);
 }
 const mixed=computeTotals([specialty,{product_type:'banner',quantity:1,line_total_cents:10000}],0,{freeShipping:true},{code:'SARAH30',discountPercentage:30});
 assert.equal(mixed.applied_discount_cents,10980);
 const banner=computeTotals([{product_type:'banner',quantity:1,line_total_cents:10000}],0,{freeShipping:true},{code:'SARAH30',discountPercentage:30});
 assert.equal(banner.applied_discount_cents,3000);
});
