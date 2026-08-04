import { getConfiguratorUrl } from '@/lib/configurator';
import {
  PRODUCT_LANDING_DATA,
  SITE_URL,
  formatMoney,
  type ProductFaq,
  type ProductLandingDefinition,
} from '@/lib/seo/productLandingData';
import { SITE_POLICIES } from '@/lib/sitePolicies';

export type CityProductSlug = 'vinyl-banners' | 'yard-signs' | 'car-magnets';

export type LocalEvidenceType = 'project' | 'testimonial' | 'photo' | 'delivery-example' | 'order-aggregate';

export interface LocalEvidence {
  type: LocalEvidenceType;
  product: CityProductSlug;
  source: string;
  date: string;
  permissionStatus: 'approved' | 'not-required';
  locationPrecision: 'city' | 'region';
  photoUrl?: string;
  quote?: string;
  projectDetails?: string;
}

export interface ProductEditorialRecord {
  introduction: string;
  fulfillmentFact: string;
  buyerGuidance: string[];
  faqs?: ProductFaq[];
  localEvidence: LocalEvidence[];
  author: string;
  reviewer: string;
  lastReviewed: string;
  claimsApproved: boolean;
  validationApproved: boolean;
  /** A deliberate exception still requires author, reviewer, facts, and validation. */
  evidenceExceptionApproved?: boolean;
}

export interface CityEntry {
  slug: string;
  city: string;
  state: string;
  stateName: string;
  region: string;
  nearbyCitySlugs: string[];
  serviceClassification: 'shipping-only';
  physicalPresence: 'none-claimed';
  editorial?: Partial<Record<CityProductSlug, ProductEditorialRecord>>;
}

/**
 * Service-area registry only. A city in this array does not automatically
 * qualify for search indexing. The publish gate below requires reviewed,
 * first-party product evidence before a page can enter the sitemap.
 */
export const CITIES: CityEntry[] = [
  { slug: 'louisville-ky', city: 'Louisville', state: 'KY', stateName: 'Kentucky', region: 'Kentuckiana', nearbyCitySlugs: ['lexington-ky', 'cincinnati-oh', 'indianapolis-in', 'nashville-tn'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'lexington-ky', city: 'Lexington', state: 'KY', stateName: 'Kentucky', region: 'the Bluegrass region', nearbyCitySlugs: ['louisville-ky', 'cincinnati-oh', 'nashville-tn', 'columbus-oh'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'cincinnati-oh', city: 'Cincinnati', state: 'OH', stateName: 'Ohio', region: 'the Tri-State area', nearbyCitySlugs: ['louisville-ky', 'lexington-ky', 'indianapolis-in', 'columbus-oh'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'indianapolis-in', city: 'Indianapolis', state: 'IN', stateName: 'Indiana', region: 'central Indiana', nearbyCitySlugs: ['cincinnati-oh', 'louisville-ky', 'chicago-il', 'columbus-oh'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'nashville-tn', city: 'Nashville', state: 'TN', stateName: 'Tennessee', region: 'Middle Tennessee', nearbyCitySlugs: ['louisville-ky', 'atlanta-ga', 'lexington-ky', 'st-louis-mo'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'columbus-oh', city: 'Columbus', state: 'OH', stateName: 'Ohio', region: 'central Ohio', nearbyCitySlugs: ['cincinnati-oh', 'indianapolis-in', 'lexington-ky', 'chicago-il'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'chicago-il', city: 'Chicago', state: 'IL', stateName: 'Illinois', region: 'Chicagoland', nearbyCitySlugs: ['indianapolis-in', 'st-louis-mo', 'columbus-oh', 'cincinnati-oh'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'st-louis-mo', city: 'St. Louis', state: 'MO', stateName: 'Missouri', region: 'the Greater St. Louis area', nearbyCitySlugs: ['chicago-il', 'indianapolis-in', 'nashville-tn', 'louisville-ky'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'atlanta-ga', city: 'Atlanta', state: 'GA', stateName: 'Georgia', region: 'metro Atlanta', nearbyCitySlugs: ['nashville-tn', 'charlotte-nc', 'raleigh-nc', 'jacksonville-fl'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'charlotte-nc', city: 'Charlotte', state: 'NC', stateName: 'North Carolina', region: 'the Carolinas', nearbyCitySlugs: ['raleigh-nc', 'atlanta-ga', 'nashville-tn', 'jacksonville-fl'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'dallas-tx', city: 'Dallas', state: 'TX', stateName: 'Texas', region: 'Dallas–Fort Worth', nearbyCitySlugs: ['austin-tx', 'houston-tx', 'phoenix-az', 'denver-co'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'houston-tx', city: 'Houston', state: 'TX', stateName: 'Texas', region: 'the Gulf Coast', nearbyCitySlugs: ['austin-tx', 'dallas-tx', 'phoenix-az', 'atlanta-ga'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'austin-tx', city: 'Austin', state: 'TX', stateName: 'Texas', region: 'central Texas', nearbyCitySlugs: ['dallas-tx', 'houston-tx', 'phoenix-az', 'denver-co'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'phoenix-az', city: 'Phoenix', state: 'AZ', stateName: 'Arizona', region: 'the Valley of the Sun', nearbyCitySlugs: ['denver-co', 'dallas-tx', 'austin-tx', 'houston-tx'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'denver-co', city: 'Denver', state: 'CO', stateName: 'Colorado', region: 'the Front Range', nearbyCitySlugs: ['phoenix-az', 'dallas-tx', 'austin-tx', 'chicago-il'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'tampa-fl', city: 'Tampa', state: 'FL', stateName: 'Florida', region: 'the Tampa Bay area', nearbyCitySlugs: ['orlando-fl', 'miami-fl', 'jacksonville-fl', 'atlanta-ga'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'orlando-fl', city: 'Orlando', state: 'FL', stateName: 'Florida', region: 'central Florida', nearbyCitySlugs: ['tampa-fl', 'miami-fl', 'jacksonville-fl', 'atlanta-ga'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'miami-fl', city: 'Miami', state: 'FL', stateName: 'Florida', region: 'South Florida', nearbyCitySlugs: ['orlando-fl', 'tampa-fl', 'jacksonville-fl', 'atlanta-ga'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'jacksonville-fl', city: 'Jacksonville', state: 'FL', stateName: 'Florida', region: 'northeast Florida', nearbyCitySlugs: ['orlando-fl', 'tampa-fl', 'atlanta-ga', 'raleigh-nc'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
  { slug: 'raleigh-nc', city: 'Raleigh', state: 'NC', stateName: 'North Carolina', region: 'the Research Triangle', nearbyCitySlugs: ['charlotte-nc', 'atlanta-ga', 'jacksonville-fl', 'nashville-tn'], serviceClassification: 'shipping-only', physicalPresence: 'none-claimed' },
];

const CITY_BY_SLUG = new Map(CITIES.map((city) => [city.slug, city]));

export function getCityBySlug(slug: string | undefined): CityEntry | undefined {
  return slug ? CITY_BY_SLUG.get(slug.toLowerCase()) : undefined;
}

export function getProduct(slug: CityProductSlug | string | undefined): ProductLandingDefinition | undefined {
  return slug ? PRODUCT_LANDING_DATA[slug as CityProductSlug] : undefined;
}

export interface PublishGateResult {
  indexable: boolean;
  reasons: string[];
}

export function evaluateLocalPagePublishGate(productSlug: CityProductSlug, city: CityEntry): PublishGateResult {
  const product = getProduct(productSlug);
  const editorial = city.editorial?.[productSlug];
  const reasons: string[] = [];

  if (!product || product.startingPriceCents <= 0 || !product.priceExamples.length) reasons.push('No current purchasable offer.');
  if (!editorial?.introduction?.trim()) reasons.push('Product-specific city introduction has not been reviewed.');
  if (!editorial?.fulfillmentFact?.trim()) reasons.push('No verified city-specific fulfillment fact.');
  if (!editorial?.buyerGuidance?.length) reasons.push('No reviewed city-specific buyer guidance.');
  if (!editorial?.localEvidence?.length && !editorial?.evidenceExceptionApproved) reasons.push('No approved first-party local evidence.');
  if (!editorial?.author || !editorial?.reviewer || !editorial?.lastReviewed) reasons.push('Editorial ownership or review date is missing.');
  if (!editorial?.claimsApproved) reasons.push('Claims approval is missing.');
  if (!editorial?.validationApproved) reasons.push('Duplicate-content and policy validation is not approved.');
  if (city.physicalPresence !== 'none-claimed') reasons.push('Physical-presence classification is invalid.');
  if (city.nearbyCitySlugs.length < 3 || city.nearbyCitySlugs.some((slug) => !CITY_BY_SLUG.has(slug))) reasons.push('Nearby-city relationships are incomplete or invalid.');

  return { indexable: reasons.length === 0, reasons };
}

export function getAllCityProductPaths(): { product: CityProductSlug; citySlug: string }[] {
  return (Object.keys(PRODUCT_LANDING_DATA) as CityProductSlug[]).flatMap((product) =>
    CITIES.map((city) => ({ product, citySlug: city.slug })),
  );
}

export function getIndexableCityProductPaths(): { product: CityProductSlug; citySlug: string }[] {
  return getAllCityProductPaths().filter(({ product, citySlug }) => {
    const city = getCityBySlug(citySlug);
    return Boolean(city && evaluateLocalPagePublishGate(product, city).indexable);
  });
}

export interface CityProductPageContent {
  path: string;
  canonicalUrl: string;
  h1: string;
  heroSubtitle: string;
  introParagraph: string;
  metaTitle: string;
  metaDescription: string;
  indexable: boolean;
  publishGateReasons: string[];
  product: ProductLandingDefinition;
  faqs: ProductFaq[];
  breadcrumbs: { name: string; url: string }[];
  internalLinks: { label: string; to: string; description: string }[];
  siblingProductLinks: { label: string; to: string }[];
  nearbyCityLinks: { label: string; to: string }[];
  configuratorUrl: string;
}

function buildMetaDescription(productSlug: CityProductSlug, city: CityEntry, product: ProductLandingDefinition): string {
  const price = formatMoney(product.startingPriceCents);
  if (productSlug === 'vinyl-banners') {
    return `Order vinyl banners shipped to ${city.city} from ${price}. Choose size and material, upload artwork, preview the print, and see pricing and shipping details online.`;
  }
  if (productSlug === 'yard-signs') {
    return `Order 10 custom yard signs shipped to ${city.city} from ${price}. Compare single- and double-sided 24×18 signs, upload artwork, preview, and see pricing online.`;
  }
  return `Order car magnets shipped to ${city.city} from ${price}. Compare supported sizes and corner options, upload artwork, preview, and see pricing and shipping details.`;
}

export function buildCityProductPageContent(productSlug: CityProductSlug, city: CityEntry): CityProductPageContent {
  const product = PRODUCT_LANDING_DATA[productSlug];
  const path = `/${productSlug}/${city.slug}`;
  const cityState = `${city.city}, ${city.state}`;
  const gate = evaluateLocalPagePublishGate(productSlug, city);
  const editorial = city.editorial?.[productSlug];
  const configuratorUrl = getConfiguratorUrl(productSlug, path, 'local-page');

  const metaTitle = `${product.plural} ${cityState} | Custom Printing`;

  const safeIntroduction =
    `Banners On The Fly ships ${product.lower} to customers in ${cityState}. ` +
    `${product.overview} This service-area page does not represent a storefront or pickup location in ${city.city}.`;

  const cityFaq: ProductFaq = {
    question: `Do you ship ${product.lower} to ${cityState}?`,
    answer:
      `Yes. Orders can be shipped to ${cityState}. ${SITE_POLICIES.production.detail} ${SITE_POLICIES.shipping.detail}`,
  };

  return {
    path,
    canonicalUrl: `${SITE_URL}${path}`,
    h1: `${product.plural} in ${cityState}`,
    heroSubtitle: `Current options and online pricing for ${product.lower} shipped to ${city.city}.`,
    introParagraph: editorial?.introduction || safeIntroduction,
    metaTitle,
    metaDescription: buildMetaDescription(productSlug, city, product),
    indexable: gate.indexable,
    publishGateReasons: gate.reasons,
    product,
    faqs: [cityFaq, ...(editorial?.faqs || product.faqs)],
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: product.plural, url: `/${product.slug}` },
      { name: cityState, url: path },
    ],
    internalLinks: [
      { label: product.ctaLabel, to: configuratorUrl, description: `Open the ${product.singular.toLowerCase()} configurator with the correct product selected.` },
      { label: `${product.plural} sizes and pricing`, to: `/${product.slug}`, description: `Compare current ${product.lower} sizes, options, minimums, and price examples.` },
      { label: 'Production and shipping details', to: '/shipping', description: 'Review how production time and carrier transit time work.' },
      { label: 'Artwork and order FAQs', to: '/faq', description: 'Check file, preview, return, and cancellation policies before ordering.' },
    ],
    siblingProductLinks: (Object.keys(PRODUCT_LANDING_DATA) as CityProductSlug[])
      .filter((slug) => slug !== productSlug && evaluateLocalPagePublishGate(slug, city).indexable)
      .map((slug) => ({ label: `${PRODUCT_LANDING_DATA[slug].plural} shipped to ${cityState}`, to: `/${slug}/${city.slug}` })),
    nearbyCityLinks: city.nearbyCitySlugs
      .map((slug) => CITY_BY_SLUG.get(slug))
      .filter((nearby): nearby is CityEntry => Boolean(nearby && evaluateLocalPagePublishGate(productSlug, nearby).indexable))
      .map((nearby) => ({ label: `${product.plural} shipped to ${nearby.city}, ${nearby.state}`, to: `/${productSlug}/${nearby.slug}` })),
    configuratorUrl,
  };
}
