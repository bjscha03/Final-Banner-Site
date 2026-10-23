import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import SpecialtyCollectionStrip from './SpecialtyCollectionStrip';
import { getConfiguratorUrl } from '@/lib/configurator';
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
    <section className="bof-best-sellers bg-white py-12 text-[#0B1F3A] sm:py-16" aria-labelledby="product-selection-heading">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
        <p className="brand-eyebrow">Made for your next big thing</p>
        <h2 id="product-selection-heading" className="homepage-condensed mt-3 text-5xl font-black uppercase leading-none sm:text-6xl">Best sellers</h2>
        <p className="mt-3 text-base text-slate-600 sm:text-lg">Your message. The right format. Ready to get noticed.</p>
        <div className="bof-product-grid">
          {products.map((product) => (
            <Link key={product.slug} to={getConfiguratorUrl(product.slug)}
              onClick={() => trackSelectItem({ item_list_id: LIST_ID, item_list_name: LIST_NAME, item: toAnalyticsItem(product) })}
              className="bof-product-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-4"
            >
              <div className="bof-product-photo"><img src={`/images/campaign/${product.slug}-640.webp`} alt={product.title} width="640" height="427" loading="lazy" /></div>
              <div className="bof-product-copy">
                <h3>{product.title}</h3>
                <p>{product.details}</p>
                <div className="bof-card-action"><span>{product.price}</span><span className="sr-only">Start designing</span><ArrowRight aria-hidden="true" /></div>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-5 text-sm text-slate-600">Free next-day air after production on orders $20 and up.</p>
        <SpecialtyCollectionStrip/>
      </div>
    </section>
  );
};
export default ProductSelectionStrip;
