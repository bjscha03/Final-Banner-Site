/**
 * SEO Component for managing meta tags, Open Graph, Twitter Cards, and Schema.org markup
 * Uses react-helmet-async for dynamic meta tag management
 */

import React from 'react';
import { Helmet } from 'react-helmet-async';

export interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  twitterCard?: 'summary' | 'summary_large_image';
  /** Deprecated compatibility input. Meta keywords are intentionally not emitted. */
  keywords?: string[];
  schema?: object | object[]; // JSON-LD schema markup
  noindex?: boolean;
  nofollow?: boolean;
  preloadImage?: string;
  ogImageAlt?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
}

const SEO: React.FC<SEOProps> = ({
  title,
  description,
  canonical,
  ogImage = '/images/og-vinyl-banners.png',
  ogType = 'website',
  twitterCard = 'summary_large_image',
  schema,
  noindex = false,
  nofollow = false,
  preloadImage,
  ogImageAlt = 'Banners On The Fly custom printing',
  ogImageWidth = 1200,
  ogImageHeight = 630,
}) => {
  const siteUrl = 'https://bannersonthefly.com';
  const fullCanonical = canonical || siteUrl;
  const fullOgImage = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;
  const fullPreloadImage = preloadImage
    ? (preloadImage.startsWith('http') ? preloadImage : `${siteUrl}${preloadImage}`)
    : undefined;

  // Construct robots meta tag
  const robotsContent = [];
  if (noindex) robotsContent.push('noindex');
  if (nofollow) robotsContent.push('nofollow');
  const robotsTag = robotsContent.length > 0 ? robotsContent.join(', ') : 'index, follow';

  return (
    <Helmet prioritizeSeoTags>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robotsTag} />
      <link rel="canonical" href={fullCanonical} />
      {fullPreloadImage && <link rel="preload" as="image" href={fullPreloadImage} />}

      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:image" content={fullOgImage} />
      <meta property="og:image:secure_url" content={fullOgImage} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content={String(ogImageWidth)} />
      <meta property="og:image:height" content={String(ogImageHeight)} />
      <meta property="og:image:alt" content={ogImageAlt} />
      <meta property="og:site_name" content="Banners On The Fly" />

      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullOgImage} />
      <meta name="twitter:image:alt" content={ogImageAlt} />

      {/* Schema.org JSON-LD */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(Array.isArray(schema) ? schema : [schema])}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;

/**
 * Helper function to generate Organization schema
 */
export const getOrganizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Banners On The Fly',
  url: 'https://bannersonthefly.com',
  logo: 'https://bannersonthefly.com/images/logo-social.svg',
  description: 'Online custom banner, yard sign, and car magnet printing with nationwide shipping.',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'Customer Service',
    email: 'support@bannersonthefly.com',
  },
  sameAs: ['https://www.linkedin.com/company/banners-on-the-fly/'],
});

/**
 * Helper function to generate BreadcrumbList schema
 */
export const getBreadcrumbSchema = (breadcrumbs: { name: string; url: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: breadcrumbs.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.name,
    item: crumb.url.startsWith('http') ? crumb.url : `https://bannersonthefly.com${crumb.url}`,
  })),
});

/**
 * Helper function to generate Product schema
 */
export const getProductSchema = (product: {
  name: string;
  description: string;
  image: string;
  price?: string;
  priceCurrency?: string;
  availability?: string;
  brand?: string;
  offerUrl?: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: product.name,
  description: product.description,
  image: product.image.startsWith('http') 
    ? product.image 
    : `https://bannersonthefly.com${product.image}`,
  brand: {
    '@type': 'Brand',
    name: product.brand || 'Banners On The Fly',
  },
  ...(product.price && {
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.priceCurrency || 'USD',
      availability: product.availability || 'https://schema.org/InStock',
      url: product.offerUrl || 'https://bannersonthefly.com/design?product=banner',
    },
  }),
});

/**
 * Helper function to generate WebPage schema
 */
export const getWebPageSchema = (page: {
  name: string;
  description: string;
  url: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: page.name,
  description: page.description,
  url: page.url.startsWith('http') ? page.url : `https://bannersonthefly.com${page.url}`,
  publisher: {
    '@type': 'Organization',
    name: 'Banners On The Fly',
    logo: {
      '@type': 'ImageObject',
      url: 'https://bannersonthefly.com/images/logo-social.svg',
    },
  },
});

/**
 * Helper function to generate FAQ schema
 */
export const getFAQSchema = (faqs: { question: string; answer: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
});
