import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import { CITIES, getIndexableCityProductPaths } from '@/lib/seo/cityData';
import { getOrganizationNode } from '@/lib/seo/localPageSchema';
import { PRODUCT_LANDING_DATA, SITE_URL } from '@/lib/seo/productLandingData';

const LocationsPage: React.FC = () => {
  const indexablePaths = new Set(getIndexableCityProductPaths().map(({ product, citySlug }) => `${product}/${citySlug}`));
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      getOrganizationNode(),
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/locations#webpage`,
        url: `${SITE_URL}/locations`,
        name: 'Custom Printing Shipping Service Areas',
        description: 'Cities currently included in the Banners On The Fly nationwide shipping service-area registry.',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <Layout showFooterBanner={false}>
      <SEO
        title="Custom Printing Service Areas | Banners On The Fly"
        description="See cities in our shipping service-area registry for vinyl banners, yard signs, and car magnets. These are shipping areas, not claimed storefront locations."
        canonical={`${SITE_URL}/locations`}
        ogImage="/images/og-vinyl-banners.png"
        schema={schema}
      />
      <section className="bg-slate-950 px-4 py-14 text-white sm:py-20">
        <div className="mx-auto max-w-5xl text-center">
          <Truck className="mx-auto h-9 w-9 text-orange-400" aria-hidden="true" />
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">Nationwide shipping service areas</h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-slate-200">We ship custom printed products nationwide. The cities below describe shipping service areas and do not imply a storefront, pickup location, or physical branch.</p>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map((city) => {
            const availableProducts = (Object.keys(PRODUCT_LANDING_DATA) as Array<keyof typeof PRODUCT_LANDING_DATA>)
              .filter((product) => indexablePaths.has(`${product}/${city.slug}`));
            return (
              <article key={city.slug} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <MapPin className="h-6 w-6 text-[#18448D]" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-black text-slate-950">{city.city}, {city.state}</h2>
                <p className="mt-1 text-sm text-slate-500">{city.region} · shipping service area</p>
                {availableProducts.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm">
                    {availableProducts.map((productSlug) => (
                      <li key={productSlug}><Link className="font-semibold text-[#18448D] underline-offset-4 hover:underline" to={`/${productSlug}/${city.slug}`}>{PRODUCT_LANDING_DATA[productSlug].plural}</Link></li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-600">Product-specific local information is being held from search indexing until editorial review is complete.</p>
                )}
              </article>
            );
          })}
        </div>
        <section className="mt-12 rounded-3xl bg-blue-50 p-8">
          <h2 className="text-2xl font-black text-slate-950">Shop by product</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {(Object.keys(PRODUCT_LANDING_DATA) as Array<keyof typeof PRODUCT_LANDING_DATA>).map((slug) => (
              <Link key={slug} to={`/${slug}`} className="rounded-xl bg-white p-4 font-bold text-[#18448D] shadow-sm hover:shadow-md">{PRODUCT_LANDING_DATA[slug].plural}</Link>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default LocationsPage;
