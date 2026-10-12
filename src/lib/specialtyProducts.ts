import catalog from '../../shared/specialty-catalog.json';
import templateCatalog from '../../shared/specialty-templates.json';

export type SpecialtyCategory = 'stands' | 'flags' | 'events' | 'signs';
export type SpecialtyVisual = 'retractable' | 'xstand' | 'backdrop' | 'flag' | 'table' | 'tent' | 'sign' | 'poster';

export interface SpecialtyPanel { id: string; label: string; templateId: string; }
export interface SpecialtyPriceMatch {
  sourceUrl:string; checkedAt:string; shippingPolicy:'free_overnight_after_production'; status:'exact_configuration';
  widthIn?:number; heightIn?:number; priceCents?:number;
}

export interface SpecialtyVariant {
  id: string;
  panels: SpecialtyPanel[];
  label: string;
  priceCents?: number;
  widthIn?: number;
  heightIn?: number;
  priceMatch?: SpecialtyPriceMatch;
}

export interface SpecialtyProduct {
  slug: string;
  image: string;
  imageAlt: string;
  materialLabel: string;
  fulfillmentStatus: string;
  priceMatches?: SpecialtyPriceMatch[];
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
  events: { label: 'Event gear', description: 'Table covers and tents that make a whole booth feel intentional.' },
  signs: { label: 'Rigid signs & posters', description: 'Polished graphics for walls, wayfinding and long-lasting displays.' },
};

export const specialtyProducts = catalog as SpecialtyProduct[];

export function getSpecialtyProduct(slug?: string | null): SpecialtyProduct | undefined {
  return specialtyProducts.find((product) => product.slug === slug);
}

export function formatSpecialtyPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function specialtyStartingPrice(product: SpecialtyProduct): number | undefined {
  if(product.priceMatches?.length)return Math.min(...product.priceMatches.map(p=>p.priceCents!));
  const confirmed=product.variants.filter(v=>v.priceMatch);
  const prices = (confirmed.length?confirmed:product.variants).map((variant) => variant.priceCents).filter((price): price is number => typeof price === 'number');
  return prices.length ? Math.min(...prices) : undefined;
}

export interface SpecialtyTemplate {
  id: string; widthIn: number; heightIn: number; exportScale: number;
  sourceUrl?: string; sourceDate?: string; outline?: string;
  guides?: Array<{ d: string; dashed: boolean; color: string }>;
  safeInsetsIn?: number[];
  polePath?: string;
  poleBottom?: number[];
  faces?: Record<'front' | 'top' | 'side', number[]>;
  fitNotes: string;
}
export const specialtyTemplates = templateCatalog as Record<string, SpecialtyTemplate>;
export function specialtyTemplate(product: SpecialtyProduct, variant: SpecialtyVariant, panel: SpecialtyPanel, widthIn?: number, heightIn?: number): SpecialtyTemplate {
  const template = specialtyTemplates[panel.templateId];
  if (!template) throw new Error('This product template is unavailable.');
  return product.priceUnit === 'sqft' ? { ...template, widthIn: widthIn || 24, heightIn: heightIn || 18 } : template;
}
export function specialtyUnitPrice(product: SpecialtyProduct, variant: SpecialtyVariant, widthIn: number, heightIn: number): number {
  if (!variant || !Number.isInteger(variant.priceCents)) throw new Error('Choose a priced configuration.');
  if (product.priceUnit !== 'sqft') return variant.priceCents!;
  const limits = product.sizeLimits!;
  if (![widthIn, heightIn].every(n => Number.isFinite(n) && n >= limits.min)
      || Math.min(widthIn, heightIn) > limits.maxShort || Math.max(widthIn, heightIn) > limits.maxLong) throw new Error(`Choose a size from ${limits.min} × ${limits.min} in to ${limits.maxLong} × ${limits.maxShort} in. Either orientation is available.`);
  const matched=specialtyPriceMatch(product,variant,widthIn,heightIn);
  if(matched?.priceCents)return matched.priceCents;
  return Math.max(product.minOrderCents || 0, Math.ceil(widthIn * heightIn / 144 * variant.priceCents!));
}

export function specialtyPriceMatch(product:SpecialtyProduct,variant:SpecialtyVariant,widthIn:number,heightIn:number):SpecialtyPriceMatch|undefined {
  return product.priceMatches?.find(p=>(p.widthIn===widthIn&&p.heightIn===heightIn)||(p.widthIn===heightIn&&p.heightIn===widthIn))||variant.priceMatch;
}
export function specialtyItemHasIncludedShipping(item:{product_type?:string;width_in:number;height_in:number;specialty_config?:{productSlug:string;variantId:string}}):boolean {
  if(item.product_type!=='specialty')return true;
  const product=getSpecialtyProduct(item.specialty_config?.productSlug),variant=product?.variants.find(v=>v.id===item.specialty_config?.variantId);
  return !!(product&&variant&&specialtyPriceMatch(product,variant,item.width_in,item.height_in));
}
