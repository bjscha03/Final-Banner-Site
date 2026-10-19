import {afterEach,describe,it,expect,vi} from 'vitest';
import {PDFDocument,PDFName,PDFNumber} from 'pdf-lib';
import {exportSpecialtyPanel,specialtyArtworkPpi} from './specialtyArtwork';
import {uploadArtworkFile} from '@/utils/uploadArtworkFile';
import type {UploadedArtworkFile} from './cartArtworkForEditor';
import type {ArtworkCompositionSpec} from './previewLifecycle';
import {getSpecialtyProduct,specialtyItemHasIncludedShipping,specialtyItemHasVerifiedPrice,specialtyUnitPrice,specialtyTemplates} from './specialtyProducts';
vi.mock('@/utils/uploadArtworkFile',()=>({uploadArtworkFile:vi.fn(async()=>({productionUrl:'https://res.cloudinary.com/test/raw/upload/print.pdf',fileKey:'print'}))}));
const source:UploadedArtworkFile={name:'source.pdf',url:'https://res.cloudinary.com/test/raw/upload/source.pdf',fileKey:'source',size:1024,isPdf:true};
const spec:ArtworkCompositionSpec={version:3,sourceUrl:source.url,sourceIdentity:'source',productType:'specialty:custom-event-tents:20ft:front',widthIn:128,heightIn:86,fitMode:'fit',transform:{xPct:4,yPct:-3,scaleX:1.2,scaleY:1.1},revision:1};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(uploadArtworkFile).mockClear();});
describe('specialty print export',()=>{
  it('preserves the maximum poster roll physical size using PDF UserUnit',async()=>{
    const pdf=await PDFDocument.create();pdf.addPage([720,360]).drawText('VECTOR ORIGINAL');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(await pdf.save())));
    await exportSpecialtyPanel(source,{...spec,widthIn:1908,heightIn:52,productType:'specialty:display-posters:display-posters-1:front'},specialtyTemplates['display-posters-1-front']);
    const file=vi.mocked(uploadArtworkFile).mock.calls[0][0],doc=await PDFDocument.load(await file.arrayBuffer()),page=doc.getPage(0);
    const unit=page.node.lookup(PDFName.of('UserUnit'),PDFNumber).asNumber();
    expect(page.getWidth()).toBeLessThanOrEqual(14400);expect(page.getWidth()*unit/72).toBeCloseTo(1908,6);expect(page.getHeight()*unit/72).toBeCloseTo(52,6);
  });
  it('preserves a vector PDF in the supplier’s quarter-scale 20-foot tent artboard',async()=>{
    const pdf=await PDFDocument.create();pdf.addPage([720,360]).drawText('VECTOR ORIGINAL');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(await pdf.save())));
    const result=await exportSpecialtyPanel(source,spec,specialtyTemplates['20ft-event-tent-canopy-short-side']);
    const file=vi.mocked(uploadArtworkFile).mock.calls[0][0];const exported=await PDFDocument.load(await file.arrayBuffer());
    expect(exported.getPageCount()).toBe(1);expect(exported.getPage(0).getSize()).toEqual({width:2304,height:1548});
    expect(exported.getPage(0).node.Resources()?.toString()).toContain('/XObject');
    expect(result.productionFileKey).toBe('print');
  });
  it('rejects an old cropped specialty placement before exporting or uploading',async()=>{
    await expect(exportSpecialtyPanel(source,{...spec,transform:{...spec.transform,crop:{x:0,y:0,width:.5,height:1}}},specialtyTemplates['20ft-event-tent-canopy-short-side'])).rejects.toThrow(/do not support image cropping/);
    expect(uploadArtworkFile).not.toHaveBeenCalled();
  });
  it('rejects multipage input before creating a misleading single-panel file',async()=>{
    const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();vi.stubGlobal('fetch',vi.fn(async()=>new Response(await pdf.save())));
    await expect(exportSpecialtyPanel(source,spec,specialtyTemplates['20ft-event-tent-canopy-short-side'])).rejects.toThrow(/one PDF page/);
    expect(uploadArtworkFile).not.toHaveBeenCalled();
  });
  it('calculates effective raster resolution after enlargement, without mislabeling vectors',()=>{
    const raster={...source,isPdf:false,originalWidth:3600,originalHeight:1800};
    expect(specialtyArtworkPpi(raster,{widthIn:24,heightIn:12,transform:{xPct:0,yPct:0,scaleX:2,scaleY:1}})).toBe(75);
    expect(specialtyArtworkPpi(source,spec)).toBeNull();
  });
});

describe('matched customer pricing',()=>{
  it('uses fixed ACM size prices and includes shipping for all valid sign sizes',()=>{
    const p=getSpecialtyProduct('aluminum-composite-signs')!,v=p.variants[0];
    expect(specialtyUnitPrice(p,v,24,18)).toBe(6000);expect(specialtyUnitPrice(p,v,24,36)).toBe(11500);
    const item={product_type:'specialty',width_in:24,height_in:18,specialty_config:{productSlug:p.slug,variantId:v.id}};
    expect(specialtyItemHasIncludedShipping(item)).toBe(true);
    expect(specialtyItemHasIncludedShipping({...item,width_in:20})).toBe(true);
    expect(specialtyItemHasVerifiedPrice({...item,width_in:20})).toBe(true);
    expect(specialtyUnitPrice(p,v,20,18)).toBe(4688);
  });
  it('prices proposed accessories with included shipping and rejects invalid configurations',()=>{
    const product=getSpecialtyProduct('custom-event-tents')!,variant=product.variants[0];
    const item={product_type:'specialty',width_in:119,height_in:84.275,specialty_config:{productSlug:product.slug,variantId:variant.id,options:{tent_full_wall:'A'}}};
    expect(specialtyItemHasIncludedShipping(item)).toBe(true);
    expect(specialtyItemHasVerifiedPrice(item)).toBe(true);
    const invalid={...item,specialty_config:{...item.specialty_config,options:{madeUp:'yes'}}};
    expect(specialtyItemHasVerifiedPrice(invalid)).toBe(false);
    expect(specialtyItemHasIncludedShipping(invalid)).toBe(false);
    expect(specialtyItemHasVerifiedPrice({...item,specialty_config:{...item.specialty_config,options:{tent_sandbag:'1'}}})).toBe(true);
  });
});
