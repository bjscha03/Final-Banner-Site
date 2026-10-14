'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {assertReadyPlacementPreview,buildCompositionSignatureFromPreview}=require('../_shared/preview-artifact.cjs');

function panel(){
 const preview={version:3,uploadStatus:'uploaded',previewUrl:'https://res.cloudinary.com/test/image/upload/proof.png',sourceUrl:'https://res.cloudinary.com/test/image/upload/source.png',previewPublicId:'proof',sourceIdentity:'source',productType:'specialty:feather-flags:feather-flags-1:front',widthIn:25,heightIn:80,fitMode:'fit',positionPct:{x:0,y:0},scaleX:1,scaleY:1,compositionRevision:0,previewWidthPx:250,previewHeightPx:800};
 preview.compositionSignature=buildCompositionSignatureFromPreview(preview);
 return {preview,productionUrl:'https://res.cloudinary.com/test/raw/upload/flag.pdf',productionFileKey:'flag'};
}
function job(items){
 const queries=[],rendered=[],exports={};
 const sql=async(parts,...values)=>{const query=parts.join('?');queries.push({query,values});return /SELECT/.test(query)?items:[];};
 vm.runInNewContext(fs.readFileSync(require.resolve('../_shared/legacy/generate-paid-order-pdfs-background.cjs'),'utf8'),{exports,process:{env:{DATABASE_URL:'postgres://test.invalid/db'}},console:{error(){}},require(name){
  if(name==='@neondatabase/serverless')return {neon:()=>sql};
  if(name==='./render-order-pdf.cjs')return {handler:async event=>{rendered.push(JSON.parse(event.body));return {statusCode:200};}};
  if(name==='../preview-artifact.cjs')return {assertReadyPlacementPreview};
  if(name==='../original-artwork-url.cjs')return require('../_shared/original-artwork-url.cjs');
  throw new Error('Unexpected production dependency '+name);
 }});
 return {run:()=>exports.handler({__internal:true,body:JSON.stringify({orderId:'order',skipNotifications:true})}),queries,rendered};
}
test('paid mixed order retains every specialty PDF and renders its legacy banner normally',async()=>{
 const saved={kind:'specialty',configuration:{panels:[panel(),panel()]}};
 const j=job([{id:'flag',canvas_state_json:JSON.stringify(saved)},{id:'banner',width_in:72,height_in:36,canvas_state_json:{objects:[]}}]);
 const response=await j.run();
 assert.equal(response.statusCode,200);assert.equal(j.rendered.length,1);assert.equal(j.rendered[0].itemId,'banner');
 assert.ok(j.queries.some(q=>/production_pdf_status='generated'/.test(q.query)&&q.values.includes('flag')));
 assert.equal(saved.configuration.panels[0].productionUrl,'https://res.cloudinary.com/test/raw/upload/flag.pdf');
});
test('missing or temporary specialty production files fail without falling back to banner rendering',async()=>{
 for(const bad of [[],[{...panel(),productionUrl:'blob:temporary'}],[{...panel(),preview:{...panel().preview,compositionRevision:4}}]]){
  const j=job([{id:'flag',canvas_state_json:{kind:'specialty',configuration:{panels:bad}}}]);
  const response=await j.run();assert.equal(response.statusCode,500);assert.equal(j.rendered.length,0);
  assert.ok(j.queries.some(q=>/production_pdf_status = 'failed'/.test(q.query)));
 }
});
test('large specialty print PDFs remain available to the paid order production job',async()=>{
 const large={...panel(),productionUrl:'https://bannersonthefly.com/artwork-original/12345678-1234-1234-1234-123456789abc/original.pdf'};
 const j=job([{id:'tent',canvas_state_json:{kind:'specialty',configuration:{panels:[large]}}}]);
 assert.equal((await j.run()).statusCode,200);assert.equal(j.rendered.length,0);
 assert.ok(j.queries.some(q=>/production_pdf_status='generated'/.test(q.query)&&q.values.includes('tent')));
});
