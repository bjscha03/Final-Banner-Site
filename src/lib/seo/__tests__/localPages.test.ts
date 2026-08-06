import { describe, expect, it } from 'vitest';
import { CAR_MAGNET_SIZES } from '@/lib/car-magnet-pricing';
import {
  getConfiguratorUrl,
  parseConfiguratorProductQuery,
} from '@/lib/configurator';
import { getProductConfig } from '@/lib/products';
import {
  CITIES,
  buildCityProductPageContent,
  evaluateLocalPagePublishGate,
  getAllCityProductPaths,
  getCityBySlug,
  getIndexableCityProductPaths,
  type CityProductSlug,
} from '@/lib/seo/cityData';
import { buildLocalPageSchema, buildProductHubSchema } from '@/lib/seo/localPageSchema';
import { PRODUCT_LANDING_DATA, SITE_URL } from '@/lib/seo/productLandingData';
import {
  YARD_SIGN_HEIGHT_IN,
  YARD_SIGN_MIN_QUANTITY,
  YARD_SIGN_SINGLE_SIDED_CENTS,
  YARD_SIGN_WIDTH_IN,
} from '@/lib/yard-sign-pricing';

const productSlugs = Object.keys(PRODUCT_LANDING_DATA) as CityProductSlug[];

describe('local page publication controls', () => {
  it('creates one unique route for every city/product pair', () => {
    const paths = getAllCityProductPaths();
    expect(paths).toHaveLength(CITIES.length * productSlugs.length);
    expect(new Set(paths.map(({ product, citySlug }) => `${product}/${citySlug}`)).size).toBe(paths.length);
  });

  it('publishes only the reviewed Louisville vinyl-banner page', () => {
    expect(getIndexableCityProductPaths()).toEqual([
      { product: 'vinyl-banners', citySlug: 'louisville-ky' },
    ]);

    for (const city of CITIES) {
      for (const product of productSlugs) {
        const gate = evaluateLocalPagePublishGate(product, city);
        const isReviewedLouisvillePage = city.slug === 'louisville-ky' && product === 'vinyl-banners';
        expect(gate.indexable).toBe(isReviewedLouisvillePage);
        if (isReviewedLouisvillePage) {
          expect(gate.reasons).toEqual([]);
        } else {
          expect(gate.reasons).toContain('No approved first-party local evidence.');
          expect(gate.reasons).toContain('Claims approval is missing.');
          expect(gate.reasons).toContain('Duplicate-content and policy validation is not approved.');
        }
      }
    }
  });

  it('provides source-backed Louisville guidance without claiming a local storefront', () => {
    const city = getCityBySlug('louisville-ky')!;
    const content = buildCityProductPageContent('vinyl-banners', city);
    expect(content.indexable).toBe(true);
    expect(content.h1).toBe('Vinyl Banner Printing in Louisville, KY');
    expect(content.introParagraph).toContain('does not represent a storefront or pickup location');
    expect(content.localGuide?.sections).toHaveLength(4);
    expect(content.localGuide?.recommendations).toHaveLength(4);
    expect(content.localGuide?.permitNotice?.href).toBe(
      'https://louisvilleky.gov/government/office-planning/sign-regulations',
    );
    expect(content.localGuide?.sourceLinks.every((source) => source.href.startsWith('https://'))).toBe(true);
    expect(content.internalLinks.map((link) => link.to)).toEqual(expect.arrayContaining([
      '/mesh-banners',
      '/trade-show-banners',
      '/event-banners',
      '/blog/grand-opening-banner-ideas',
    ]));
  });

  it('does not expose published-city links from an unpublished local page', () => {
    const lexington = getCityBySlug('lexington-ky')!;
    const content = buildCityProductPageContent('vinyl-banners', lexington);
    expect(content.indexable).toBe(false);
    expect(content.siblingProductLinks).toEqual([]);
    expect(content.nearbyCityLinks).toEqual([]);
  });

  it('uses concise, unique metadata and honest shipping-only language', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const city of CITIES) {
      for (const product of productSlugs) {
        const content = buildCityProductPageContent(product, city);
        expect(content.metaTitle.length).toBeLessThanOrEqual(60);
        expect(content.metaDescription.length, `${product}/${city.slug}: ${content.metaDescription}`).toBeLessThanOrEqual(160);
        expect(content.canonicalUrl).toBe(`${SITE_URL}/${product}/${city.slug}`);
        expect(content.introParagraph).toContain('does not represent a storefront or pickup location');
        expect(content.siblingProductLinks).toEqual([]);
        expect(content.nearbyCityLinks).toEqual([]);
        titles.add(content.metaTitle);
        descriptions.add(content.metaDescription);
      }
    }
    expect(titles.size).toBe(CITIES.length * productSlugs.length);
    expect(descriptions.size).toBe(CITIES.length * productSlugs.length);
  });
});

describe('product-aware configurator routing', () => {
  const cases: Array<[CityProductSlug, string, string]> = [
    ['vinyl-banners', 'banner', 'banner'],
    ['yard-signs', 'yard-signs', 'yard_sign'],
    ['car-magnets', 'car-magnets', 'car_magnet'],
  ];

  it.each(cases)('routes %s to the supported Design product mode', (slug, queryValue, productType) => {
    const url = new URL(getConfiguratorUrl(slug, `/${slug}/louisville-ky`, 'local-page'), SITE_URL);
    expect(url.pathname).toBe('/design');
    expect(url.searchParams.get('product')).toBe(queryValue);
    expect(url.searchParams.get('source')).toBe('local-page');
    expect(url.searchParams.get('source_page')).toBe(`/${slug}/louisville-ky`);
    expect(parseConfiguratorProductQuery(url.searchParams.get('product'))).toBe(productType);
  });
});

describe('commerce parity', () => {
  it('derives landing-page starting prices from active commerce data', () => {
    expect(PRODUCT_LANDING_DATA['vinyl-banners'].startingPriceCents).toBe(getProductConfig('banner').minimumUnitPriceCents);
    expect(PRODUCT_LANDING_DATA['yard-signs'].startingPriceCents).toBe(YARD_SIGN_SINGLE_SIDED_CENTS * YARD_SIGN_MIN_QUANTITY);
    expect(PRODUCT_LANDING_DATA['car-magnets'].startingPriceCents).toBe(CAR_MAGNET_SIZES[0].basePriceCents);
    expect(CAR_MAGNET_SIZES[0].basePriceCents).toBe(2900);
  });

  it('does not advertise unsupported yard-sign or magnet configurations', () => {
    const yard = getProductConfig('yard_sign');
    const car = getProductConfig('car_magnet');
    expect(yard.allowCustomDimensions).toBe(false);
    expect(yard.predefinedSizes).toEqual([
      expect.objectContaining({ widthIn: YARD_SIGN_WIDTH_IN, heightIn: YARD_SIGN_HEIGHT_IN }),
    ]);
    expect(PRODUCT_LANDING_DATA['yard-signs'].sizes).toHaveLength(1);
    expect(PRODUCT_LANDING_DATA['yard-signs'].sizes[0]).toMatch(/24.*18.*only/i);
    expect(PRODUCT_LANDING_DATA['yard-signs'].priceExamples.slice(0, 2).every((example) => /24.*18/.test(example.configuration))).toBe(true);
    expect(PRODUCT_LANDING_DATA['yard-signs'].sizes.join(' ')).not.toMatch(/custom/i);
    expect(car.allowCustomDimensions).toBe(false);
    expect(CAR_MAGNET_SIZES).toHaveLength(car.predefinedSizes?.length || 0);
    expect(PRODUCT_LANDING_DATA['car-magnets'].options.join(' ')).not.toMatch(/custom shape|custom size/i);
  });
});

describe('structured data', () => {
  it('uses connected organization, website, page, service, product, offer, image, breadcrumb, and visible FAQ nodes', () => {
    const city = getCityBySlug('louisville-ky')!;
    const content = buildCityProductPageContent('vinyl-banners', city);
    const schema = buildLocalPageSchema('vinyl-banners', city, content);
    const graph = schema['@graph'];
    const types = graph.map((node) => node['@type']);
    expect(types).toEqual(expect.arrayContaining([
      'Organization', 'WebSite', 'WebPage', 'Service', 'Product', 'Offer', 'ImageObject', 'BreadcrumbList', 'FAQPage',
    ]));
    expect(types).not.toContain('LocalBusiness');

    const offer = graph.find((node) => node['@type'] === 'Offer')!;
    expect(offer.price).toBe('20.00');
    expect(offer.url).toContain('/design?product=banner');

    const faq = graph.find((node) => node['@type'] === 'FAQPage')!;
    expect(faq.mainEntity.map((entity) => [entity.name, entity.acceptedAnswer.text])).toEqual(
      content.faqs.map((item) => [item.question, item.answer]),
    );
  });

  it.each(productSlugs)('keeps %s hub Offer and FAQ schema aligned with visible product data', (slug) => {
    const product = PRODUCT_LANDING_DATA[slug];
    const schema = buildProductHubSchema(product, `${SITE_URL}/${slug}`);
    const graph = schema['@graph'];
    expect(graph.map((node) => node['@type'])).not.toContain('LocalBusiness');
    expect(graph.find((node) => node['@type'] === 'Offer')?.price).toBe((product.startingPriceCents / 100).toFixed(2));
    expect(graph.find((node) => node['@type'] === 'FAQPage')?.mainEntity).toHaveLength(product.faqs.length);
    const pageName = String(graph.find((node) => node['@type'] === 'WebPage')?.name);
    if (slug === 'yard-signs') {
      expect(pageName).toContain('24×18 Size');
      expect(pageName).not.toContain('Sizes,');
    }
  });
});
