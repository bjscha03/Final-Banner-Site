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
 it.each(cases)('blocks generation and fitting for unqualified $productType',target=>{
  expect(()=>normalizeBrief({...target,description:'FARM MARKET'})).toThrow(/AI design and fitting are not available/);
  expect(()=>validateFitRequest({...target,sourceImage:'data:image/png;base64,eA=='})).toThrow(/AI design and fitting are not available/);
  const context=layoutContext(target.productType,target.widthIn,target.heightIn);
  expect([context.template.widthIn,context.template.heightIn]).toEqual([target.widthIn,target.heightIn]);
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
 it('rejects the specialty fit job before calling an image provider',async()=>{
  const target=cases.find(t=>t.id==='teardrop-medium');
  const edit=vi.fn(),inspect=vi.fn();
  await expect(runFitRequest({...target,sourceImage:'data:image/png;base64,eA=='},{sub:'test'},'flag-regression',undefined,{edit,inspect})).rejects.toMatchObject({code:'SPECIALTY_AI_UNAVAILABLE'});
  expect(edit).not.toHaveBeenCalled();expect(inspect).not.toHaveBeenCalled();
 });
});
