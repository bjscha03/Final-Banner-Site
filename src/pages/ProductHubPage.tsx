import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, PackageCheck, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import ProductBuyingGuide from '@/components/product/ProductBuyingGuide';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { getConfiguratorUrl } from '@/lib/configurator';
import { getIndexableCityProductPaths, type CityProductSlug, getCityBySlug } from '@/lib/seo/cityData';
import { buildProductHubSchema } from '@/lib/seo/localPageSchema';
import { formatMoney, getProductLandingDefinition, SITE_URL } from '@/lib/seo/productLandingData';

interface ProductHubPageProps {
  productSlug: CityProductSlug;
}

const ProductHubPage: React.FC<ProductHubPageProps> = ({ productSlug }) => {
  const product = getProductLandingDefinition(productSlug)!;
  const canonical = `${SITE_URL}/${product.slug}`;
  const ctaUrl = getConfiguratorUrl(productSlug, `/${product.slug}`, 'product-hub');
  const serviceCities = getIndexableCityProductPaths()
    .filter((path) => path.product === productSlug)
    .map((path) => getCityBySlug(path.citySlug))
    .filter(Boolean);
  const description = productSlug === 'vinyl-banners'
    ? `Configure custom vinyl or mesh banners from ${formatMoney(product.startingPriceCents)}. Compare materials, custom sizes, finishing options, artwork guidance, production, and shipping.`
    : productSlug === 'yard-signs'
      ? `Order 10 custom 24×18 yard signs from ${formatMoney(product.startingPriceCents)}. Compare print sides, optional stakes, artwork guidance, production, and shipping.`
      : `Order custom car magnets from ${formatMoney(product.startingPriceCents)}. Compare supported sizes, corner options, artwork guidance, production, shipping, installation, and care.`;

  return (
    <Layout showFooterBanner={false}>
      <SEO
        title={`${product.plural} | Sizes, Options & Pricing`}
        description={description}
        canonical={canonical}
        ogImage={product.socialImage}
        ogImageAlt={product.heroImageAlt}
        ogType="product"
        preloadImage={product.heroImage}
        schema={buildProductHubSchema(product, canonical)}
      />

      <section className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-[#12366d] to-[#18448D] text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-300">Current product guide</p>
            <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">Custom {product.plural}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100 sm:text-lg">{product.overview}</p>
            <div className="mt-6 flex flex-wrap items-end gap-5">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">Starting price</p><p className="mt-1 text-4xl font-black">{formatMoney(product.startingPriceCents)}</p></div>
              <p className="max-w-sm text-sm leading-6 text-blue-100">{product.minimumOrderLabel}. Price updates before checkout.</p>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 bg-orange-700 px-7 font-bold text-white hover:bg-orange-800">
                <Link to={ctaUrl}>{product.ctaLabel}<ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Link>
              </Button>
              <a href="#sizes-pricing" className="inline-flex min-h-12 items-center justify-center rounded-md border-2 border-white px-7 font-bold text-white hover:bg-white hover:text-[#18448D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">See sizes and pricing</a>
            </div>
            <ul className="mt-7 grid gap-3 text-sm text-blue-50 sm:grid-cols-3">
              <li className="flex items-center gap-2"><Eye className="h-5 w-5" aria-hidden="true" />Live preview</li>
              <li className="flex items-center gap-2"><PackageCheck className="h-5 w-5" aria-hidden="true" />Current product options</li>
              <li className="flex items-center gap-2"><Truck className="h-5 w-5" aria-hidden="true" />Nationwide shipping</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl">
            <img src={product.heroImage} alt={product.heroImageAlt} width={900} height={675} loading="eager" className="aspect-[4/3] h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ProductBuyingGuide product={product} faqHeading={`${product.singular} buying FAQs`} />

        <section className="my-12 rounded-3xl border border-slate-200 bg-slate-50 p-7 sm:p-10" aria-labelledby="service-areas-heading">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-700">Shipping service areas</p>
              <h2 id="service-areas-heading" className="mt-2 text-3xl font-black text-slate-950">Where we ship {product.lower}</h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600">Banners On The Fly ships nationwide. City pages enter the search index only after their local information and evidence complete editorial review.</p>
            </div>
            <Button asChild variant="outline" className="min-h-11 border-2 border-[#18448D] font-bold text-[#18448D]">
              <Link to="/locations">View service areas</Link>
            </Button>
          </div>
          {serviceCities.length > 0 && (
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {serviceCities.map((city) => city && (
                <Link key={city.slug} to={`/${product.slug}/${city.slug}`} className="rounded-xl bg-white p-4 font-semibold text-slate-700 shadow-sm hover:text-[#18448D]">
                  {city.city}, {city.state}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mb-16 rounded-3xl bg-[#18448D] p-8 text-center text-white sm:p-12">
          <h2 className="text-3xl font-black sm:text-4xl">Configure {product.lower} online</h2>
          <p className="mx-auto mt-3 max-w-2xl text-blue-100">Choose a supported configuration, upload artwork, review the on-screen preview, and see the current total before checkout.</p>
          <Button asChild size="lg" className="mt-7 min-h-12 bg-orange-700 px-8 font-bold text-white hover:bg-orange-800">
            <Link to={ctaUrl}>{product.ctaLabel}<ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Link>
          </Button>
        </section>
      </div>
    </Layout>
  );
};

export default ProductHubPage;
