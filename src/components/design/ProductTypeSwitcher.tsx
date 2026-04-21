import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ProductTypeSlug } from '@/lib/products';
import { CAR_MAGNET_IMAGE_URL } from '@/lib/car-magnet-pricing';
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
    supportingText: string;
    imageUrl: string;
    overlayClass: string;
    imageAlt: string;
  }> = [
    {
      type: 'banner',
      label: 'Banner',
      supportingText: 'Great for businesses, events, and large displays',
      imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776748080/gemini-watermark-removed_1_t2dpdb.png',
      overlayClass: 'from-slate-900/20 via-slate-900/5 to-amber-900/65',
      imageAlt: 'Banner product option showing a banner display example',
    },
    {
      type: 'yard_sign',
      label: 'Yard Signs',
      supportingText: 'Perfect for lawns, events, and outdoor advertising',
      imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776748102/gemini-watermark-removed_2_n85erj.png',
      overlayClass: 'from-slate-900/20 via-slate-900/5 to-emerald-900/65',
      imageAlt: 'Yard Signs product option showing a yard sign display example',
    },
    {
      type: 'car_magnet',
      label: 'Car Magnets',
      supportingText: 'Durable removable magnets for vehicle signage',
      imageUrl: CAR_MAGNET_IMAGE_URL,
      overlayClass: 'from-slate-900/20 via-slate-900/5 to-indigo-900/65',
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

          const imageClassName = cn(
            'absolute inset-0 h-full w-full object-cover transition duration-500',
            isActive ? 'scale-105 brightness-[1.02]' : 'scale-100 brightness-90 group-hover:scale-105',
          );

          const overlayClassName = cn(
            'absolute inset-0 bg-gradient-to-b',
            option.overlayClass,
            isActive ? 'opacity-95' : 'opacity-90 group-hover:opacity-95',
          );

          return (
            <button
              key={option.type}
              type="button"
              onClick={() => onProductTypeChange(option.type)}
              className={cardClassName}
              aria-pressed={isActive}
            >
              <img
                src={option.imageUrl}
                alt={option.imageAlt}
                className={imageClassName}
              />
              <div className={overlayClassName} />
              <div className="absolute inset-0 bg-black/5" />

              {isActive && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-orange-500/95 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Selected
                </span>
              )}

              <div className="absolute inset-x-4 bottom-4 z-10 text-white sm:inset-x-5 sm:bottom-5">
                <p className="text-2xl font-bold tracking-tight sm:text-[30px]">{option.label}</p>
                <p className="mt-1 max-w-xs text-sm leading-snug text-white/90 sm:text-base">{option.supportingText}</p>
              </div>
            </button>
          );
        })}
        </div>
      </div>
    </>
  );
};

export default ProductTypeSwitcher;
