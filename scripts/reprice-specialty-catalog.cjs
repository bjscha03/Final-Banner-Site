'use strict';
// Input contains private buying costs: never commit it or the generated review.
const fs=require('node:fs'),path=require('node:path');
const engine=require('../shared/specialty-options.cjs');
const {priceForMargin}=require('../shared/specialty-margin.cjs');
const policy=require('../shared/specialty-pricing-policy.json');
const [sourcePath,quotesPath]=process.argv.slice(2);
if(!sourcePath||!quotesPath)throw new Error('Usage: node scripts/reprice-specialty-catalog.cjs <previous-catalog.json> <private-mapped-quotes.json>');
const catalog=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const quotes=JSON.parse(fs.readFileSync(quotesPath,'utf8'));
const denominator=(1-policy.maximumDiscountPercent/100)*(1-policy.estimatedProcessingPercent/100-policy.targetContributionMarginPercent/100);
const variants=catalog.flatMap(p=>p.variants.map(v=>({p,v})));
const family=v=>v.supplierProfile.includes('retractable')?'retractable':v.supplierProfile.includes('flag')?'flag':v.supplierProfile;
for(const q of quotes){
 const {v}=variants.find(x=>x.v.id===q.variantId);
 q.normalized=engine.optionsFor(v,q.options,true);
 q.totalCents=q.totalCents??Math.round(Number(q.total)*100);
 q.target=priceForMargin(q.totalCents,policy);
}
const deltas=[];
for(const a of quotes)for(const b of quotes){
 if(a.variantId!==b.variantId||a.width!==b.width||a.height!==b.height)continue;
 const keys=Object.keys(a.normalized).filter(k=>a.normalized[k]!==b.normalized[k]);
 if(keys.length!==1)continue;
 const key=keys[0],{v}=variants.find(x=>x.v.id===a.variantId);
 if(a.normalized[key]!==v.baselineOptions[key])continue;
 deltas.push({variantId:v.id,family:family(v),key,value:b.normalized[key],amount:b.totalCents-a.totalCents});
}
const review=[];
for(const {p,v} of variants){
 const old=structuredClone(v),baseline=engine.optionsFor(v);
 const own=quotes.filter(q=>q.variantId===v.id);
 const base=own.find(q=>Object.keys(baseline).every(k=>q.normalized[k]===baseline[k]));
 const isArea=p.priceUnit==='sqft';
 v.priceProposal={status:'pending_john_approval',revision:policy.revision,proposedAt:policy.updatedAt,
  basis:own.length?'30% contribution after 20% off and estimated processing. Quoted configurations use exact retail totals; other combinations are estimates pending cost confirmation.':'Supplier cost and shipping TBD. Existing provisional retail retained; 30% margin cannot be verified.',
  sourceUrls:[engine.profileFor(v).sourceUrl]};
 if(!own.length){delete v.configurationPrices;continue;}
 if(!isArea){if(!base)throw new Error('Missing fixed baseline: '+v.id);v.priceCents=base.target.listCents;}
 for(const [key,values] of Object.entries(v.optionPrices||{}))for(const [value,oldCents] of Object.entries(values)){
  if(value===baseline[key])continue;
  const single=base&&own.find(q=>q.normalized[key]===value&&Object.keys(baseline).every(k=>k===key||q.normalized[k]===baseline[k])&&q.width===base.width&&q.height===base.height);
  let source='unquoted prior retail estimate adjusted to the new margin target';
  if(single){values[value]=single.target.listCents-base.target.listCents;source='quoted single-option configuration';}
  else{
   let observed=deltas.filter(d=>d.variantId===v.id&&d.key===key&&d.value===value);
   if(!observed.length)observed=deltas.filter(d=>d.family===family(v)&&d.key===key&&d.value===value);
   if(observed.length){values[value]=Math.round(Math.max(...observed.map(d=>d.amount))/denominator);source='estimated from related quoted option differences';}
   else values[value]=Math.round(oldCents*.62/.67);
  }
  review.push({variantId:v.id,key,value,priceCents:values[value],source});
 }
 for(const key of ['tent_full_wall','tent_full_wall_long','tent_half_wall']){
  const values=v.optionPrices?.[key],before=old.optionPrices?.[key];if(!values)continue;
  for(const [value,oldCents] of Object.entries(before)){
   const single=key==='tent_half_wall'?('1x'+value.split('x')[1]):key==='tent_full_wall_long'?'L1':value.startsWith('S')?'S1':'A';
   if(before[single]>0)values[value]=Math.round(oldCents/before[single])*values[single];
  }
 }
 if(isArea){
  delete p.retailPriceOverrides;
  if(p.slug==='aluminum-signs'){
   v.priceCents=Math.round(base.supplierCents/(base.width*base.height/144)/denominator);p.minOrderCents=Math.round(2500*.62/.67);
   v.baseAddCents=Math.round((base.shippingCents+policy.estimatedProcessingFixedCents)/denominator);
   const double=own.find(q=>q.normalized.sides==='2');
   v.areaOptionPrices.sides['2']={perSqFtCents:Math.round((double.supplierCents-base.supplierCents)/(base.width*base.height/144)/denominator),minimumCents:Math.round(1000*.62/.67)};
  }else if(p.slug==='display-posters'){
   const largest=own.reduce((a,b)=>a.width*a.height>b.width*b.height?a:b);
   v.priceCents=Math.round(largest.supplierCents/(largest.width*largest.height/144)/denominator);p.minOrderCents=Math.round(Math.min(...own.map(q=>q.supplierCents))/denominator);
   v.baseAddCents=Math.round((base.shippingCents+policy.estimatedProcessingFixedCents)/denominator);
  }
  v.priceProposal.basis+=' Custom dimensions use extrapolated area rates and require a fresh supplier/freight quote.';
 }
 v.configurationPrices=own.map(q=>({...(isArea||v.customSize?{widthIn:q.width,heightIn:q.height}:{}),options:q.normalized,priceCents:q.target.listCents}));
}
const report={policy,options:review,quotes:quotes.map(({normalized,target,...q})=>({...q,retailCents:target.listCents,sellCents:target.paidCents,feeCents:target.feesCents,contributionCents:target.profitCents,margin:target.margin}))};
fs.writeFileSync(path.resolve(__dirname,'../shared/specialty-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.resolve(path.dirname(quotesPath),'revised-pricing-review.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({variants:variants.length,quotedConfigurations:quotes.length,unquotedFamilies:catalog.filter(p=>!quotes.some(q=>q.slug===p.slug)).map(p=>p.slug)}));
