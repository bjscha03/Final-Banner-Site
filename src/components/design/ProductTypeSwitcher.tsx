import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ProductTypeSlug } from '@/lib/products';
import type { CityProductSlug } from '@/lib/seo/cityData';
import ProductVisual from '@/components/product/ProductVisual';
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
      <div className="mb-5 flex items-end justify-between gap-4">
        <div><p className="brand-eyebrow">Step 1</p><h2 className="mt-2 font-display text-2xl font-bold text-[#0B1F3A]">Choose a product</h2></div>
        <p className="text-sm text-slate-500">You can switch without leaving the order builder.</p>
      </div>
      <div className="grid border border-slate-200 md:grid-cols-3" role="tablist" aria-label="Select product type">
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
                'group relative overflow-hidden bg-white text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF6A00]',
                index > 0 && 'border-l border-slate-200',
                active ? 'bg-[#FFF7F1]' : 'hover:bg-[#F7F7F7]',
              )}
            >
              {active && <div className="absolute inset-x-0 top-0 z-10 h-1 bg-[#FF6A00]" aria-hidden="true" />}
              <ProductVisual productSlug={option.slug} className="aspect-[16/9] border-b border-slate-200" />
              <div className="flex items-start justify-between gap-4 p-5">
                <div><p className="font-display text-lg font-bold text-[#0B1F3A]">{option.label}</p><p className="mt-1 text-xs text-slate-500">{option.subtext}</p></div>
                {active && <CheckCircle2 className="h-5 w-5 flex-none text-[#FF6A00]" aria-label="Selected" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </>
);

export default ProductTypeSwitcher;
