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
test('rigid and poster rates, per-item minimums, mounting and print sides calculate independently',()=>{
 for(const [s,w,h,opts,total] of [
  ['acrylic-signs',6,6,{},9000],['acrylic-signs',6,6,{hardware:'acrylic'},6500],
  ['acrylic-signs',18,24,{},12100],['acrylic-signs',24,18,{hardware:'acrylic'},9600],
  ['aluminum-signs',12,12,{sides:'2'},5500],['aluminum-signs',18,24,{sides:'2',cornerstyle:'R',holespunch:'TL;TR;BL;BR'},9600],
  ['aluminum-composite-signs',20,30,{sides:'2'},7709],
  ['aluminum-composite-signs',6,24,{sides:'2'},2800],
  ['display-posters',6,6,{},3900],['display-posters',24,36,{},5100],
  ['display-posters',52,1908,{},585650]
 ])assert.equal(quote(s,w,h,opts).unitCents,total,`${s} ${w}x${h}`);
 for(const s of ['acrylic-signs','aluminum-signs','aluminum-composite-signs','display-posters'])assert.equal(quote(s,20.25,31.75).unitCents,quote(s,31.75,20.25).unitCents);
 assert.throws(()=>quote('display-posters',53,53));
 assert.throws(()=>quote('aluminum-signs',24,36,{size:'12x18'}));
 assert.equal(quote('aluminum-signs',12,18,{size:'12x18'}).unitCents,4500);
});
test('replacement graphics remove hardware once and tent walls charge per selected panel including half-wall hardware',()=>{
 assert.equal(quote('standard-retractable-banner',23,66,{hardware:'p',material:'13oz_matte_vinyl_banner'}).unitCents,8900);
 assert.equal(quote('feather-flags',25,80,{flag_pole_tab:'0',sides:'2',carrybag:'1'}).unitCents,18900);
 assert.equal(quote('custom-event-tents',119,84,{tent_hardware:'0',tent_full_wall:'AB',tent_half_wall:'2x2'}).unitCents,160500);
 const p=catalog.find(p=>p.slug==='custom-event-tents'),v=p.variants[2];
 assert.equal(engine.priceConfiguration(p,v,128,84,{tent_full_wall_long:'L2',tent_half_wall:'2x1'}).unitCents,277600);
});
test('unpriced or invalid input still cannot become a zero-dollar or client-priced order',()=>{
 const p=catalog[0],v=structuredClone(p.variants[0]);delete v.priceProposal;
 assert.equal(engine.priceConfiguration(p,v,23,66).verified,false);
 delete v.optionPrices.material['13oz_matte_vinyl_banner'];
 assert.equal(engine.priceConfiguration(p,v,23,66,{material:'13oz_matte_vinyl_banner'}).verified,false);
 assert.throws(()=>engine.priceConfiguration(p,p.variants[0],23,66,{hardware:'free'}));
});
test('exact ACM overrides and existing kit prices retain published provenance',()=>{
 const p=catalog.find(p=>p.slug==='aluminum-composite-signs');
 for(const [w,h,expected] of [[18,24,5800],[24,36,11000],[6,24,2800],[6,36,4200]]){
  const q=engine.priceConfiguration(p,p.variants[0],w,h,{sides:'2'});assert.equal(q.unitCents,expected);assert.equal(q.proposed,false);
 }
 assert.equal(quote('feather-flags',25,80,{sides:'2',flaghardware:'PB',carrybag:'1'}).proposed,false);
});
