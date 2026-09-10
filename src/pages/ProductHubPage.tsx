import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';
import ProductBuyingGuide from '@/components/product/ProductBuyingGuide';
import ProductPageHero from '@/components/product/ProductPageHero';
import SEO from '@/components/SEO';
import { getConfiguratorUrl } from '@/lib/configurator';
import type { CityProductSlug } from '@/lib/seo/cityData';
import { buildProductHubSchema } from '@/lib/seo/localPageSchema';
import { formatMoney, getProductLandingDefinition, SITE_URL } from '@/lib/seo/productLandingData';
import { trackViewItem } from '@/lib/analytics';

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
  const seoTitle = productSlug === 'yard-signs'
    ? `${product.plural} | 24×18 Size, Options & Pricing`
    : `${product.plural} | Sizes, Options & Pricing`;
  const description = productSlug === 'vinyl-banners'
    ? `Configure custom vinyl or mesh banners from ${formatMoney(product.startingPriceCents)}. Compare materials, custom sizes, finishing options, artwork guidance, production, and shipping.`
    : productSlug === 'yard-signs'
      ? `Order 10 custom 24×18 yard signs from ${formatMoney(product.startingPriceCents)}. Compare print sides, optional stakes, artwork guidance, production, and shipping.`
      : `Order custom car magnets from ${formatMoney(product.startingPriceCents)}. Compare supported sizes, corner options, artwork guidance, production, shipping, installation, and care.`;

  useEffect(() => {
    trackViewItem({
      id: product.slug,
      name: product.plural,
      category: 'Printing product',
      variant: product.configuratorType,
      price: product.startingPriceCents,
    });
  }, [product.configuratorType, product.plural, product.slug, product.startingPriceCents]);

  return (
    <Layout showFooterBanner={false}>
      <SEO
        title={seoTitle}
        description={description}
        canonical={canonical}
        ogImage={product.socialImage}
        ogImageAlt={product.heroImageAlt}
        ogType="product"
        schema={buildProductHubSchema(product, canonical)}
      />

      <ProductPageHero productSlug={productSlug} ctaUrl={ctaUrl} />

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
