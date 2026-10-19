import catalog from '../../shared/specialty-catalog.json';
import release from '../../shared/specialty-release.json';
import templateCatalog from '../../shared/specialty-templates.json';
import optionsEngine from '../../shared/specialty-options.mjs';

export type SpecialtyCategory = 'stands' | 'flags' | 'events' | 'signs';
export type SpecialtyVisual = 'retractable' | 'xstand' | 'backdrop' | 'flag' | 'table' | 'tent' | 'sign' | 'poster';

export interface SpecialtyPanel { id: string; label: string; templateId: string; }
export interface SpecialtyPriceMatch {
  sourceUrl:string; checkedAt:string; shippingPolicy:'free_overnight_after_production'; status:'exact_configuration'|'owner_retail_mapping';
  note?:string;
  widthIn?:number; heightIn?:number; priceCents?:number;
}

export interface SpecialtyVariant {
  id: string;
  panels: SpecialtyPanel[];
  label: string;
  priceCents?: number;
  baseAddCents?: number;
  priceProposal?: {revision?:string;status:'pending_john_approval';proposedAt:string;basis:string;sourceUrls:string[];shippingAllowanceCents?:number};
  widthIn?: number;
  heightIn?: number;
  priceMatch?: SpecialtyPriceMatch;
  supplierProfile?: string;
  supplierFixed?: Record<string,string>;
  baselineOptions?: Record<string,string>;
  customSize?: {minWidth:number;maxWidth:number;minHeight:number;maxHeight:number;step:number};
  panelRules?: Array<{when:Record<string,string>;replace?:SpecialtyPanel[];append?:SpecialtyPanel[]}>;
}

export interface SpecialtyProduct {
  slug: string;
  image: string;
  imageAlt: string;
  materialLabel: string;
  fulfillmentSupplier?: 'B2Sign' | 'Signs365';
  priceMatches?: SpecialtyPriceMatch[];
  shippingPolicy?: 'free_overnight_after_production';
  sizeLimits?: { min: number; maxShort: number; maxLong: number };
  name: string;
  category: SpecialtyCategory;
  visual: SpecialtyVisual;
  eyebrow: string;
  summary: string;
  description: string;
  features: string[];
  variants: SpecialtyVariant[];
  priceUnit?: 'each' | 'sqft';
  minOrderCents?: number;
  note?: string;
}

export const specialtyCategories: Record<SpecialtyCategory, { label: string; description: string }> = {
  stands: { label: 'Banner stands & backdrops', description: 'Portable displays for counters, lobbies and trade shows.' },
  flags: { label: 'Advertising flags', description: 'Tall, visible graphics for storefronts and outdoor events.' },
  events: { label: 'Table covers & tents', description: 'Table covers and tents that make a whole booth feel intentional.' },
  signs: { label: 'Rigid signs & posters', description: 'Polished graphics for walls, wayfinding and long-lasting displays.' },
};

export const specialtyProducts = catalog as SpecialtyProduct[];
export const availableSpecialtyProducts = specialtyProducts.filter(product =>
  release.categories[product.category] !== false &&
  (release.products as Record<string, boolean>)[product.slug] !== false
);
export const isSpecialtyProductAvailable = (slug:string) => availableSpecialtyProducts.some(product=>product.slug===slug);

export function getSpecialtyProduct(slug?: string | null): SpecialtyProduct | undefined {
  return specialtyProducts.find((product) => product.slug === slug);
}

export function formatSpecialtyPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function specialtyStartingPrice(product: SpecialtyProduct): number | undefined {
  const prices = (product.priceMatches||[]).map(p=>specialtyConfigurationPrice(product,product.variants[0],p.widthIn!,p.heightIn!).unitCents).filter(Number.isFinite);
  for(const variant of product.variants){
    const size=product.sizeLimits?.min||variant.widthIn||24;
    const quote=specialtyConfigurationPrice(product,variant,size,product.sizeLimits?.min||variant.heightIn||18);
    if(quote.baseVerified)prices.push(quote.unitCents);
  }
  return prices.length ? Math.min(...prices) : undefined;
}

export interface SpecialtyTemplate {
  id: string; widthIn: number; heightIn: number; exportScale: number;
  sourceUrl?: string; sourceDate?: string; outline?: string;
  guides?: Array<{ d: string; dashed: boolean; color: string }>;
  safeInsetsIn?: number[];
  polePath?: string;
  poleMirrored?: boolean;
  poleBottom?: number[];
  faces?: Record<'front' | 'top' | 'side', number[]>;
  fitNotes: string;
  surface?: string;
  doubleFlag?: boolean;
}
export const specialtyTemplates = templateCatalog as Record<string, SpecialtyTemplate>;
export function specialtyTemplate(product: SpecialtyProduct, variant: SpecialtyVariant, panel: SpecialtyPanel, widthIn?: number, heightIn?: number): SpecialtyTemplate {
  const template = specialtyTemplates[panel.templateId];
  if (!template) throw new Error('This product template is unavailable.');
  return product.priceUnit === 'sqft' || variant.customSize ? { ...template, widthIn: widthIn || 24, heightIn: heightIn || 18 } : template;
}
export function specialtyUnitPrice(product: SpecialtyProduct, variant: SpecialtyVariant, widthIn: number, heightIn: number, options:Record<string,string>={}): number {
  return specialtyConfigurationPrice(product,variant,widthIn,heightIn,options).unitCents;
}

export function specialtyPriceMatch(product:SpecialtyProduct,variant:SpecialtyVariant,widthIn:number,heightIn:number):SpecialtyPriceMatch|undefined {
  return product.priceMatches?.find(p=>(p.widthIn===widthIn&&p.heightIn===heightIn)||(p.widthIn===heightIn&&p.heightIn===widthIn))||variant.priceMatch;
}
type SpecialtyPricedItem={product_type?:string;width_in:number;height_in:number;specialty_config?:{productSlug:string;variantId:string;options?:Record<string,string>}};
export function specialtyItemPrice(item:SpecialtyPricedItem):ReturnType<typeof specialtyConfigurationPrice>|undefined {
  if(item.product_type!=='specialty')return undefined;
  const product=getSpecialtyProduct(item.specialty_config?.productSlug),variant=product?.variants.find(v=>v.id===item.specialty_config?.variantId);
  if(!product||!variant)return undefined;
  try{return specialtyConfigurationPrice(product,variant,item.width_in,item.height_in,item.specialty_config?.options);}
  catch{return undefined;}
}
export function specialtyItemHasVerifiedPrice(item:SpecialtyPricedItem):boolean {
  return item.product_type!=='specialty'||specialtyItemPrice(item)?.verified===true;
}
export function specialtyItemHasIncludedShipping(item:SpecialtyPricedItem):boolean {
  return item.product_type!=='specialty'||specialtyItemPrice(item)?.shippingPolicy==='free_overnight_after_production';
}

export type SpecialtyOptions=Record<string,string>;
export interface SpecialtyOptionGroup {key:string;label:string;visible?:false|unknown[];options:Array<{key:string;label:string;visible?:false|unknown[];custom?:unknown;images?:Array<{s1000:string;s200:string;match?:unknown[]}>}>;images:Array<{s1000:string;s200:string;match?:unknown[]}>;}
export const specialtyOptions = optionsEngine.optionsFor as (variant:SpecialtyVariant,input?:SpecialtyOptions,strict?:boolean)=>SpecialtyOptions;
export const specialtyPanels = optionsEngine.panelDefinitions as (variant:SpecialtyVariant,input?:SpecialtyOptions)=>SpecialtyPanel[];
export const specialtyAllPanels = optionsEngine.allPanelDefinitions as (variant:SpecialtyVariant)=>SpecialtyPanel[];
export const specialtyOptionMatches=optionsEngine.matches as (conditions:unknown,values:SpecialtyOptions)=>boolean;
export const specialtyProfile=optionsEngine.profileFor as (variant:SpecialtyVariant)=>{supplierItemId:number;groups:SpecialtyOptionGroup[];sourceUrl:string}|undefined;
export const specialtyOptionSummary=optionsEngine.optionSummary as (variant:SpecialtyVariant,options?:SpecialtyOptions)=>Array<{key:string;label:string;value:string}>;
export const specialtyConfigurationPrice=optionsEngine.priceConfiguration as (product:SpecialtyProduct,variant:SpecialtyVariant,width:number,height:number,options?:SpecialtyOptions)=>{unitCents:number;baseCents:number;baseVerified:boolean;adjustments:Array<{key:string;label:string;cents:number}>;verified:boolean;proposed:boolean;missing:string[];options:SpecialtyOptions;sourceUrl?:string;shippingPolicy?:string};
export const specialtyOptionPriceCents=optionsEngine.optionPriceCents as (variant:SpecialtyVariant,width:number,height:number,options:SpecialtyOptions,key:string)=>number|undefined;

export const specialtyMaterialLabel=optionsEngine.materialLabel as (product:SpecialtyProduct,variant:SpecialtyVariant,options?:SpecialtyOptions)=>string;
