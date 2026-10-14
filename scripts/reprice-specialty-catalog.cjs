'use strict';
// Run with the previous catalog and private, mapped supplier quote JSON.
// Keep the mapped cost input private; do not commit it. Only retail prices/provenance are written into the storefront catalog.
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../shared/specialty-options.cjs');
const policy=require('../shared/specialty-pricing-policy.json');
const [sourcePath,quotesPath]=process.argv.slice(2);
if(!sourcePath||!quotesPath)throw new Error('Usage: node scripts/reprice-specialty-catalog.cjs <previous-catalog.json> <mapped-quotes.json>');
const catalog=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const quotes=JSON.parse(fs.readFileSync(quotesPath,'utf8'));
const denominator=(1-policy.maximumDiscountPercent/100)*(1-policy.estimatedProcessingPercent/100-policy.targetContributionMarginPercent/100);
const roundFive=c=>Math.ceil((c-1e-7)/500)*500;
const roundNine=c=>Math.ceil((c+100-1e-7)/1000)*1000-100;
const floor=q=>roundNine((Math.round(Number(q.total)*100)+policy.estimatedProcessingFixedCents)/denominator);
const variants=catalog.flatMap(p=>p.variants.map(v=>({p,v})));
const byId=Object.fromEntries(variants.map(({v})=>[v.id,v]));
const family=v=>v.supplierProfile.includes('retractable')?'retractable':v.supplierProfile.includes('flag')?'flag':v.supplierProfile;
const deltas=[];
for(const a of quotes)for(const b of quotes){
 if(a.variantId!==b.variantId||a.width!==b.width||a.height!==b.height)continue;
 const keys=Object.keys(a.options).filter(k=>a.options[k]!==b.options[k]);
 if(keys.length!==1)continue;
 const key=keys[0],v=byId[a.variantId];
 if(a.options[key]!==v.baselineOptions[key])continue;
 const costDelta=Math.max(0,Math.round((Number(b.cost)-Number(a.cost))*100));
 const freightDelta=Math.max(0,Math.round((Number(b.shipping)-Number(a.shipping))*100));
 deltas.push({variantId:v.id,family:family(v),key,value:b.options[key],amount:costDelta+freightDelta});
}
const review=[];
for(const {p,v} of variants){
 const old=structuredClone(v),b=engine.optionsFor(v);
 const own=quotes.filter(q=>q.variantId===v.id);
 const base=own.find(q=>Object.keys(b).every(k=>q.options[k]===b[k]));
 const isArea=p.priceUnit==='sqft';
 v.priceProposal={status:'pending_john_approval',revision:policy.revision,proposedAt:policy.updatedAt,
  basis:base?'Cost-led proposal: 20% maximum discount, 35% contribution target after estimated 3% + $0.30 processing. Quote destination and unquoted options require approval.':'Provisional retail uplift of 25%; supplier costs and profit remain TBD until John confirms. No profit guarantee.',
  sourceUrls:[engine.profileFor(v).sourceUrl],shippingAllowanceCents:base?Math.round(Number(base.shipping)*100):old.priceProposal?.shippingAllowanceCents||0};
 if(!isArea){
  if(!base)throw new Error('Missing fixed baseline quote: '+v.id);
  v.priceCents=Math.max(old.priceCents,floor(base));
 }
 for(const [key,values] of Object.entries(v.optionPrices||{}))for(const [value,oldCents] of Object.entries(values)){
  if(value===b[key])continue;
  if(oldCents<0&&!isArea){
   const replacement=own.find(q=>q.options[key]===value&&Object.keys(b).every(k=>k===key||q.options[k]===b[k]));
   if(!replacement)throw new Error('Missing replacement quote: '+v.id+' '+key);
   values[value]=Math.max(old.priceCents+oldCents,floor(replacement))-v.priceCents;
   continue;
  }
  let observed=deltas.filter(d=>d.variantId===v.id&&d.key===key&&d.value===value);
  let source='same variant quote difference';
  if(!observed.length){observed=deltas.filter(d=>d.family===family(v)&&d.key===key&&d.value===value);source='borrowed family quote difference; exact combination unconfirmed';}
  if(observed.length)values[value]=Math.max(oldCents,roundFive(Math.max(...observed.map(d=>d.amount))/denominator));
  else {values[value]=oldCents<0?-roundFive(Math.abs(oldCents)*1.25):roundFive(oldCents*1.25);source='25% provisional retail uplift; exact cost unconfirmed';}
  review.push({variantId:v.id,key,value,oldCents,newCents:values[value],source});
 }
 // Multi-wall options charge the same revised price per wall. Their combined freight is not quoted.
 for(const key of ['tent_full_wall','tent_full_wall_long','tent_half_wall']){
  const values=v.optionPrices?.[key],before=old.optionPrices?.[key];if(!values)continue;
  for(const [value,oldCents] of Object.entries(before)){
   const single=key==='tent_half_wall'?('1x'+value.split('x')[1]):key==='tent_full_wall_long'?'L1':value.startsWith('S')?'S1':'A';
   if(before[single]>0)values[value]=Math.max(values[value],Math.round(oldCents/before[single])*values[single]);
  }
 }
 if(isArea){
  if(p.slug==='aluminum-signs'){
   // $6.60/sq ft single print observed at 18x24; freight fixed at quoted $35.98.
   v.priceCents=1400;p.minOrderCents=2500;v.baseAddCents=7500;
   v.areaOptionPrices.sides['2']={perSqFtCents:1000,minimumCents:1000};
   v.priceProposal.basis='Area extrapolation from 18x24 B2Sign quote: $14/sq ft (minimum $25) + $75 included freight allowance; second side $10/sq ft (minimum $10). Other sizes/freight unconfirmed.';
  }else if(p.slug==='display-posters'){
   v.priceCents=400;p.minOrderCents=1700;v.baseAddCents=7500;
   v.priceProposal.basis='Area extrapolation from two B2Sign quotes: $4/sq ft (minimum $17) + $75 included freight allowance. Unquoted sizes and oversize freight unconfirmed.';
  }else{
   v.priceCents=Math.ceil(old.priceCents*1.25);p.minOrderCents=roundFive(p.minOrderCents*1.25);
   if(old.baseAddCents)v.baseAddCents=roundFive(old.baseAddCents*1.25);
   for(const values of Object.values(v.areaOptionPrices||{}))for(const rate of Object.values(values)){rate.perSqFtCents=Math.ceil(rate.perSqFtCents*1.25);rate.minimumCents=Math.ceil(rate.minimumCents*1.25);}
   for(const rule of v.dimensionOptionPrices||[])rule.addCents=Math.ceil(rule.addCents*1.25);
   if(p.priceMatches)p.retailPriceOverrides=p.priceMatches.map(r=>({widthIn:r.widthIn,heightIn:r.heightIn,priceCents:roundFive(r.priceCents*1.25)}));
  }
 }
}
// Enforce the target on every observed whole configuration, including interaction effects.
for(let pass=0;pass<3;pass++)for(const q of quotes){
 const {p,v}=variants.find(x=>x.v.id===q.variantId);
 const current=engine.priceConfiguration(p,v,q.width,q.height,q.options).unitCents;
 const required=floor(q);
 if(current>=required)continue;
 const changes=Object.keys(q.options).filter(k=>q.options[k]!==v.baselineOptions[k]&&Number.isInteger(v.optionPrices?.[k]?.[q.options[k]])&&v.optionPrices[k][q.options[k]]>=0);
 const key=changes.find(k=>k!=='size');
 if(key)v.optionPrices[key][q.options[key]]+=roundFive(required-current);
 else if(p.priceUnit==='sqft')v.baseAddCents=(v.baseAddCents||0)+roundFive(required-current);
 else {const bump=roundFive(required-current);v.priceCents+=bump;}
}
const output=path.resolve(__dirname,'../shared/specialty-catalog.json');
fs.writeFileSync(output,JSON.stringify(catalog,null,2)+'\n');
const report={policy,options:review,quotes:quotes.map(q=>{
 const {p,v}=variants.find(x=>x.v.id===q.variantId),retailCents=engine.priceConfiguration(p,v,q.width,q.height,q.options).unitCents;
 const sellCents=Math.round(retailCents*.8),feeCents=Math.round(sellCents*.03)+30,totalCents=Math.round(Number(q.total)*100);
 const contributionCents=sellCents-totalCents-feeCents;
 if(contributionCents/sellCents<.35-1e-9)throw new Error('Margin failed: '+q.label);
 return {...q,oldRetailCents:Math.round(Number(q.retail)*100),retailCents,sellCents,feeCents,contributionCents,margin:contributionCents/sellCents};
})};
fs.writeFileSync(path.resolve(path.dirname(quotesPath),'revised-pricing-review.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({variants:variants.length,quotes:report.quotes.length,minMargin:Math.min(...report.quotes.map(q=>q.margin)),changedQuotes:report.quotes.filter(q=>q.retailCents!==q.oldRetailCents).length}));
