import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ProductTypeSlug } from '@/lib/products';
import { cn } from '@/lib/utils';

interface ProductTypeSwitcherProps {
  productType: ProductTypeSlug;
  onProductTypeChange: (type: ProductTypeSlug) => void;
}

const ProductTypeSwitcher: React.FC<ProductTypeSwitcherProps> = ({ productType, onProductTypeChange }) => {
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
  ];

  return (
    <div className="mb-8 rounded-2xl bg-slate-50/70 p-3 sm:p-4 border border-slate-200">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
  );
};

export default ProductTypeSwitcher;
