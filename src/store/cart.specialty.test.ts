// @vitest-environment jsdom
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {useCartStore,type CartItem} from './cart';
import {cartSyncService} from '@/lib/cartSync';
import {cartEditUrl} from '@/lib/cartEditUrl';
import {getSpecialtyProduct,specialtyTemplate} from '@/lib/specialtyProducts';
import {buildCompositionSignature} from '@/lib/previewLifecycle';
import type {SpecialtyConfiguration} from '@/lib/specialtyArtwork';

function configuration():SpecialtyConfiguration {
  const product=getSpecialtyProduct('custom-event-tents')!,variant=product.variants[2];
  return {version:1,productSlug:product.slug,variantId:variant.id,productName:product.name,variantLabel:variant.label,materialLabel:product.materialLabel,approvedAt:'2026-10-12T00:00:00Z',panels:variant.panels.map(panel=>{
    const t=specialtyTemplate(product,variant,panel),url=`https://res.cloudinary.com/test/image/upload/${panel.id}.png`;
    const composition={version:3 as const,sourceUrl:url,sourceIdentity:panel.id,productType:`specialty:${product.slug}:${variant.id}:${panel.id}`,widthIn:t.widthIn,heightIn:t.heightIn,fitMode:'fit' as const,transform:{xPct:2,yPct:1,scaleX:1.2,scaleY:1.1},revision:2};
    return {...panel,artwork:{name:`${panel.id}.png`,url,fileKey:panel.id,size:2048,isPdf:false},composition,
      preview:{version:3,sourceUrl:url,sourceIdentity:panel.id,productType:composition.productType,widthIn:t.widthIn,heightIn:t.heightIn,fitMode:'fit',positionPct:{x:2,y:1},scaleX:1.2,scaleY:1.1,compositionRevision:2,compositionSignature:buildCompositionSignature(composition),url,publicId:panel.id,previewUrl:url,previewPublicId:panel.id,previewWidthPx:1400,previewHeightPx:900,uploadStatus:'uploaded',createdAt:'2026-10-12T00:00:00Z',uploadedAt:'2026-10-12T00:00:00Z',error:null},
      productionUrl:`https://res.cloudinary.com/test/raw/upload/${panel.id}.pdf`,productionFileKey:panel.id+'-print',effectivePpi:150};
  })};
}
const banner:CartItem={id:'existing-banner',product_type:'banner',width_in:48,height_in:24,quantity:3,material:'13oz',grommets:'none',pole_pockets:'none',rope_feet:0,area_sqft:8,unit_price_cents:4000,line_total_cents:12000,rope_cost_cents:0,pole_pocket_cost_cents:0,created_at:'2026-10-01T00:00:00Z'};
const save=(config=configuration(),editId?:string)=>useCartStore.getState().saveSpecialtyItem({configuration:config,quantity:2,widthIn:config.panels[0].composition.widthIn,heightIn:config.panels[0].composition.heightIn,editId});
describe('specialty artwork in the existing cart',()=>{
  beforeEach(()=>{vi.useFakeTimers();useCartStore.setState({items:[{...banner}],discountCode:null});vi.spyOn(useCartStore.getState(),'syncToServer').mockResolvedValue(undefined);});
  afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
  it('saves all four panels and edits the same cart line without changing the banner or its discount',()=>{
    const before=useCartStore.getState().getQuantityDiscountInfo(),config=configuration(),id=save(config);
    const saved=useCartStore.getState().items[1];
    expect(saved.specialty_config?.panels).toHaveLength(4);
    expect(JSON.parse(saved.canvas_state_json!).configuration).toEqual(saved.specialty_config);
    expect(saved.specialty_config).toMatchObject(config);
    expect(cartEditUrl(saved)).toBe(`/products/${config.productSlug}?editItem=${id}`);
    expect(save(config,id)).toBe(id);expect(useCartStore.getState().items).toHaveLength(2);
    useCartStore.getState().updateQuantity(id,5);
    expect(useCartStore.getState().items[1].line_total_cents).toBe(saved.unit_price_cents*5);
    expect(useCartStore.getState().items[0]).toEqual(banner);
    expect(useCartStore.getState().getQuantityDiscountInfo()).toEqual(before);
  });
  it('preserves the authorized team offer source so specialty cart display receives the full 25 percent',()=>{
    save();useCartStore.setState({discountCode:{id:'team',code:'TEAM25-ABCDEF123456',source:'reusable_promotion',campaign:'daniel-team-25-v1',discountPercentage:25,discountScope:'order',expiresAt:null}});
    const state=useCartStore.getState();const subtotal=state.getMigratedItems().reduce((n,item)=>n+item.line_total_cents,0);
    expect(state.getResolvedDiscount().appliedDiscountAmountCents).toBe(Math.round(subtotal*0.25));
  });
  it('rejects a stale panel without replacing the existing saved item',()=>{
    const id=save(),before=JSON.stringify(useCartStore.getState().items),config=configuration();
    config.panels[2].composition.transform.xPct=15;
    expect(()=>save(config,id)).toThrow(/Complete and save/);
    expect(JSON.stringify(useCartStore.getState().items)).toBe(before);
  });
  it('reprices a saved specialty cart and quantity from current options, preserving its artwork',()=>{
    const id=save(),saved=useCartStore.getState().items[1];
    const stale={...saved,unit_price_cents:1,line_total_cents:2,specialty_config:{...saved.specialty_config!,priceVerified:false,options:{...saved.specialty_config!.options,tent_sandbag:'1'}}};
    useCartStore.setState({items:[{...banner},stale]});
    const migrated=useCartStore.getState().getMigratedItems()[1];
    expect(migrated.unit_price_cents).toBe(203886);
    expect(migrated.line_total_cents).toBe(407772);
    expect(migrated.specialty_config?.priceVerified).toBe(true);
    expect(migrated.specialty_config?.panels).toEqual(saved.specialty_config?.panels);
    expect(useCartStore.getState().getSubtotalCents()).toBe(419772);
    useCartStore.getState().updateQuantity(id,3);
    expect(useCartStore.getState().items[1].line_total_cents).toBe(611658);
    expect(useCartStore.getState().items[1].specialty_config?.priceVerified).toBe(true);
    expect(useCartStore.getState().items[0]).toEqual(banner);
  });
  it('invalid stored specialty options do not crash the cart or inherit a verified price',()=>{
    save();const saved=useCartStore.getState().items[1];
    useCartStore.setState({items:[{...saved,specialty_config:{...saved.specialty_config!,priceVerified:true,options:{madeUp:'yes'}}}]});
    expect(useCartStore.getState().getMigratedItems()[0].specialty_config?.priceVerified).toBe(false);
    expect(()=>useCartStore.getState().updateQuantity(saved.id,3)).not.toThrow();
  });
  it('does not merge two tent orders whose side-panel artwork differs',()=>{
    save();const a=useCartStore.getState().items[1],b=structuredClone(a);b.id='other-tent';
    const p=b.specialty_config!.panels[2];p.composition.revision++;p.preview.compositionSignature=buildCompositionSignature(p.composition);
    expect(cartSyncService.mergeCartItems([a],[b])).toHaveLength(2);
    const copy=structuredClone(a);copy.id='same-artwork';
    const merged=cartSyncService.mergeCartItems([a],[copy]);expect(merged).toHaveLength(1);expect(merged[0].quantity).toBe(4);
  });
});
