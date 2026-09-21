import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductVisual from '@/components/product/ProductVisual';
import type { CityProductSlug } from '@/lib/seo/cityData';
import { trackSelectItem, trackViewItemList, type AnalyticsItem } from '@/lib/analytics';
import { getProductLandingDefinition } from '@/lib/seo/productLandingData';

const products: Array<{ slug: CityProductSlug; title: string; price: string; details: string }> = [
  { slug: 'vinyl-banners', title: 'Vinyl banners', price: 'From $20', details: 'Custom sizes · Four materials' },
  { slug: 'yard-signs', title: 'Yard signs', price: '10 signs from $120', details: '24 × 18 inches · Optional stakes' },
  { slug: 'car-magnets', title: 'Car magnets', price: 'From $29', details: 'Four sizes · Two corner styles' },
];
const LIST_ID = 'homepage_product_lines';
const LIST_NAME = 'Homepage product lines';
const toAnalyticsItem = (product: typeof products[number]): AnalyticsItem => ({
  item_id: product.slug, item_name: product.title, item_category: 'Printing product',
  price: getProductLandingDefinition(product.slug)!.startingPriceCents, quantity: 1,
  item_list_id: LIST_ID, item_list_name: LIST_NAME,
});

const ProductSelectionStrip: React.FC = () => {
  useEffect(() => {
    trackViewItemList({ item_list_id: LIST_ID, item_list_name: LIST_NAME, items: products.map(toAnalyticsItem) });
  }, []);
  return (
    <section className="bg-[#F7F7F7] py-12 text-[#0B1F3A] sm:py-16" aria-labelledby="product-selection-heading">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
        <p className="brand-eyebrow">Made for your next big thing</p>
        <h2 id="product-selection-heading" className="homepage-condensed mt-3 text-5xl font-black uppercase leading-none sm:text-6xl">Choose your product</h2>
        <p className="mt-3 text-base text-slate-600 sm:text-lg">Your message. The right format. Ready to get noticed.</p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {products.map((product) => (
            <Link key={product.slug} to={product.slug === 'vinyl-banners' ? '/design' : `/${product.slug}`}
              onClick={() => trackSelectItem({ item_list_id: LIST_ID, item_list_name: LIST_NAME, item: toAnalyticsItem(product) })}
              className="group relative block aspect-[6/5] overflow-hidden bg-[#061A31] text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-4"
            >
              <ProductVisual productSlug={product.slug} presentation="card" className="absolute inset-0" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061A31] via-transparent to-transparent" aria-hidden="true" />
              {product.slug === 'vinyl-banners' && <span className="absolute left-4 top-4 bg-[#C94008] px-3 py-2 text-xs font-black uppercase tracking-wide">Most popular</span>}
              <div className="absolute inset-x-0 bottom-0 p-5 lg:p-6">
                <h3 className="homepage-condensed [--homepage-mobile-size:2.5rem] text-3xl font-black uppercase leading-none lg:text-4xl">{product.title}</h3>
                <p className="mt-2 text-sm">{product.details}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{product.price}</p>
                  <span className="inline-flex items-center gap-2 border-b border-white/70 pb-1 text-xs font-bold uppercase transition-colors group-hover:text-orange-200">{product.slug === 'vinyl-banners' ? 'Start designing' : 'Product details'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <Link to="/double-sided-banners" className="mt-5 flex min-h-16 flex-wrap items-center justify-between gap-3 border-l-4 border-[#FF6A00] bg-white p-5 text-[#0B1F3A] hover:bg-orange-50">
          <span><strong className="text-lg">Double-Sided Banners</strong><span className="mt-1 block text-sm">18 oz vinyl · Same artwork on both sides · $6.25 per sq. ft.</span></span>
          <span className="inline-flex items-center gap-2 font-semibold">Design yours <ArrowRight className="h-4 w-4" /></span>
        </Link>
        <p className="mt-5 text-sm text-slate-600">Free next-day air after production on orders $20 and up.</p>
      </div>
    </section>
  );
};
export default ProductSelectionStrip;
