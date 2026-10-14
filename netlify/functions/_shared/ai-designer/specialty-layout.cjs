'use strict';
const {resolveSpecialtyTemplate}=require('../specialty-products.cjs');

function layoutContext(type,width,height) {
  return String(type).startsWith('specialty:')?resolveSpecialtyTemplate(type,width,height):null;
}

function cropForRatio(width,height,ratio) {
  const w=Math.max(1,Math.min(width,Math.round(height*ratio)));
  const h=Math.max(1,Math.min(height,Math.round(width/ratio)));
  return {left:Math.floor((width-w)/2),top:Math.floor((height-h)/2),width:w,height:h};
}

async function layoutGuide(context,plan) {
  if(!context)return null;
  const sharp=require('sharp'),t=context.template;
  const area=cropForRatio(plan.providerWidth,plan.providerHeight,t.widthIn/t.heightIn);
  const shape=t.outline?`<path d="${t.outline}" fill="white"/>`:'<rect width="100" height="100" fill="white"/>';
  const front=t.faces?.front;
  const face=front?`<rect x="${front[0]*100}" y="${front[1]*100}" width="${front[2]*100}" height="${front[3]*100}" fill="#b8dfd0"/>`:'';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${plan.providerWidth}" height="${plan.providerHeight}"><rect width="100%" height="100%" fill="#555555"/><svg x="${area.left}" y="${area.top}" width="${area.width}" height="${area.height}" viewBox="0 0 100 100" preserveAspectRatio="none">${shape}${face}</svg></svg>`;
  return {buffer:await sharp(Buffer.from(svg)).png().toBuffer(),mimeType:'image/png'};
}

function guideInstruction(context,index='SECOND') {
  if(!context)return '';
  return `The ${index} image is the exact product layout on the requested API canvas, NOT design content. White is the printable silhouette; dark gray is discarded. Place all essential wording and subjects comfortably INSIDE the white silhouette. Pale green, if present, marks the FRONT table face: put main wording and logo inside that face, and extend coordinated backgrounds over the other faces. ${context.template.doubleFlag?'The two silhouettes are separate front and back print faces, not one continuous picture. Each face needs a complete readable design.':''} Never copy guide colors, borders, labels or hardware. Fill the output canvas with artwork; only background may extend outside the printable silhouette.`;
}

async function visibleArtwork(buffer,context) {
  const t=context?.template;
  if(!t||(!t.outline&&!t.faces?.front))return buffer;
  const sharp=require('sharp'),meta=await sharp(buffer).metadata(),front=t.faces?.front;
  const shape=front?`<rect x="${front[0]*100}" y="${front[1]*100}" width="${front[2]*100}" height="${front[3]*100}" fill="white"/>`:`<path d="${t.outline}" fill="white"/>`;
  const mask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}" viewBox="0 0 100 100" preserveAspectRatio="none">${shape}</svg>`);
  return sharp(buffer).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).flatten({background:'#ffffff'}).jpeg({quality:96}).toBuffer();
}

module.exports={layoutContext,cropForRatio,layoutGuide,guideInstruction,visibleArtwork};
