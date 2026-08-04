import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductVisual from '@/components/product/ProductVisual';
import type { CityProductSlug } from '@/lib/seo/cityData';

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
    description: 'Made-to-size indoor, outdoor, and mesh banners for promotions, events, and job sites.',
    price: 'From $20',
    details: 'Custom sizes · Four materials',
  },
  {
    slug: 'yard-signs',
    title: 'Yard signs',
    description: 'Full-color 24 × 18 inch corrugated plastic signs with single- or double-sided printing.',
    price: '10 from $120',
    details: 'Optional step stakes',
  },
  {
    slug: 'car-magnets',
    title: 'Car magnets',
    description: 'Removable vehicle graphics in supported sizes with square or rounded corner options.',
    price: 'From $29',
    details: 'Four sizes · Two corner styles',
  },
];

const ProductSelectionStrip: React.FC = () => (
  <section className="brand-section bg-white" aria-labelledby="product-selection-heading">
    <div className="brand-shell">
      <div className="max-w-3xl">
        <p className="brand-eyebrow">Three focused product lines</p>
        <h2 id="product-selection-heading" className="brand-title mt-3">Choose the format that fits the job.</h2>
        <p className="brand-copy mt-4">Each product has its own format, materials, and finishing choices—so you can compare the facts before opening the design tool.</p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {products.map((product) => (
          <article key={product.slug} className="group overflow-hidden border border-slate-200 bg-white transition-colors hover:border-[#0B1F3A]">
            <ProductVisual productSlug={product.slug} className="aspect-[4/3] border-b border-slate-200" />
            <div className="p-6 sm:p-7">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-display text-2xl font-bold text-[#0B1F3A]">{product.title}</h3>
                <p className="whitespace-nowrap font-display text-lg font-bold text-[#A63C00]">{product.price}</p>
              </div>
              <p className="mt-3 min-h-[72px] leading-6 text-slate-600">{product.description}</p>
              <p className="mt-5 border-t border-slate-200 pt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{product.details}</p>
              <div className="mt-5 flex items-center justify-between gap-4">
                <Link to={`/${product.slug}`} className="inline-flex items-center gap-2 font-bold text-[#0B1F3A] underline decoration-[#FF6A00] decoration-2 underline-offset-4 hover:text-[#A63C00]">
                  Product details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default ProductSelectionStrip;
