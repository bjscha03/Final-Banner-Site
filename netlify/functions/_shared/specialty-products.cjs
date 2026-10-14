'use strict';
const catalog = require('../../../shared/specialty-catalog.json');
const release = require('../../../shared/specialty-release.json');
const templates = require('../../../shared/specialty-templates.json');
const optionsEngine=require('../../../shared/specialty-options.cjs');
const {assertReadyPlacementPreview}=require('./preview-artifact.cjs');
const {isStoredOriginalUrl}=require('./original-artwork-url.cjs');
function fail(code,message){throw Object.assign(new Error(message),{code,statusCode:409});}
function resolveSpecialtyTemplate(productType,widthIn,heightIn){
  if(!String(productType).startsWith('specialty:')||![widthIn,heightIn].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))fail('SPECIALTY_TEMPLATE_INVALID','Choose a valid product template and artwork size.');
  const [,slug,variantId,panelId,...extra]=String(productType).split(':');
  const product=catalog.find(p=>p.slug===slug);
  const variant=product?.variants.find(v=>v.id===variantId);
  const panel=variant&&optionsEngine.allPanelDefinitions(variant).find(p=>p.id===panelId);
  const registered=panel&&templates[panel.templateId];
  if(extra.length||!registered)fail('SPECIALTY_TEMPLATE_INVALID','Choose a registered product and artwork panel.');
  let template={...registered};
  if(product.priceUnit==='sqft'||variant.customSize){
    priceSpecialty(product,variant,widthIn,heightIn);
    template={...template,widthIn:Number(widthIn),heightIn:Number(heightIn)};
  } else if(Math.abs(Number(widthIn)-template.widthIn)>.001||Math.abs(Number(heightIn)-template.heightIn)>.001){
    fail('SPECIALTY_TEMPLATE_INVALID','Artwork dimensions do not match the selected product template.');
  }
  return {product,variant,panel,template};
}
function priceSpecialty(product,variant,width,height,options={}){
  try{return optionsEngine.priceConfiguration(product,variant,width,height,options).unitCents;}
  catch(error){fail('SPECIALTY_CONFIGURATION_INVALID',error.message);}
}
function priceMatchSpecialty(product,variant,width,height){return product.priceMatches?.find(p=>(p.widthIn===width&&p.heightIn===height)||(p.widthIn===height&&p.heightIn===width))||variant.priceMatch;}
const permanent=url=>{try{const u=new URL(url);return (u.protocol==='https:'&&u.hostname==='res.cloudinary.com'&&!u.username&&!u.password&&!u.port)||isStoredOriginalUrl(url);}catch{return false;}};
function normalizeSpecialtyItem(item){
  const config=item.specialty_config;
  const product=catalog.find(p=>p.slug===config?.productSlug);
  const variant=product?.variants.find(v=>v.id===config?.variantId);
  if(!product||!variant||config.version!==1)fail('SPECIALTY_CONFIGURATION_INVALID','This product configuration is unavailable.');
  if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100)fail('SPECIALTY_QUANTITY_INVALID','Choose a quantity from 1 to 100.');
  let options;try{options=optionsEngine.optionsFor(variant,config.options,true);}catch(error){fail('SPECIALTY_CONFIGURATION_INVALID',error.message);}
  const requiredPanels=optionsEngine.panelDefinitions(variant,options);
  const unit=priceSpecialty(product,variant,item.width_in,item.height_in,options);
  if(options.holespunch?.startsWith('custom')&&(!Array.isArray(config.customHoles)||!config.customHoles.length||config.customHoles.length>32||config.customHoles.some(h=>!Number.isFinite(h.xIn)||!Number.isFinite(h.yIn)||h.xIn<.5||h.yIn<.5||h.xIn>item.width_in-.5||h.yIn>item.height_in-.5)))fail('SPECIALTY_HOLES_INVALID','Specify valid mounting hole positions before ordering.');
  if(!Array.isArray(config.panels)||config.panels.length!==requiredPanels.length||new Set(config.panels.map(p=>p.id)).size!==requiredPanels.length)fail('SPECIALTY_PANELS_INVALID','Upload one artwork file for each required panel.');
  for(const expected of requiredPanels){
    const p=config.panels.find(p=>p.id===expected.id);
    if(!p||p.templateId!==expected.templateId)fail('SPECIALTY_PANELS_INVALID','An artwork panel does not match this configuration.');
    const type=`specialty:${product.slug}:${variant.id}:${p.id}`;
    const {template}=resolveSpecialtyTemplate(type,p.composition?.widthIn,p.composition?.heightIn);
    assertReadyPlacementPreview(p.preview,`specialty_config.panels.${p.id}.preview`);
    if(p.composition.version!==3||p.composition.fitMode!=='fit'||p.preview.fitMode!=='fit')fail('SPECIALTY_ARTWORK_STALE','Save the current artwork placement before checkout.');
    if((product.priceUnit==='sqft'||variant.customSize)&&(template.widthIn!==item.width_in||template.heightIn!==item.height_in))fail('SPECIALTY_ARTWORK_STALE','The artwork size must match the ordered sign size.');
    if(p.composition.productType!==type||p.composition.sourceUrl!==p.preview?.sourceUrl||p.composition.sourceIdentity!==p.preview?.sourceIdentity||p.preview?.uploadStatus!=='uploaded'||p.preview.productType!==type||p.preview.widthIn!==template.widthIn||p.preview.heightIn!==template.heightIn||p.preview.compositionRevision!==p.composition.revision)fail('SPECIALTY_ARTWORK_STALE','Save the current artwork and preview before checkout.');
    const t=p.composition.transform;
    if(t?.crop||p.preview.crop)fail('SPECIALTY_ARTWORK_STALE','Reopen this product and approve its full artwork placement. Specialty print files do not support image cropping.');
    if(!t||![t.xPct,t.yPct,t.scaleX,t.scaleY].every(Number.isFinite)||t.scaleX<=0||t.scaleY<=0||t.scaleX>5||t.scaleY>5||t.xPct!==p.preview.positionPct?.x||t.yPct!==p.preview.positionPct?.y||t.scaleX!==p.preview.scaleX||t.scaleY!==p.preview.scaleY)fail('SPECIALTY_ARTWORK_STALE','The preview placement does not match the artwork.');
    if(![p.artwork?.url,p.artwork?.productionUrl||p.artwork?.url,p.composition.sourceUrl,p.preview.url,p.productionUrl].every(permanent)||!p.productionFileKey)fail('SPECIALTY_UPLOAD_INCOMPLETE','An original file or print panel has not finished saving.');
  }
  const panels=requiredPanels.map(expected=>config.panels.find(p=>p.id===expected.id));
  return {...item,product_type:'specialty',material:'specialty',width_in:panels[0].composition.widthIn,height_in:panels[0].composition.heightIn,specialty_config:{...config,options,optionSummary:optionsEngine.optionSummary(variant,options),priceVerified:optionsEngine.priceConfiguration(product,variant,item.width_in,item.height_in,options).verified,panels,fulfillmentSupplier:product.fulfillmentSupplier,productName:product.name,variantLabel:variant.label,materialLabel:optionsEngine.materialLabel(product,variant,options)},unit_price_cents:unit,line_total_cents:unit*item.quantity,rope_feet:0,rope_cost_cents:0,pole_pockets:'none',pole_pocket_cost_cents:0,grommets:'none'};
}
function requireSpecialtyFulfillment(items){
  for(const item of items.filter(item=>item.product_type==='specialty')){
    const product=catalog.find(p=>p.slug===item.specialty_config?.productSlug),variant=product?.variants.find(v=>v.id===item.specialty_config?.variantId);
    if(product && (release.categories[product.category]===false || release.products[product.slug]===false))fail('SPECIALTY_PRODUCT_UNAVAILABLE',`${product.name} is not currently available to order. Your artwork is saved in your cart.`);
    const quote=product&&variant&&optionsEngine.priceConfiguration(product,variant,item.width_in,item.height_in,item.specialty_config?.options);
    if(!quote?.verified)fail('SPECIALTY_PRICE_NOT_VERIFIED',`${product?.name||'Product'}: pricing is not available for ${quote?.missing.join('; ')||'this configuration'}. Your artwork is saved in your cart.`);
    if(quote.shippingPolicy!=='free_overnight_after_production')fail('SPECIALTY_SHIPPING_NOT_VERIFIED',`${product.name}: shipping is not available for this configuration. Your artwork is saved in your cart.`);
  }
}
function specialtyPrompt(type,width,height){
  if(!String(type).startsWith('specialty:'))return '';
  const {product,panel,template}=resolveSpecialtyTemplate(type,width,height);
  return `PRODUCT TEMPLATE: ${product.name}, ${panel.label}, ${width} by ${height} inches, flat print artwork. ${template.fitNotes} ${template.safeInsetsIn?`Margins in inches, top/right/bottom/left: ${template.safeInsetsIn.join('/')}.`:''} ${template.faces?`Face rectangles as normalized x,y,width,height: ${JSON.stringify(template.faces)}. Keep all primary wording and logos on the FRONT face with at least 2 inches inset. Extend matching backgrounds onto top and sides.`:''} ${template.outline?`Printable boundary is the following path in a 0–100 by 0–100 artboard: ${template.outline}. All wording and main subjects must fit inside it.`:''} Never render template labels, measurements, guide lines, frames, stands, poles or product mockups.`;
}
module.exports={catalog,templates,resolveSpecialtyTemplate,priceSpecialty,priceMatchSpecialty,normalizeSpecialtyItem,requireSpecialtyFulfillment,specialtyPrompt};
