import { getAbsoluteConfiguratorUrl, getConfiguratorUrl } from '@/lib/configurator';
import type { CityEntry, CityProductPageContent, CityProductSlug } from '@/lib/seo/cityData';
import { SITE_URL, type ProductLandingDefinition } from '@/lib/seo/productLandingData';

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export function getWebSiteNode() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: 'Banners On The Fly',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function getOrganizationNode() {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Banners On The Fly',
    legalName: 'BPS Sales Group, Inc. DBA Banners on the Fly',
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE_URL}/#logo`,
      url: `${SITE_URL}/images/logo-social.svg`,
      contentUrl: `${SITE_URL}/images/logo-social.svg`,
      caption: 'Banners On The Fly',
    },
    description: 'Online custom banner, yard sign, and car magnet printing with nationwide shipping.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@bannersonthefly.com',
      availableLanguage: 'English',
    },
    sameAs: ['https://www.linkedin.com/company/banners-on-the-fly/'],
  };
}

function imageNode(product: ProductLandingDefinition) {
  const imageUrl = `${SITE_URL}${product.socialImage}`;
  return {
    '@type': 'ImageObject',
    '@id': `${SITE_URL}/${product.slug}/#primaryimage`,
    url: imageUrl,
    contentUrl: imageUrl,
    width: 1200,
    height: 630,
    caption: product.heroImageAlt,
  };
}

function breadcrumbNode(content: CityProductPageContent) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${content.canonicalUrl}#breadcrumb`,
    itemListElement: content.breadcrumbs.map((breadcrumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: breadcrumb.name,
      item: breadcrumb.url.startsWith('http') ? breadcrumb.url : `${SITE_URL}${breadcrumb.url}`,
    })),
  };
}

function faqNode(content: CityProductPageContent) {
  return {
    '@type': 'FAQPage',
    '@id': `${content.canonicalUrl}#faq`,
    mainEntity: content.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function buildLocalPageSchema(
  productSlug: CityProductSlug,
  city: CityEntry,
  content: CityProductPageContent,
) {
  const product = content.product;
  const image = imageNode(product);
  const productId = `${content.canonicalUrl}#product`;
  const serviceId = `${content.canonicalUrl}#service`;
  const offerId = `${content.canonicalUrl}#offer`;
  const webPageId = `${content.canonicalUrl}#webpage`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      getOrganizationNode(),
      getWebSiteNode(),
      image,
      {
        '@type': 'WebPage',
        '@id': webPageId,
        url: content.canonicalUrl,
        name: content.metaTitle,
        description: content.metaDescription,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: [{ '@id': serviceId }, { '@id': productId }],
        primaryImageOfPage: { '@id': image['@id'] },
        breadcrumb: { '@id': `${content.canonicalUrl}#breadcrumb` },
        publisher: { '@id': ORGANIZATION_ID },
      },
      breadcrumbNode(content),
      {
        '@type': 'Service',
        '@id': serviceId,
        name: `${product.plural} shipped to ${city.city}, ${city.state}`,
        serviceType: `Custom ${product.lower} printing and shipping`,
        provider: { '@id': ORGANIZATION_ID },
        areaServed: {
          '@type': 'City',
          name: `${city.city}, ${city.stateName}`,
        },
        serviceOutput: { '@id': productId },
        url: content.canonicalUrl,
      },
      {
        '@type': 'Product',
        '@id': productId,
        name: `${product.plural} for ${city.city}, ${city.state}`,
        description: content.metaDescription,
        image: { '@id': image['@id'] },
        brand: { '@type': 'Brand', name: 'Banners On The Fly' },
        offers: { '@id': offerId },
      },
      {
        '@type': 'Offer',
        '@id': offerId,
        url: getAbsoluteConfiguratorUrl(productSlug, content.path, 'local-page'),
        price: (product.startingPriceCents / 100).toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@id': ORGANIZATION_ID },
      },
      faqNode(content),
    ],
  };
}

export function buildProductHubSchema(product: ProductLandingDefinition, canonicalUrl: string) {
  const image = imageNode(product);
  const productId = `${canonicalUrl}#product`;
  const offerId = `${canonicalUrl}#offer`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      getOrganizationNode(),
      getWebSiteNode(),
      image,
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: `${product.plural} | Sizes, Options & Pricing`,
        description: product.overview,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        primaryImageOfPage: { '@id': image['@id'] },
        breadcrumb: { '@id': `${canonicalUrl}#breadcrumb` },
        publisher: { '@id': ORGANIZATION_ID },
        about: { '@id': productId },
      },
      {
        '@type': 'Product',
        '@id': productId,
        name: product.plural,
        description: product.overview,
        image: { '@id': image['@id'] },
        brand: { '@type': 'Brand', name: 'Banners On The Fly' },
        offers: { '@id': offerId },
      },
      {
        '@type': 'Offer',
        '@id': offerId,
        url: `${SITE_URL}${getConfiguratorUrl(product.slug, `/${product.slug}`, 'product-hub')}`,
        price: (product.startingPriceCents / 100).toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@id': ORGANIZATION_ID },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: product.plural, item: canonicalUrl },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        mainEntity: product.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  };
}
