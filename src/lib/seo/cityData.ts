/**
 * Programmatic SEO data for city × product landing pages.
 *
 * Pages produced from this file:
 *   /vinyl-banners/[city-state]
 *   /yard-signs/[city-state]
 *   /car-magnets/[city-state]
 *
 * --------------------------------------------------------------------------
 * HOW TO ADD A NEW CITY
 * --------------------------------------------------------------------------
 * 1. Append a new entry to the `CITIES` array below. Required fields:
 *      - slug:        URL-safe `city-state` (e.g. "san-antonio-tx")
 *      - city:        Display name (e.g. "San Antonio")
 *      - state:       Two-letter postal code (e.g. "TX")
 *      - stateName:   Full state name (e.g. "Texas")
 *      - region:      A short regional descriptor used in copy
 *                     (e.g. "South Texas", "the Pacific Northwest")
 *      - industries:  3–5 local industries / customer types used in
 *                     city-specific use-case copy
 *      - landmarks:   2–3 landmarks / neighborhoods / events used to
 *                     ground the intro paragraph (no copyrighted slogans)
 *      - intro:       2–3 sentence unique intro paragraph (no boilerplate).
 *                     Must use "We serve customers in {City}" framing —
 *                     never "We are located in {City}".
 *
 * 2. The page will be generated automatically for all three product types.
 *    Add the three new URLs to `public/sitemap.xml` (one per product) so
 *    search engines discover them.
 *
 * 3. No other code changes are required. Routes, schema, FAQ, internal
 *    links, breadcrumbs and meta tags are all derived from this data.
 * --------------------------------------------------------------------------
 */

export type CityProductSlug = 'vinyl-banners' | 'yard-signs' | 'car-magnets';

export interface CityEntry {
  /** city-state slug, e.g. "louisville-ky" */
  slug: string;
  city: string;
  state: string;
  stateName: string;
  region: string;
  industries: string[];
  landmarks: string[];
  /** Unique 2–3 sentence intro paragraph used on every product page for
   *  this city. Must use the "we serve customers in {City}" framing. */
  intro: string;
}

export interface ProductDefinition {
  slug: CityProductSlug;
  /** Singular noun used in headings ("Vinyl Banner") */
  singular: string;
  /** Plural / page-title noun ("Vinyl Banners") */
  plural: string;
  /** Lower-case form for use mid-sentence */
  lower: string;
  /** Short marketing tagline used in the meta description */
  tagline: string;
  /** Top product benefits (used as the "Why choose..." list) */
  benefits: string[];
  /** Default OG image (relative to siteUrl) */
  ogImage: string;
  /** Indicative starting price (USD) — used only for Product schema */
  startingPrice: string;
}

/** Three programmatic SEO product types. */
export const PRODUCTS: Record<CityProductSlug, ProductDefinition> = {
  'vinyl-banners': {
    slug: 'vinyl-banners',
    singular: 'Vinyl Banner',
    plural: 'Vinyl Banners',
    lower: 'vinyl banners',
    tagline:
      'Custom 13oz, 15oz and 18oz vinyl banners printed within 24 hours and shipped free via next-day air.',
    benefits: [
      'Heavy-duty 13oz, 15oz and 18oz scrim vinyl built for indoor and outdoor use',
      'Full-bleed, full-color printing with crisp text and vivid graphics',
      'Reinforced hems and rust-resistant grommets included at no extra charge',
      'Custom sizes from small storefront banners to large 10ft × 50ft displays',
      'Fade- and weather-resistant inks rated for years of outdoor exposure',
      'Free design preview and proof before anything goes to print',
    ],
    ogImage: '/images/og-default.png',
    startingPrice: '14.99',
  },
  'yard-signs': {
    slug: 'yard-signs',
    singular: 'Yard Sign',
    plural: 'Yard Signs',
    lower: 'yard signs',
    tagline:
      'Custom corrugated plastic yard signs printed within 24 hours and shipped free via next-day air.',
    benefits: [
      'Durable 4mm corrugated plastic that holds up to wind, rain and sun',
      'Single- or double-sided full-color printing for maximum visibility',
      'H-stakes available so signs install in seconds in any yard or median',
      'Standard 18×24 size plus fully custom dimensions for unique campaigns',
      'Bulk pricing on real estate, political, contractor and event quantities',
      'Lightweight and easy to transport, store and reuse for repeat events',
    ],
    ogImage: '/images/og-default.png',
    startingPrice: '9.99',
  },
  'car-magnets': {
    slug: 'car-magnets',
    singular: 'Car Magnet',
    plural: 'Car Magnets',
    lower: 'car magnets',
    tagline:
      'Custom vehicle magnets printed within 24 hours and shipped free via next-day air.',
    benefits: [
      'Heavy-duty 30 mil magnetic material that grips steel vehicle panels firmly',
      'Vivid UV-resistant printing that stays sharp through sun, rain and car washes',
      'Removable and reusable — promote your business on the clock, take them off after hours',
      'Standard 12×24 and 18×24 sizes plus custom shapes and dimensions',
      'Pairs of identical magnets for matching driver- and passenger-side branding',
      'No paint damage, no permanent installation, no commitment',
    ],
    ogImage: '/images/og-default.png',
    startingPrice: '19.99',
  },
};

/** ------------------------------------------------------------------
 * Initial 20-city launch list. Order is preserved in any UI listings.
 * ------------------------------------------------------------------ */
export const CITIES: CityEntry[] = [
  {
    slug: 'louisville-ky',
    city: 'Louisville',
    state: 'KY',
    stateName: 'Kentucky',
    region: 'the Kentuckiana region',
    industries: ['Derby-week event organizers', 'bourbon distilleries', 'small contractors', 'real estate teams', 'local restaurants'],
    landmarks: ['Churchill Downs', 'NuLu', 'the Highlands'],
    intro:
      'We serve customers in Louisville, KY with custom signage built for everything from Derby-week activations on Bardstown Road to year-round storefront branding in NuLu and the Highlands. Whether you are promoting a bourbon tasting, opening a new restaurant, or staking yard signs across the Kentuckiana region, our team prints fast and ships even faster.',
  },
  {
    slug: 'lexington-ky',
    city: 'Lexington',
    state: 'KY',
    stateName: 'Kentucky',
    region: 'the Bluegrass region',
    industries: ['equestrian events', 'University of Kentucky departments', 'horse farms', 'local realtors', 'breweries'],
    landmarks: ['Keeneland', 'the Kentucky Horse Park', 'downtown Lexington'],
    intro:
      'We serve customers in Lexington, KY who need professional signage for everything from Keeneland race meets and Kentucky Horse Park events to UK tailgates and downtown grand openings. Across the Bluegrass region we help farms, small businesses and event teams put bold, weatherproof graphics in front of every audience.',
  },
  {
    slug: 'cincinnati-oh',
    city: 'Cincinnati',
    state: 'OH',
    stateName: 'Ohio',
    region: 'the Greater Cincinnati / Tri-State area',
    industries: ['sports event promoters', 'trade-show exhibitors', 'craft breweries', 'home services contractors', 'real estate offices'],
    landmarks: ['Over-the-Rhine', 'The Banks', 'Findlay Market'],
    intro:
      'We serve customers in Cincinnati, OH who need signage that performs from Over-the-Rhine pop-ups to The Banks game-day activations. Across the Greater Cincinnati and Tri-State area, our printing team turns around banners, yard signs and vehicle graphics fast enough to keep up with festival weekends and last-minute job-site needs.',
  },
  {
    slug: 'indianapolis-in',
    city: 'Indianapolis',
    state: 'IN',
    stateName: 'Indiana',
    region: 'central Indiana',
    industries: ['motorsports event teams', 'convention exhibitors', 'home builders', 'realtors', 'school athletic programs'],
    landmarks: ['the Indianapolis Motor Speedway', 'Mass Ave', 'downtown Circle Centre'],
    intro:
      'We serve customers in Indianapolis, IN who need signage built for race weekends, Mass Ave grand openings and central Indiana job sites alike. From the Motor Speedway to suburban open houses, our team produces large-format prints quickly so you can hit your event date with confidence.',
  },
  {
    slug: 'nashville-tn',
    city: 'Nashville',
    state: 'TN',
    stateName: 'Tennessee',
    region: 'Middle Tennessee',
    industries: ['live-music venues', 'event production companies', 'restaurants and bars', 'real estate teams', 'home builders'],
    landmarks: ['Lower Broadway', 'The Gulch', 'East Nashville'],
    intro:
      'We serve customers in Nashville, TN who need standout signage for Lower Broadway venues, Gulch grand openings and East Nashville pop-ups. Across Middle Tennessee, our crew prints durable banners, yard signs and vehicle magnets quickly so artists, venues and contractors are never waiting on graphics.',
  },
  {
    slug: 'columbus-oh',
    city: 'Columbus',
    state: 'OH',
    stateName: 'Ohio',
    region: 'central Ohio',
    industries: ['Ohio State game-day organizers', 'tech startups', 'restaurants', 'home services contractors', 'real estate brokers'],
    landmarks: ['the Short North', 'German Village', 'the Ohio State campus'],
    intro:
      'We serve customers in Columbus, OH with signage built for the Short North arts scene, German Village storefronts and game-day weekends near campus. From small business launches to large central Ohio events, our printing team turns around durable, full-color graphics in time for your next opening, festival or open house.',
  },
  {
    slug: 'chicago-il',
    city: 'Chicago',
    state: 'IL',
    stateName: 'Illinois',
    region: 'the Chicagoland area',
    industries: ['McCormick Place exhibitors', 'restaurants', 'construction firms', 'real estate teams', 'community festivals'],
    landmarks: ['the Loop', 'Wicker Park', 'Wrigleyville'],
    intro:
      'We serve customers in Chicago, IL who need signage strong enough for windy lakefront events and bright enough to compete on a busy West Loop block. From McCormick Place trade-show booths to Wrigleyville bar promotions, we deliver professional banners, yard signs and vehicle magnets across the Chicagoland area on a timeline that respects your event date.',
  },
  {
    slug: 'st-louis-mo',
    city: 'St. Louis',
    state: 'MO',
    stateName: 'Missouri',
    region: 'the Greater St. Louis area',
    industries: ['Cardinals game-day promoters', 'craft breweries', 'home builders', 'school booster clubs', 'real estate offices'],
    landmarks: ['the Gateway Arch grounds', 'The Hill', 'Soulard'],
    intro:
      'We serve customers in St. Louis, MO with signage tuned to Cardinals game days, Soulard street festivals and The Hill restaurant launches. Throughout the Greater St. Louis area we print and ship banners, yard signs and car magnets quickly so your team is never the bottleneck.',
  },
  {
    slug: 'atlanta-ga',
    city: 'Atlanta',
    state: 'GA',
    stateName: 'Georgia',
    region: 'metro Atlanta',
    industries: ['convention exhibitors', 'film and event production crews', 'real estate teams', 'restaurants', 'home services contractors'],
    landmarks: ['Midtown', 'the BeltLine', 'Buckhead'],
    intro:
      'We serve customers in Atlanta, GA who need signage that holds up under Georgia heat — from BeltLine pop-ups and Midtown grand openings to Buckhead retail and metro Atlanta job sites. Our team produces vibrant, weather-tough graphics fast enough for tomorrow’s event, not next week’s.',
  },
  {
    slug: 'charlotte-nc',
    city: 'Charlotte',
    state: 'NC',
    stateName: 'North Carolina',
    region: 'the Carolinas',
    industries: ['banking and finance corporate events', 'home builders', 'NASCAR-adjacent businesses', 'real estate teams', 'craft breweries'],
    landmarks: ['Uptown', 'NoDa', 'South End'],
    intro:
      'We serve customers in Charlotte, NC with signage for Uptown corporate events, NoDa brewery launches and South End streetscapes. Across the Carolinas we print custom banners, yard signs and vehicle magnets quickly so growing brands look the part on day one.',
  },
  {
    slug: 'dallas-tx',
    city: 'Dallas',
    state: 'TX',
    stateName: 'Texas',
    region: 'the Dallas–Fort Worth metroplex',
    industries: ['trade-show exhibitors', 'real estate teams', 'restaurants', 'general contractors', 'sports event organizers'],
    landmarks: ['Deep Ellum', 'Uptown', 'the Bishop Arts District'],
    intro:
      'We serve customers in Dallas, TX with signage built for everything from Deep Ellum live shows to Uptown corporate launches and Bishop Arts pop-ups. Across the Dallas–Fort Worth metroplex we deliver bold, weather-tough graphics in time for the timeline you actually have.',
  },
  {
    slug: 'houston-tx',
    city: 'Houston',
    state: 'TX',
    stateName: 'Texas',
    region: 'the Gulf Coast',
    industries: ['energy-sector trade shows', 'restaurants', 'rodeo and festival vendors', 'real estate offices', 'general contractors'],
    landmarks: ['Downtown', 'the Heights', 'Midtown'],
    intro:
      'We serve customers in Houston, TX who need signage durable enough for Gulf Coast humidity and bright enough to stand out from the Energy Corridor to the Heights. From rodeo-season vendor booths to Midtown restaurant openings, we print and ship full-color graphics quickly across greater Houston.',
  },
  {
    slug: 'austin-tx',
    city: 'Austin',
    state: 'TX',
    stateName: 'Texas',
    region: 'central Texas',
    industries: ['music and tech festival vendors', 'food trucks', 'craft breweries', 'real estate teams', 'home builders'],
    landmarks: ['South Congress', 'East Austin', 'the Domain'],
    intro:
      'We serve customers in Austin, TX with festival-ready signage for South Congress activations, East Austin pop-ups and the Domain’s growing retail scene. Across central Texas our crew turns around banners, yard signs and food-truck-friendly vehicle magnets fast enough for the next downtown weekend.',
  },
  {
    slug: 'phoenix-az',
    city: 'Phoenix',
    state: 'AZ',
    stateName: 'Arizona',
    region: 'the Valley of the Sun',
    industries: ['outdoor event organizers', 'home builders', 'HVAC and roofing contractors', 'real estate teams', 'sports event promoters'],
    landmarks: ['downtown Phoenix', 'Old Town Scottsdale', 'Tempe'],
    intro:
      'We serve customers in Phoenix, AZ with signage engineered for Valley of the Sun heat and full-on summer UV — from downtown festival booths to Old Town Scottsdale storefronts and Tempe game days. Our printing team uses fade-resistant inks and heavy-duty materials so your message stays sharp all season.',
  },
  {
    slug: 'denver-co',
    city: 'Denver',
    state: 'CO',
    stateName: 'Colorado',
    region: 'the Front Range',
    industries: ['outdoor recreation brands', 'craft breweries', 'home builders', 'real estate teams', 'event organizers'],
    landmarks: ['LoDo', 'RiNo', 'the Highlands'],
    intro:
      'We serve customers in Denver, CO with signage built for high-altitude sun, Front Range wind and everything from RiNo gallery openings to LoDo bar nights. Whether you’re launching a Highlands restaurant or staking yard signs for a Boulder-bound campaign, we print and ship fast.',
  },
  {
    slug: 'tampa-fl',
    city: 'Tampa',
    state: 'FL',
    stateName: 'Florida',
    region: 'the Tampa Bay area',
    industries: ['Gasparilla event teams', 'restaurants', 'real estate brokers', 'home builders', 'sports event organizers'],
    landmarks: ['Ybor City', 'the Riverwalk', 'Hyde Park'],
    intro:
      'We serve customers in Tampa, FL with signage built for Gasparilla weekends, Riverwalk events and Hyde Park grand openings. Across the Tampa Bay area we print weather-tough banners, yard signs and vehicle magnets that survive humidity, salt air and afternoon storms.',
  },
  {
    slug: 'orlando-fl',
    city: 'Orlando',
    state: 'FL',
    stateName: 'Florida',
    region: 'central Florida',
    industries: ['convention exhibitors', 'tourism and hospitality businesses', 'real estate teams', 'event production crews', 'home services contractors'],
    landmarks: ['the Orange County Convention Center', 'Lake Eola', 'Winter Park'],
    intro:
      'We serve customers in Orlando, FL with trade-show booth graphics for the Orange County Convention Center, signage for Lake Eola events and storefronts in Winter Park. Across central Florida we ship fast so visiting exhibitors and local businesses alike never miss a deadline.',
  },
  {
    slug: 'miami-fl',
    city: 'Miami',
    state: 'FL',
    stateName: 'Florida',
    region: 'South Florida',
    industries: ['nightlife and event promoters', 'restaurants', 'real estate teams', 'art-week exhibitors', 'marine and boating businesses'],
    landmarks: ['Wynwood', 'South Beach', 'Brickell'],
    intro:
      'We serve customers in Miami, FL with signage tuned for Wynwood art weeks, South Beach activations and Brickell corporate launches. Across South Florida we print full-color, salt-air-ready banners, yard signs and vehicle magnets and ship them fast enough to meet event schedules.',
  },
  {
    slug: 'jacksonville-fl',
    city: 'Jacksonville',
    state: 'FL',
    stateName: 'Florida',
    region: 'northeast Florida',
    industries: ['Jaguars game-day promoters', 'real estate teams', 'home services contractors', 'beach event organizers', 'restaurants'],
    landmarks: ['downtown Jacksonville', 'Riverside', 'Jacksonville Beach'],
    intro:
      'We serve customers in Jacksonville, FL with signage that holds up to coastal humidity from downtown and Riverside to Jacksonville Beach boardwalks. Our team prints and ships banners, yard signs and car magnets quickly across northeast Florida so local businesses and event teams stay on schedule.',
  },
  {
    slug: 'raleigh-nc',
    city: 'Raleigh',
    state: 'NC',
    stateName: 'North Carolina',
    region: 'the Research Triangle',
    industries: ['NC State game-day organizers', 'tech startups', 'home builders', 'real estate offices', 'restaurants'],
    landmarks: ['downtown Raleigh', 'Glenwood South', 'North Hills'],
    intro:
      'We serve customers in Raleigh, NC with signage built for downtown grand openings, Glenwood South nightlife and North Hills retail. Across the Research Triangle we help startups, contractors and event teams put professional, full-color graphics in front of customers fast.',
  },
];

/** Map for fast slug lookup. */
const CITY_BY_SLUG: Record<string, CityEntry> = CITIES.reduce(
  (acc, c) => {
    acc[c.slug] = c;
    return acc;
  },
  {} as Record<string, CityEntry>,
);

export function getCityBySlug(slug: string | undefined): CityEntry | undefined {
  if (!slug) return undefined;
  return CITY_BY_SLUG[slug.toLowerCase()];
}

export function getProduct(slug: CityProductSlug | string | undefined): ProductDefinition | undefined {
  if (!slug) return undefined;
  return PRODUCTS[slug as CityProductSlug];
}

export function getAllCityProductPaths(): { product: CityProductSlug; citySlug: string }[] {
  const products: CityProductSlug[] = ['vinyl-banners', 'yard-signs', 'car-magnets'];
  const out: { product: CityProductSlug; citySlug: string }[] = [];
  for (const p of products) for (const c of CITIES) out.push({ product: p, citySlug: c.slug });
  return out;
}

/** ------------------------------------------------------------------
 * Programmatic content generation. All copy is derived from city +
 * product data so that every page is unique without manual content
 * authoring per page.
 * ------------------------------------------------------------------ */

export interface CityProductPageContent {
  /** /vinyl-banners/louisville-ky */
  path: string;
  canonicalUrl: string;

  h1: string;
  /** Slightly varied "supporting" headline for the hero subtitle */
  heroSubtitle: string;

  /** Unique intro paragraph used at the top of the page body */
  introParagraph: string;

  metaTitle: string;
  metaDescription: string;
  keywords: string[];

  /** "Why ..." section heading varies by product */
  benefitsHeading: string;
  benefits: string[];

  /** City-specific use cases */
  useCasesHeading: string;
  useCases: string[];

  /** FAQ shown on page + emitted as schema */
  faqs: { question: string; answer: string }[];

  /** Breadcrumb trail */
  breadcrumbs: { name: string; url: string }[];

  /** Internal links shown to users (and crawlable) */
  internalLinks: { label: string; to: string; description: string }[];

  /** Sibling product city pages, for cross-linking */
  siblingProductLinks: { label: string; to: string }[];

  /** Schema.org image (absolute or root-relative) */
  schemaImage: string;
  /** Indicative starting price for Product schema */
  startingPrice: string;
}

const SITE_URL = 'https://bannersonthefly.com';

const BENEFIT_HEADINGS: Record<CityProductSlug, (city: string) => string> = {
  'vinyl-banners': (city) => `Why ${city} Businesses Choose Our Vinyl Banners`,
  'yard-signs':   (city) => `Why Teams in ${city} Trust Our Yard Signs`,
  'car-magnets':  (city) => `Why ${city} Drivers Pick Our Car Magnets`,
};

const USE_CASE_HEADINGS: Record<CityProductSlug, (city: string) => string> = {
  'vinyl-banners': (city) => `Popular Vinyl Banner Uses in ${city}`,
  'yard-signs':   (city) => `Where Yard Signs Work in ${city}`,
  'car-magnets':  (city) => `How ${city} Businesses Use Car Magnets`,
};

/** Builds 5–6 city-specific use cases by mixing product-typical scenarios
 *  with the city's local industries. Output varies per city automatically. */
function buildUseCases(product: CityProductSlug, city: CityEntry): string[] {
  const ind = city.industries;
  const land = city.landmarks;
  const cityName = city.city;

  const pickIndustry = (i: number) => ind[i % ind.length];
  const pickLandmark = (i: number) => land[i % land.length];

  if (product === 'vinyl-banners') {
    return [
      `Storefront and grand-opening banners for ${pickIndustry(0)} across ${cityName}`,
      `Trade-show and festival backdrops near ${pickLandmark(0)}`,
      `Construction and job-site banners for ${pickIndustry(1)} in ${city.region}`,
      `Sponsor and team banners for school athletics and community leagues in ${cityName}`,
      `Real-estate "now leasing" and open-house banners for ${pickIndustry(2)}`,
      `Outdoor event banners for ${pickIndustry(3)} working ${pickLandmark(1)} weekends`,
    ];
  }

  if (product === 'yard-signs') {
    return [
      `Open-house and "just sold" signs for ${pickIndustry(2)} across ${cityName}`,
      `Local political and advocacy campaigns throughout ${city.region}`,
      `Lawn-care, roofing and HVAC signs for ${pickIndustry(1)} on residential streets`,
      `Garage sale, fundraiser and church event signs near ${pickLandmark(0)}`,
      `School play, sports and graduation signs for families in ${cityName}`,
      `Pop-up retail, food-truck and weekend market signs around ${pickLandmark(1)}`,
    ];
  }

  // car-magnets
  return [
    `Service-vehicle branding for ${pickIndustry(1)} working across ${cityName}`,
    `Realtor and agent vehicle magnets for ${pickIndustry(2)} on the move in ${city.region}`,
    `Restaurant and food-truck magnets for ${pickIndustry(0)} near ${pickLandmark(0)}`,
    `Rideshare and delivery driver branding around ${pickLandmark(1)}`,
    `Event and fleet magnets for ${pickIndustry(3)} during ${cityName} event weekends`,
    `Removable promotional magnets for staff cars on the clock, off after hours`,
  ];
}

/** Build the page-level FAQ. We keep two product-agnostic, three city-specific
 *  questions — fully unique per page once interpolated. */
function buildFaqs(product: ProductDefinition, city: CityEntry): { question: string; answer: string }[] {
  const cityState = `${city.city}, ${city.state}`;
  return [
    {
      question: `Do you ship ${product.lower} to ${cityState}?`,
      answer: `Yes. We serve customers in ${cityState} and across ${city.region}. Every order is printed within 24 hours and shipped free via next-day air, so most ${product.lower} arrive the next business day after production.`,
    },
    {
      question: `How fast can I get ${product.lower} for an event in ${city.city}?`,
      answer: `Approve your proof before our daily cutoff and your ${product.lower} are printed within 24 hours and shipped free via next-day air. That timeline works for most last-minute ${city.city} events, grand openings and trade shows.`,
    },
    {
      question: `Can I order custom sizes for my ${city.city} project?`,
      answer: `Absolutely. Use our online designer to enter the exact dimensions you need for your ${city.city} storefront, job site, vehicle or event. Pricing updates instantly and your file is print-ready when you check out.`,
    },
    {
      question: `Do you offer design help if I don't have artwork ready?`,
      answer: `Yes — you can upload finished artwork, design from scratch in our editor, or use the built-in AI tools to generate a starting point. We always send a free proof for approval before printing.`,
    },
    {
      question: `Are your ${product.lower} built for outdoor use?`,
      answer: `Yes. Our ${product.lower} use weather-resistant materials and UV-stable inks, so they hold up to ${city.city}-area sun, wind and rain on storefronts, job sites, lawns and vehicles.`,
    },
  ];
}

export function buildCityProductPageContent(
  productSlug: CityProductSlug,
  city: CityEntry,
): CityProductPageContent {
  const product = PRODUCTS[productSlug];
  const cityState = `${city.city}, ${city.state}`;
  const path = `/${productSlug}/${city.slug}`;
  const canonicalUrl = `${SITE_URL}${path}`;

  const h1 = `${product.plural} in ${cityState}`;
  const heroSubtitle = `Custom ${product.lower} for ${city.city} businesses, contractors and event teams. Printed within 24 hours and shipped free via next-day air.`;

  const metaTitle = `${product.plural} in ${cityState} | Free Next-Day Air | 24-Hour Production`;
  const metaDescription = `${product.tagline} We serve customers in ${cityState} with fast turnaround, free design proofs and no-rush-fee pricing.`;

  const keywords = [
    `${product.lower} ${city.city.toLowerCase()}`,
    `${product.lower} ${city.city.toLowerCase()} ${city.state.toLowerCase()}`,
    `custom ${product.lower} ${city.city.toLowerCase()}`,
    `${product.lower} ${city.stateName.toLowerCase()}`,
    `cheap ${product.lower} ${city.city.toLowerCase()}`,
    `same day ${product.lower} ${city.city.toLowerCase()}`,
  ];

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: product.plural, url: `/${product.slug}` },
    { name: cityState, url: path },
  ];

  // Internal links — required by the brief
  const internalLinks = [
    {
      label: 'Start designing online',
      to: '/design',
      description: `Open our designer and create your ${product.lower} for ${city.city} in minutes.`,
    },
    {
      label: 'Same-day production options',
      to: '/google-ads-banner',
      description: 'Learn about our Same-Day Hit Service production window and free next-day shipping.',
    },
    {
      label: `Browse all ${product.plural.toLowerCase()}`,
      to: `/${product.slug}`,
      description: `See materials, sizes and pricing for our full ${product.lower} lineup.`,
    },
  ];

  // Cross-links to the same city in the other two product types
  const siblingProductLinks: { label: string; to: string }[] = [];
  (Object.keys(PRODUCTS) as CityProductSlug[])
    .filter((p) => p !== productSlug)
    .forEach((p) => {
      siblingProductLinks.push({
        label: `${PRODUCTS[p].plural} in ${cityState}`,
        to: `/${p}/${city.slug}`,
      });
    });

  return {
    path,
    canonicalUrl,
    h1,
    heroSubtitle,
    introParagraph: city.intro,
    metaTitle,
    metaDescription,
    keywords,
    benefitsHeading: BENEFIT_HEADINGS[productSlug](city.city),
    benefits: product.benefits,
    useCasesHeading: USE_CASE_HEADINGS[productSlug](city.city),
    useCases: buildUseCases(productSlug, city),
    faqs: buildFaqs(product, city),
    breadcrumbs,
    internalLinks,
    siblingProductLinks,
    schemaImage: product.ogImage,
    startingPrice: product.startingPrice,
  };
}
