import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import sharp from 'sharp';
const require=createRequire(import.meta.url);
const {catalog,templates}=require('../_shared/specialty-products.cjs');
const {allPanelDefinitions}=require('../../../shared/specialty-options.cjs');
const {normalizeBrief}=require('../_shared/ai-designer/schema.cjs');
const {validateFitRequest,runFitRequest}=require('../_shared/ai-designer/fit.cjs');
const {planCanvas}=require('../_shared/ai-designer/image-utils.cjs');
const {layoutContext,layoutGuide,cropForRatio,visibleArtwork}=require('../_shared/ai-designer/specialty-layout.cjs');
const cases=catalog.flatMap(product=>product.variants.flatMap(variant=>allPanelDefinitions(variant).map(panel=>({productType:`specialty:${product.slug}:${variant.id}:${panel.id}`,...templates[panel.templateId]}))));
const inventory={lines:['FARM MARKET'],elements:['Farm logo'],allTextLegible:true,contentPreserved:true,confidence:1,issues:[],blockingIssues:[]};
describe('supplier geometry throughout AI',()=>{
 it.each(cases)('preserves exact dimensions of $productType',target=>{
  const brief=normalizeBrief({...target,description:'FARM MARKET'});
  expect([brief.widthIn,brief.heightIn]).toEqual([target.widthIn,target.heightIn]);
  expect(validateFitRequest({...target,sourceImage:'data:image/png;base64,eA=='}).productType).toBe(target.productType);
  const plan=planCanvas(brief.widthIn,brief.heightIn);
  expect(plan.providerWidth%16).toBe(0);expect(plan.providerHeight%16).toBe(0);
  expect(Math.max(plan.providerWidth/plan.providerHeight,plan.providerHeight/plan.providerWidth)).toBeLessThanOrEqual(3);
 });
 it('honors the supplier custom poster limit without applying the banner 600-inch cap',()=>{
  const target={productType:'specialty:display-posters:display-posters-1:front',widthIn:1908,heightIn:52,description:'Market'};
  expect(normalizeBrief(target).widthIn).toBe(1908);
  expect(()=>normalizeBrief({...target,widthIn:1909})).toThrow();
  expect(()=>normalizeBrief({...target,productType:'banner'})).toThrow();
 });
 it('aligns the flag cut path inside the provider crop, not across the discarded canvas',async()=>{
  const target=cases.find(t=>t.id==='angled-small'),context=layoutContext(target.productType,target.widthIn,target.heightIn),plan=planCanvas(target.widthIn,target.heightIn);
  const guide=await layoutGuide(context,plan),meta=await sharp(guide.buffer).metadata();
  expect([meta.width,meta.height]).toEqual([plan.providerWidth,plan.providerHeight]);
  const crop=cropForRatio(meta.width,meta.height,target.widthIn/target.heightIn);
  expect(crop.width).toBeLessThan(meta.width);
  const outside=await sharp(guide.buffer).extract({left:0,top:meta.height/2,width:1,height:1}).removeAlpha().raw().toBuffer();
  expect([...outside]).toEqual([85,85,85]);
 });
 it('checks the actual shaped flag after fitting and returns its product identity',async()=>{
  const target=cases.find(t=>t.id==='teardrop-medium');
  const input=await sharp({create:{width:120,height:180,channels:3,background:'#e85c29'}}).png().toBuffer();
  const edit=vi.fn(async()=>({buffer:input,model:'test'})),inspect=vi.fn(async()=>inventory);
  const result=await runFitRequest({...target,sourceImage:'data:image/png;base64,'+input.toString('base64')},{sub:'test'},'flag-regression',undefined,{edit,inspect});
  expect(result.fit.productType).toBe(target.productType);expect(result.fit.verification.canApply).toBe(true);
  expect(edit.mock.calls[0][0].referenceImage.mimeType).toBe('image/png');
  const output=Buffer.from(result.fit.imageBase64,'base64');
  const checked=await visibleArtwork(output,layoutContext(target.productType,target.widthIn,target.heightIn));
  expect(inspect.mock.calls[1][0].candidate.buffer.equals(checked)).toBe(true);
 });
});
