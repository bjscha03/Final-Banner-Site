import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { ProductTypeSlug } from '@/lib/products';
import type { CityProductSlug } from '@/lib/seo/cityData';
import ProductVisual from '@/components/product/ProductVisual';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface ProductTypeSwitcherProps {
  productType: ProductTypeSlug;
  onProductTypeChange: (type: ProductTypeSlug) => void;
  mobileStickyTopPx?: number;
}

const options: Array<{ type: ProductTypeSlug; slug: CityProductSlug; label: string; subtext: string }> = [
  { type: 'banner', slug: 'vinyl-banners', label: 'Vinyl banners', subtext: 'Custom sizes · Four materials' },
  { type: 'yard_sign', slug: 'yard-signs', label: 'Yard signs', subtext: '24 × 18 inches · Optional stakes' },
  { type: 'car_magnet', slug: 'car-magnets', label: 'Car magnets', subtext: 'Four sizes · Two corner styles' },
];

const ProductTypeSwitcher: React.FC<ProductTypeSwitcherProps> = ({ productType, onProductTypeChange, mobileStickyTopPx = 76 }) => (
  <>
    <div
      className="sticky z-30 -mx-4 mb-7 border-b border-slate-200 bg-white px-4 py-2 md:hidden"
      style={{ top: mobileStickyTopPx }}
      role="tablist"
      aria-label="Select product type"
    >
      <div className="grid grid-cols-3 border border-slate-200">
        {options.map((option, index) => {
          const active = productType === option.type;
          return (
            <button
              key={option.type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onProductTypeChange(option.type)}
              className={cn(
                'relative min-h-12 px-2 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]',
                index > 0 && 'border-l border-slate-200',
                active ? 'bg-[#0B1F3A] text-white' : 'bg-white text-slate-600',
              )}
            >
              {option.label}
              {active && <span className="absolute inset-x-0 bottom-0 h-1 bg-[#FF6A00]" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>

    <div className="mb-10 hidden md:block">
      <div className="mb-6">
        <p className="brand-eyebrow">Step 1</p>
        <h2 className="homepage-condensed mt-2 text-5xl font-black uppercase leading-none text-[#0B1F3A] lg:text-6xl">Choose your product</h2>
        <p className="mt-3 text-base text-slate-500">Pick your product. You can switch anytime.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3" role="tablist" aria-label="Select product type">
        {options.map((option) => {
          const active = productType === option.type;
          return (
            <button
              key={option.type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onProductTypeChange(option.type)}
              className={cn(
                'group relative aspect-[6/5] overflow-hidden bg-[#0B1F3A] text-left text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-4',
              )}
            >
              <ProductVisual
                productSlug={option.slug}
                presentation="selector"
                className="absolute inset-0"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061A31] via-transparent to-transparent" aria-hidden="true" />
              {option.type === 'banner' && <span className="absolute left-4 top-4 bg-[#C94008] px-3 py-2 text-xs font-black uppercase tracking-wide">Most popular</span>}
              {active && <><span className="pointer-events-none absolute inset-0 z-10 border-4 border-[#FF6A00]" aria-hidden="true" /><CheckCircle2 className="absolute right-4 top-4 h-9 w-9 rounded-full bg-[#FF6A00] text-white" aria-label="Selected" /></>}
              <div className="absolute inset-x-0 bottom-0 p-5 lg:p-6">
                <p className="homepage-condensed text-3xl font-black uppercase leading-none lg:text-4xl">{option.label}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-white">{option.subtext}</p>
                {!active && <span className="inline-flex items-center gap-2 border-b border-white/70 pb-1 text-xs font-bold uppercase">Select <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
    <Link to="/double-sided-banners" className="mb-8 flex min-h-12 items-center justify-between gap-3 border border-slate-200 bg-white px-4 py-3 font-semibold text-[#18448D] hover:bg-orange-50">
      <span>Double-Sided Banners <span className="block text-sm font-normal">18 oz vinyl · $6.25 per sq. ft. includes both sides</span></span>
      <ArrowRight className="h-5 w-5 shrink-0" />
    </Link>
  </>
);

export default ProductTypeSwitcher;
