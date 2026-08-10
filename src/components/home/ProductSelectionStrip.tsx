import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductVisual from '@/components/product/ProductVisual';
import type { CityProductSlug } from '@/lib/seo/cityData';
import { trackSelectItem, trackViewItemList, type AnalyticsItem } from '@/lib/analytics';
import { getProductLandingDefinition } from '@/lib/seo/productLandingData';

interface Product {
  slug: CityProductSlug;
  title: string;
  description: string;
  price: string;
  details: string;
}

const products: Product[] = [
  {
    slug: 'vinyl-banners',
    title: 'Vinyl banners',
    description: 'Made-to-size indoor, outdoor, and mesh banners.',
    price: 'From $20',
    details: 'Custom sizes · Four materials',
  },
  {
    slug: 'yard-signs',
    title: 'Yard signs',
    description: 'Includes free next-day air after production',
    price: '10 signs from $120',
    details: 'Optional step stakes',
  },
  {
    slug: 'car-magnets',
    title: 'Car magnets',
    description: 'Includes free next-day air after production',
    price: 'From $29',
    details: 'Four sizes · Two corner styles',
  },
];

const LIST_ID = 'homepage_product_lines';
const LIST_NAME = 'Homepage product lines';
const toAnalyticsItem = (product: Product): AnalyticsItem => ({
  item_id: product.slug,
  item_name: product.title,
  item_category: 'Printing product',
  price: getProductLandingDefinition(product.slug)!.startingPriceCents,
  quantity: 1,
  item_list_id: LIST_ID,
  item_list_name: LIST_NAME,
});

const ProductSelectionStrip: React.FC = () => {
  useEffect(() => {
    trackViewItemList({
      item_list_id: LIST_ID,
      item_list_name: LIST_NAME,
      items: products.map(toAnalyticsItem),
    });
  }, []);

  const trackProductClick = (product: Product) => trackSelectItem({
    item_list_id: LIST_ID,
    item_list_name: LIST_NAME,
    item: toAnalyticsItem(product),
  });

  const [vinyl, ...secondaryProducts] = products;

  return (
    <section
      className="border-t-4 border-[#F45B08] bg-[#061A31] py-14 text-white sm:py-16 lg:py-[68px]"
      aria-labelledby="product-selection-heading"
      style={{ backgroundImage: 'radial-gradient(circle at 14% 18%, rgba(28,78,126,.22), transparent 31%), radial-gradient(circle at 82% 64%, rgba(20,67,111,.18), transparent 38%)' }}
    >
      <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#FF6900] sm:text-sm">Three focused product lines</p>
        <h2 id="product-selection-heading" className="homepage-condensed mt-3 max-w-[760px] [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-[0.9] tracking-[-0.015em] text-white sm:text-6xl lg:text-[5.4rem]">
          Choose the format<br className="hidden sm:block" /> that fits the job.
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
          Compare the formats, materials, and finishing options—then start designing.
        </p>

        <div className="mt-7 grid gap-7 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8">
          <article className="group flex min-h-0 flex-col overflow-hidden border border-[#31506e] bg-[#08223f]">
            <ProductVisual productSlug={vinyl.slug} presentation="card" className="aspect-[16/9] border-b border-[#31506e]" />
            <div className="flex flex-1 flex-col justify-between gap-5 p-6 sm:p-8">
              <div>
                <h3 className="text-2xl font-extrabold text-white sm:text-3xl">{vinyl.title}</h3>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <p className="text-xl font-black text-[#FF6900] sm:text-2xl">{vinyl.price}</p>
                  <p className="text-sm text-slate-300">Includes free next-day air after production</p>
                </div>
                <p className="mt-3 text-base text-slate-200 sm:text-lg">{vinyl.description}</p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#91a8c3] sm:text-sm">{vinyl.details}</p>
                <Link
                  to={`/${vinyl.slug}`}
                  onClick={() => trackProductClick(vinyl)}
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-[#F45B08] px-6 py-3 font-extrabold text-white transition-colors hover:bg-[#ff741f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Product details <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </article>

          <div className="grid gap-7">
            {secondaryProducts.map((product) => (
              <article key={product.slug} className="group grid overflow-hidden border border-[#31506e] bg-[#08223f] sm:grid-cols-[1.12fr_0.88fr]">
                <ProductVisual productSlug={product.slug} presentation="card" className="min-h-[250px] border-b border-[#31506e] sm:min-h-0 sm:border-b-0 sm:border-r" />
                <div className="flex flex-col justify-center p-6 sm:p-7">
                  <h3 className="text-2xl font-extrabold text-white sm:text-3xl">{product.title}</h3>
                  <p className="mt-1 text-lg font-black text-[#FF6900] sm:text-xl">{product.price}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{product.description}</p>
                  <p className="mt-5 border-t-2 border-[#F45B08] pt-4 text-[11px] font-extrabold uppercase tracking-[0.11em] text-[#91a8c3]">{product.details}</p>
                  <Link
                    to={`/${product.slug}`}
                    onClick={() => trackProductClick(product)}
                    className="mt-4 inline-flex w-fit items-center gap-2 border-b-2 border-[#FF6900] pb-1 font-extrabold text-white transition-colors hover:text-[#FF8A3D]"
                  >
                    Product details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductSelectionStrip;
