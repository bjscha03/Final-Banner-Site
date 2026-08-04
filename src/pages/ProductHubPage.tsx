import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, PackageCheck, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import ProductBuyingGuide from '@/components/product/ProductBuyingGuide';
import ProductVisual from '@/components/product/ProductVisual';
import SEO from '@/components/SEO';
import { getConfiguratorUrl } from '@/lib/configurator';
import type { CityProductSlug } from '@/lib/seo/cityData';
import { buildProductHubSchema } from '@/lib/seo/localPageSchema';
import { formatMoney, getProductLandingDefinition, SITE_URL } from '@/lib/seo/productLandingData';

interface ProductHubPageProps {
  productSlug: CityProductSlug;
}

const productLinks: Array<{ slug: CityProductSlug; label: string }> = [
  { slug: 'vinyl-banners', label: 'Vinyl banners' },
  { slug: 'yard-signs', label: 'Yard signs' },
  { slug: 'car-magnets', label: 'Car magnets' },
];

const ProductHubPage: React.FC<ProductHubPageProps> = ({ productSlug }) => {
  const product = getProductLandingDefinition(productSlug)!;
  const canonical = `${SITE_URL}/${product.slug}`;
  const ctaUrl = getConfiguratorUrl(productSlug, `/${product.slug}`, 'product-hub');
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
        schema={buildProductHubSchema(product, canonical)}
      />

      <section className="relative overflow-hidden bg-[#0B1F3A] text-white">
        <div className="absolute inset-y-0 right-0 hidden w-[43%] border-l border-white/10 bg-[#102A4C] lg:block" aria-hidden="true" />
        <div className="brand-shell relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF8A3D]">Product specifications & current pricing</p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">Custom {product.plural}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{product.overview}</p>

            <div className="mt-7 flex items-end gap-6 border-l-4 border-[#FF6A00] pl-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Starting price</p>
                <p className="mt-1 font-display text-4xl font-bold text-white">{formatMoney(product.startingPriceCents)}</p>
              </div>
              <p className="max-w-sm pb-1 text-sm leading-6 text-slate-300">{product.minimumOrderLabel}. Your total updates before checkout.</p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={ctaUrl} className="brand-button-primary gap-2 px-7">
                {product.ctaLabel}<ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <a href="#sizes-pricing" className="brand-button-on-dark px-7">See sizes and pricing</a>
            </div>

            <ul className="mt-8 grid gap-3 border-t border-white/15 pt-6 text-sm text-slate-200 sm:grid-cols-3">
              <li className="flex items-center gap-2"><Eye className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Live print preview</li>
              <li className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Current options</li>
              <li className="flex items-center gap-2"><Truck className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Nationwide shipping</li>
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -left-3 top-8 h-[80%] w-1 bg-[#FF6A00]" aria-hidden="true" />
            <ProductVisual productSlug={productSlug} priority className="aspect-[4/3] border border-white/15 bg-white" />
            <div className="border-x border-b border-white/15 bg-white px-5 py-4 text-[#0B1F3A]">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Available online</p>
              <p className="mt-1 font-display text-lg font-bold">{product.minimumOrderLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="border-b border-slate-200 bg-[#F7F7F7]" aria-label="Product guides">
        <div className="brand-shell flex gap-7 overflow-x-auto py-4 text-sm font-bold">
          {productLinks.map((item) => (
            <Link key={item.slug} to={`/${item.slug}`} className={`whitespace-nowrap border-b-2 py-1 ${item.slug === productSlug ? 'border-[#FF6A00] text-[#0B1F3A]' : 'border-transparent text-slate-500 hover:text-[#0B1F3A]'}`}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="brand-shell">
        <ProductBuyingGuide product={product} faqHeading={`${product.singular} buying FAQs`} />

        <section className="mb-16 border-l-4 border-[#FF6A00] bg-[#0B1F3A] p-7 text-white sm:p-10 lg:p-12">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A3D]">Ready when the details are right</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Configure {product.lower} online.</h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-300">Choose a supported configuration, upload artwork, review the on-screen preview, and see the current total before checkout.</p>
            </div>
            <Link to={ctaUrl} className="brand-button-primary flex-none gap-2 px-8">{product.ctaLabel}<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default ProductHubPage;
