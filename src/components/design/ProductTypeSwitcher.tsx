import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ProductTypeSlug } from '@/lib/products';
import { cn } from '@/lib/utils';

interface ProductTypeSwitcherProps {
  productType: ProductTypeSlug;
  onProductTypeChange: (type: ProductTypeSlug) => void;
  /**
   * Top offset (in pixels) used when the compact mobile switcher is sticky,
   * so it sits below the page's fixed/sticky header without overlap.
   * Defaults to 64 (Tailwind h-16 header).
   */
  mobileStickyTopPx?: number;
}

const ProductTypeSwitcher: React.FC<ProductTypeSwitcherProps> = ({
  productType,
  onProductTypeChange,
  mobileStickyTopPx = 64,
}) => {
  const options: Array<{
    type: ProductTypeSlug;
    label: string;
    subtext: string;
    imageUrl: string;
    imageAlt: string;
  }> = [
    {
      type: 'banner',
      label: 'Banners',
      subtext: 'Events • Promotions • Business',
      imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777020723/Vinyl_Banners_ycsdpm.png',
      imageAlt: 'Banner product option showing a banner display example',
    },
    {
      type: 'yard_sign',
      label: 'Yard Signs',
      subtext: 'Real Estate • Local • Political',
      imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777020710/Yard_Signs_incb8x.png',
      imageAlt: 'Yard Signs product option showing a yard sign display example',
    },
    {
      type: 'car_magnet',
      label: 'Car Magnets',
      subtext: 'Mobile Advertising • Removable',
      imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777020742/car_magnets_dwoq8q.png',
      imageAlt: 'Car Magnet product option showing a vehicle magnet example',
    },
  ];

  return (
    <>
      {/* Mobile compact sticky pill switcher */}
      <div
        className="md:hidden sticky z-30 -mx-4 mb-6 px-4 py-2 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-slate-200"
        style={{ top: mobileStickyTopPx }}
        role="tablist"
        aria-label="Select product type"
      >
        <div className="flex items-stretch gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {options.map((option) => {
            const isActive = productType === option.type;
            return (
              <button
                key={option.type}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onProductTypeChange(option.type)}
                className={cn(
                  'flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-xs font-semibold transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/80 focus-visible:ring-offset-1',
                  isActive
                    ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-[0_2px_8px_rgba(249,115,22,0.25)]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                )}
              >
                <span
                  className={cn(
                    'relative inline-flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1',
                    isActive ? 'ring-orange-400' : 'ring-slate-200',
                  )}
                >
                  <img
                    src={option.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="whitespace-nowrap">{option.label}</span>
                {isActive && (
                  <CheckCircle2
                    className="h-3.5 w-3.5 flex-none text-orange-500"
                    aria-label="Selected"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop / tablet large card switcher (unchanged) */}
      <div className="hidden md:block mb-8 rounded-2xl bg-slate-50/70 p-3 sm:p-4 border border-slate-200">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {options.map((option) => {
          const isActive = productType === option.type;
          const cardClassName = cn(
            'group relative min-h-[220px] w-full overflow-hidden rounded-2xl text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/80 focus-visible:ring-offset-2',
            isActive
              ? 'scale-[1.01] shadow-[0_14px_30px_rgba(249,115,22,0.30)] ring-2 ring-orange-500'
              : 'shadow-[0_10px_24px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(15,23,42,0.18)]',
          );

          return (
            <button
              key={option.type}
              type="button"
              onClick={() => onProductTypeChange(option.type)}
              className={cardClassName}
              aria-pressed={isActive}
            >
              {/* Product image — fills entire card */}
              <img
                src={option.imageUrl}
                alt={option.imageAlt}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[250ms] ease-in-out group-hover:scale-[1.03]"
              />

              {/* Orange pill label — top-left */}
              <span className="absolute left-3 top-3 z-10 rounded-full bg-[#FF6A00] px-3 py-1 text-xs font-bold text-white shadow-sm">
                {option.label}
              </span>

              {/* Selected badge — top-right */}
              {isActive && (
                <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-orange-600 shadow-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Selected
                </span>
              )}

              {/* Subtle subtext — bottom-left, no background box */}
              <p className="absolute bottom-3 left-3 z-10 text-xs font-medium text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
                {option.subtext}
              </p>
            </button>
          );
        })}
        </div>
      </div>
    </>
  );
};

export default ProductTypeSwitcher;
