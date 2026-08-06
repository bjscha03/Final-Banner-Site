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

export interface LocalPageLink {
  label: string;
  to: string;
  description: string;
}

export interface LocalGuideSection {
  heading: string;
  paragraphs: string[];
  items?: string[];
}

export interface LocalRecommendation {
  use: string;
  choice: string;
  reason: string;
}

export interface LocalGuide {
  eyebrow: string;
  title: string;
  summary: string;
  sections: LocalGuideSection[];
  recommendations: LocalRecommendation[];
  permitNotice?: {
    title: string;
    body: string;
    href: string;
    linkLabel: string;
  };
  sourceLinks: { label: string; href: string }[];
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
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
  heroSubtitle?: string;
  localGuide?: LocalGuide;
  internalLinks?: LocalPageLink[];
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
  {
    slug: 'louisville-ky',
    city: 'Louisville',
    state: 'KY',
    stateName: 'Kentucky',
    region: 'Kentuckiana',
    nearbyCitySlugs: ['lexington-ky', 'cincinnati-oh', 'indianapolis-in', 'nashville-tn'],
    serviceClassification: 'shipping-only',
    physicalPresence: 'none-claimed',
    editorial: {
      'vinyl-banners': {
        introduction:
          'Banners On The Fly prints custom vinyl banners for Louisville businesses, schools, churches, exhibitors, event teams, and community organizations, then ships the finished order to the customer. The page is tailored to Louisville planning needs, but it does not represent a storefront or pickup location in Louisville.',
        fulfillmentFact:
          'Most standard vinyl-banner orders are produced within 24 hours. Free next-day air is carrier transit after production, and delivery dates are estimates.',
        buyerGuidance: [
          'Use solid vinyl for indoor exhibit booths, storefront promotions, stage backdrops, and protected outdoor displays where maximum color and opacity matter.',
          'Choose mesh for fence-mounted or exposed installations where allowing airflow through the print can reduce wind load.',
          'Keep outdoor messages short, use high contrast, and size the most important words for the expected viewing distance.',
          'Confirm the exact property, venue, and Louisville-area sign rules before installation; requirements vary by location and display duration.',
        ],
        faqs: [
          {
            question: 'What banner material works best for outdoor events in Louisville?',
            answer:
              'For a protected wall or short-term display, solid 13 oz or 15 oz vinyl provides strong color and opacity. For exposed fencing or open event grounds, mesh is often the better starting point because air can pass through it. Always remove or secure any banner when severe weather is expected.',
          },
          {
            question: 'Do temporary banners require a permit in Louisville?',
            answer:
              'Louisville Metro says temporary banner signs generally require a sign permit and are subject to location, attachment, and display-duration rules. Some cities within Jefferson County use separate zoning authority, so verify the current requirements for the exact installation address before hanging a banner.',
          },
          {
            question: 'Can I order a banner for a Louisville convention or trade show?',
            answer:
              'Yes. Configure the finished size around the booth, table, wall, or approved hanging area, then check the Kentucky International Convention Center, Kentucky Exposition Center, or event organizer rules for rigging, placement, and move-in deadlines before ordering.',
          },
          {
            question: 'How should a Louisville grand-opening banner be designed?',
            answer:
              'Lead with the opening message, business name, date, and one clear next step. Use high contrast and avoid crowding the layout. For street-facing displays in areas such as Downtown, NuLu, the Highlands, or Old Louisville, review the sign rules that apply to the specific property before installation.',
          },
        ],
        localEvidence: [],
        author: 'Banners On The Fly editorial',
        reviewer: 'Source-verified local SEO review',
        lastReviewed: '2026-08-06',
        claimsApproved: true,
        validationApproved: true,
        evidenceExceptionApproved: true,
        metaTitle: 'Vinyl Banner Printing Louisville, KY | Fast Shipping',
        metaDescription:
          'Order custom vinyl banners shipped to Louisville, KY with 24-hour production on most standard orders and free next-day air after production. Design online.',
        h1: 'Vinyl Banner Printing in Louisville, KY',
        heroSubtitle:
          'Custom banners for Louisville businesses, schools, churches, exhibitors, and event teams.',
        localGuide: {
          eyebrow: 'Louisville banner planning',
          title: 'Banner ideas built around how Louisville gathers and does business.',
          summary:
            'From convention floors and Derby-season hospitality to riverfront festivals and neighborhood openings, Louisville displays call for the right material, message, and mounting plan.',
          sections: [
            {
              heading: 'Conventions and exhibitions',
              paragraphs: [
                'Louisville supports two distinct convention environments: the downtown Kentucky International Convention Center and the Kentucky Exposition Center near the airport. Exhibitors commonly need booth identification, product messaging, sponsor backdrops, registration signs, and directional banners that can be read quickly in a crowded hall.',
              ],
              items: [
                'Size the banner to the approved booth or hanging area rather than guessing from a venue photo.',
                'Confirm organizer rules for rigging, fire safety, move-in, and outside services before production.',
                'Use a short headline and one focal image so the message works from across an aisle.',
              ],
            },
            {
              heading: 'Festivals, parks, and neighborhood events',
              paragraphs: [
                'WorldFest fills the Belvedere with stages, vendors, cultural programming, and visitor information, while Waterfront Park and the Big Four Lawn host concerts and community gatherings. In Old Louisville, the St. James Court Art Show brings hundreds of artists into an outdoor, rain-or-shine setting. These formats create clear needs for entry, sponsor, booth, schedule, and wayfinding banners.',
              ],
              items: [
                'Use mesh on exposed fence lines and solid vinyl for protected booths, tents, or stage areas.',
                'Plan attachment points before choosing grommet spacing, pole pockets, or rope.',
                'Keep arrows, dates, and zone names large enough for moving crowds.',
              ],
            },
            {
              heading: 'Retail, restaurants, and grand openings',
              paragraphs: [
                'Downtown, NuLu, Butchertown, the Highlands, and Old Louisville each mix restaurants, shops, entertainment, and visitor traffic in different built environments. A storefront banner can announce an opening, seasonal menu, renovation, hiring event, or limited promotion without trying to carry every detail of the campaign.',
              ],
              items: [
                'Prioritize the offer, business name, date, and one call to action.',
                'Check sight lines from the sidewalk or street before finalizing type size.',
                'Verify property, preservation-district, overlay, and permit requirements for the exact address.',
              ],
            },
            {
              heading: 'Schools, churches, nonprofits, and employers',
              paragraphs: [
                'University of Louisville and Simmons College of Kentucky add campus fairs, athletics, service projects, and alumni events to the local calendar. Louisville Metro also identifies healthcare, manufacturing, transportation and warehousing, and retail as major employment sectors—settings where banners support recruiting, safety, open houses, fundraising, employee recognition, and community outreach.',
              ],
              items: [
                'Build reusable evergreen designs for annual programs and recurring outreach.',
                'Use changeable date panels or leave clear space for event-specific overlays when appropriate.',
                'For logistics and construction environments, favor simple messages and durable mounting plans.',
              ],
            },
          ],
          recommendations: [
            {
              use: 'Indoor exhibit booths at KICC or KEC',
              choice: '13 oz or 15 oz solid vinyl',
              reason: 'Strong color and opacity for booth walls, table fronts, sponsor backdrops, and aisle-facing messages.',
            },
            {
              use: 'Fence runs and exposed outdoor event areas',
              choice: 'Mesh banner material',
              reason: 'Perforation lets air pass through the print, which can reduce wind load compared with solid vinyl.',
            },
            {
              use: 'Storefront promotions and grand openings',
              choice: '15 oz solid vinyl',
              reason: 'A durable, professional option for bold street-facing messages when the display location is approved.',
            },
            {
              use: 'Construction, logistics, and healthcare wayfinding',
              choice: '15 oz or 18 oz vinyl',
              reason: 'Heavier solid materials suit repeated handling, larger signs, and longer campaigns when properly supported.',
            },
          ],
          permitNotice: {
            title: 'Check Louisville sign rules before installation',
            body:
              'Louisville Metro says temporary banner signs generally require a permit, have specified display limits, must be attached to permanent structures, and cannot flap or move with the wind. Rules vary by location, and several cities in Jefferson County use their own zoning authority. Confirm the current rule for the exact property before hanging a banner.',
            href: 'https://louisvilleky.gov/government/office-planning/sign-regulations',
            linkLabel: 'Review Louisville Metro sign regulations',
          },
          sourceLinks: [
            { label: 'Louisville Metro economic development strategy', href: 'https://louisvilleky.gov/government/economic-development/growing-louisville-together' },
            { label: 'Louisville Metro WorldFest', href: 'https://louisvilleky.gov/government/city-events/worldfest' },
            { label: 'Kentucky Exposition Center', href: 'https://kyexpo.org/' },
            { label: 'Kentucky International Convention Center', href: 'https://kyconvention.com/' },
            { label: 'National Weather Service Louisville', href: 'https://www.weather.gov/lmk/' },
            { label: 'St. James Court Art Show', href: 'https://www.stjamescourtartshow.com/' },
            { label: 'Louisville Tourism neighborhood guide', href: 'https://www.gotolouisville.com/neighborhoods/' },
          ],
        },
        internalLinks: [
          {
            label: 'Mesh banners for exposed Louisville sites',
            to: '/blog/vinyl-vs-mesh-banners-guide',
            description: 'Compare airflow-friendly mesh for fences, construction perimeters, and open event grounds.',
          },
          {
            label: 'Trade show banner planning',
            to: '/trade-shows',
            description: 'Browse the current U.S. trade show calendar before planning booth graphics, sponsor displays, and aisle-facing messages.'
          },
          {
            label: 'Event banner sizing guide',
            to: '/blog/perfect-banner-size-guide',
            description: 'Choose dimensions for entrances, schedules, sponsor displays, stages, vendors, and wayfinding.'
          },
          {
            label: 'Grand opening banner ideas',
            to: '/blog/grand-opening-banner-ideas',
            description: 'Use a practical checklist for the message, date, offer, layout, and installation plan.',
          },
        ],
      },
    },
  },
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
  localGuide?: LocalGuide;
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

  const metaTitle = editorial?.metaTitle || `${product.plural} ${cityState} | Custom Printing`;

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
    h1: editorial?.h1 || `${product.plural} in ${cityState}`,
    heroSubtitle: editorial?.heroSubtitle || `Current options and online pricing for ${product.lower} shipped to ${city.city}.`,
    introParagraph: editorial?.introduction || safeIntroduction,
    localGuide: editorial?.localGuide,
    metaTitle,
    metaDescription: editorial?.metaDescription || buildMetaDescription(productSlug, city, product),
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
      productSlug === 'yard-signs'
        ? { label: 'Yard signs fixed size and pricing', to: `/${product.slug}`, description: 'Compare the current 24×18-inch format, print-side options, minimums, optional stakes, and price examples.' }
        : { label: `${product.plural} sizes and pricing`, to: `/${product.slug}`, description: `Compare current ${product.lower} sizes, options, minimums, and price examples.` },
      { label: 'Production and shipping details', to: '/shipping', description: 'Review how production time and carrier transit time work.' },
      { label: 'Artwork and order FAQs', to: '/faq', description: 'Check file, preview, return, and cancellation policies before ordering.' },
      ...(editorial?.internalLinks || []),
    ],
    siblingProductLinks: gate.indexable
      ? (Object.keys(PRODUCT_LANDING_DATA) as CityProductSlug[])
          .filter((slug) => slug !== productSlug && evaluateLocalPagePublishGate(slug, city).indexable)
          .map((slug) => ({ label: `${PRODUCT_LANDING_DATA[slug].plural} shipped to ${cityState}`, to: `/${slug}/${city.slug}` }))
      : [],
    nearbyCityLinks: gate.indexable
      ? city.nearbyCitySlugs
          .map((slug) => CITY_BY_SLUG.get(slug))
          .filter((nearby): nearby is CityEntry => Boolean(nearby && evaluateLocalPagePublishGate(productSlug, nearby).indexable))
          .map((nearby) => ({ label: `${product.plural} shipped to ${nearby.city}, ${nearby.state}`, to: `/${productSlug}/${nearby.slug}` }))
      : [],
    configuratorUrl,
  };
}
