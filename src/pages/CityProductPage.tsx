/**
 * CityProductPage
 *
 * Reusable, programmatic SEO landing page template for the
 * /vinyl-banners/:citySlug, /yard-signs/:citySlug and /car-magnets/:citySlug
 * routes. All copy is generated from `src/lib/seo/cityData.ts` so adding new
 * cities never requires touching this component.
 */

import React from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import SEO, {
  getBreadcrumbSchema,
  getProductSchema,
  getOrganizationSchema,
  getFAQSchema,
} from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Clock, MapPin, ShieldCheck, Truck } from 'lucide-react';
import {
  buildCityProductPageContent,
  getCityBySlug,
  getProduct,
  type CityProductSlug,
} from '@/lib/seo/cityData';

interface CityProductPageProps {
  /** Forces a specific product slug regardless of the URL. Used by the
   *  three top-level routes so that the product type is never ambiguous. */
  productSlug: CityProductSlug;
}

/** LocalBusiness schema scoped to the city we serve.
 *  We frame the entity as a service area provider — never as "located in"
 *  the city — to honor the messaging requirement. */
function getLocalBusinessSchema(args: {
  city: string;
  state: string;
  stateName: string;
  productPlural: string;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: `Banners On The Fly — ${args.productPlural} in ${args.city}, ${args.state}`,
    description: `We serve customers in ${args.city}, ${args.stateName} with custom ${args.productPlural.toLowerCase()} printed within 24 hours and shipped free via next-day air.`,
    url: args.url,
    image: 'https://bannersonthefly.com/images/logo-social.svg',
    priceRange: '$',
    areaServed: {
      '@type': 'City',
      name: `${args.city}, ${args.state}`,
    },
    serviceArea: {
      '@type': 'City',
      name: `${args.city}, ${args.state}`,
    },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US',
    },
  };
}

const CityProductPage: React.FC<CityProductPageProps> = ({ productSlug }) => {
  const { citySlug } = useParams<{ citySlug: string }>();
  const product = getProduct(productSlug);
  const city = getCityBySlug(citySlug);

  if (!product || !city) {
    return <Navigate to="/" replace />;
  }

  const content = buildCityProductPageContent(productSlug, city);

  const schemas = [
    getOrganizationSchema(),
    getBreadcrumbSchema(content.breadcrumbs),
    getLocalBusinessSchema({
      city: city.city,
      state: city.state,
      stateName: city.stateName,
      productPlural: product.plural,
      url: content.canonicalUrl,
    }),
    getProductSchema({
      name: `${product.plural} in ${city.city}, ${city.state}`,
      description: content.metaDescription,
      image: content.schemaImage,
      price: content.startingPrice,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    }),
    getFAQSchema(content.faqs),
  ];

  return (
    <Layout>
      <SEO
        title={content.metaTitle}
        description={content.metaDescription}
        canonical={content.canonicalUrl}
        ogType="product"
        keywords={content.keywords}
        schema={schemas}
      />

      <div className="bg-white">
        <PageHeader title={content.h1} subtitle={content.heroSubtitle} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <Breadcrumbs items={content.breadcrumbs} />

          {/* Service-area badge — reinforces "serve" framing, not "located" */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-blue-50 text-[#18448D] text-sm font-semibold">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            We serve customers in {city.city}, {city.state}
          </div>

          {/* Intro paragraph (unique per city) */}
          <p className="text-lg sm:text-xl text-gray-700 leading-relaxed max-w-4xl mb-8">
            {content.introParagraph}
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-wrap gap-3 mb-12">
            <Link to="/design">
              <Button
                size="lg"
                className="bg-[#ff6b35] hover:bg-[#f7931e] text-white font-bold px-6 py-5 rounded-lg shadow-lg hover:shadow-xl transition-all"
              >
                Start Designing
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/design">
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-[#18448D] text-[#18448D] hover:bg-[#18448D] hover:text-white font-bold px-6 py-5 rounded-lg transition-all"
              >
                Order Now
              </Button>
            </Link>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-12">
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <Clock className="h-8 w-8 text-[#18448D] flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="font-bold text-gray-900">Printed within 24 hours</div>
                <div className="text-sm text-gray-600">Fast in-house production</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <Truck className="h-8 w-8 text-[#18448D] flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="font-bold text-gray-900">Free next-day air</div>
                <div className="text-sm text-gray-600">Shipped to {city.city}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <ShieldCheck className="h-8 w-8 text-[#18448D] flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="font-bold text-gray-900">Free design proof</div>
                <div className="text-sm text-gray-600">Approve before we print</div>
              </div>
            </div>
          </div>

          {/* Benefits + Use Cases */}
          <div className="grid md:grid-cols-2 gap-12 mb-12">
            <section>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
                {content.benefitsHeading}
              </h2>
              <ul className="space-y-3">
                {content.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-1" aria-hidden="true" />
                    <span className="text-gray-700">{b}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
                {content.useCasesHeading}
              </h2>
              <ul className="space-y-3">
                {content.useCases.map((u, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-[#18448D] flex-shrink-0 mt-1" aria-hidden="true" />
                    <span className="text-gray-700">{u}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Internal Links */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
              Get Started in {city.city}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {content.internalLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="group block p-5 bg-white border-2 border-gray-200 rounded-lg hover:border-[#18448D] hover:shadow-md transition-all"
                >
                  <div className="font-bold text-gray-900 group-hover:text-[#18448D] mb-1">
                    {l.label}
                  </div>
                  <div className="text-sm text-gray-600">{l.description}</div>
                  <div className="mt-3 text-sm font-semibold text-[#18448D] group-hover:text-[#ff6b35] transition-colors inline-flex items-center">
                    Learn more
                    <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Sibling product cross-links for the same city */}
          {content.siblingProductLinks.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
                Other Products We Ship to {city.city}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {content.siblingProductLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="group flex items-center justify-between p-5 bg-gray-50 border-2 border-gray-200 rounded-lg hover:border-[#18448D] hover:bg-white transition-all"
                  >
                    <span className="font-semibold text-gray-900 group-hover:text-[#18448D]">
                      {l.label}
                    </span>
                    <ArrowRight className="h-5 w-5 text-[#18448D] group-hover:translate-x-1 transition-transform" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* FAQ */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
              {city.city} {product.singular} FAQs
            </h2>
            <div className="space-y-4">
              {content.faqs.map((f, i) => (
                <details
                  key={i}
                  className="group p-5 bg-gray-50 rounded-lg border border-gray-200 open:bg-white open:border-[#18448D] transition-colors"
                >
                  <summary className="cursor-pointer font-semibold text-gray-900 flex items-start justify-between gap-3">
                    <span>{f.question}</span>
                    <span
                      className="text-[#18448D] text-xl leading-none flex-shrink-0 group-open:rotate-45 transition-transform"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-gray-700 leading-relaxed">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Final CTA */}
          <div className="bg-gradient-to-r from-[#18448D] to-[#1a5bb8] rounded-2xl p-8 sm:p-12 text-center text-white">
            <h2 className="text-3xl sm:text-4xl font-black mb-3">
              Ready to order {product.lower} for {city.city}?
            </h2>
            <p className="text-base sm:text-lg mb-8 text-blue-100 max-w-2xl mx-auto">
              Printed within 24 hours and shipped free via next-day air. Design online in minutes
              and approve a free proof before anything goes to print.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/design">
                <Button
                  size="lg"
                  className="bg-[#ff6b35] hover:bg-[#f7931e] text-white font-bold px-8 py-6 text-lg rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  Start Designing
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/design">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-white/10 border-2 border-white text-white hover:bg-white hover:text-[#18448D] font-bold px-8 py-6 text-lg rounded-lg transition-all"
                >
                  Order Now
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CityProductPage;
