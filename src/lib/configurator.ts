import type { CityProductSlug } from '@/lib/seo/cityData';
import type { ProductTypeSlug } from '@/lib/products';

export type ConfiguratorSource = 'local-page' | 'product-hub' | 'locations-hub';

const PRODUCT_QUERY: Record<CityProductSlug, string> = {
  'vinyl-banners': 'banner',
  'yard-signs': 'yard-signs',
  'car-magnets': 'car-magnets',
};

const PRODUCT_TYPE_QUERY: Record<ProductTypeSlug, string> = {
  banner: 'banner',
  yard_sign: 'yard-signs',
  car_magnet: 'car-magnets',
};

export function getConfiguratorProductQuery(productType: ProductTypeSlug): string {
  return PRODUCT_TYPE_QUERY[productType];
}

export function parseConfiguratorProductQuery(value: string | null | undefined): ProductTypeSlug {
  if (value === 'yard-sign' || value === 'yard_sign' || value === 'yard-signs') return 'yard_sign';
  if (value === 'car-magnet' || value === 'car-magnets' || value === 'car_magnet' || value === 'car_magnets') return 'car_magnet';
  return 'banner';
}

/**
 * One product-aware entrypoint for every landing page and schema Offer URL.
 * `source_page` is intentionally a query parameter on the non-canonical design
 * route; it never changes a landing page canonical URL.
 */
export function getConfiguratorUrl(
  productSlug: CityProductSlug,
  sourcePage?: string,
  source: ConfiguratorSource = 'local-page',
): string {
  const params = new URLSearchParams({ product: PRODUCT_QUERY[productSlug] });
  if (sourcePage) {
    params.set('source', source);
    params.set('source_page', sourcePage.startsWith('/') ? sourcePage : `/${sourcePage}`);
  }
  return `/design?${params.toString()}`;
}

export function getAbsoluteConfiguratorUrl(
  productSlug: CityProductSlug,
  sourcePage?: string,
  source: ConfiguratorSource = 'local-page',
): string {
  return `https://bannersonthefly.com${getConfiguratorUrl(productSlug, sourcePage, source)}`;
}
