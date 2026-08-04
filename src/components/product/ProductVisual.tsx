import React from 'react';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface ProductVisualProps {
  productSlug: CityProductSlug;
  className?: string;
  priority?: boolean;
}

const VINYL_PRODUCT_IMAGE =
  'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1000/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png';
const CAR_MAGNET_PRODUCT_IMAGE =
  'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1000/v1776755781/car_magnet_yinavh.png';

/**
 * A product-led visual used instead of scene-generator imagery. Vinyl and
 * magnet pages use existing supplier/product photography; the yard-sign
 * visual is a deliberately simple product diagram so it never implies a
 * fabricated location, installation, or customer.
 */
const ProductVisual: React.FC<ProductVisualProps> = ({ productSlug, className = '', priority = false }) => {
  if (productSlug === 'yard-signs') {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden bg-[#EDF1F5] ${className}`} role="img" aria-label="Custom 24 by 18 inch yard sign product diagram">
        <div className="absolute inset-x-0 bottom-0 h-[24%] bg-[#D8E0E7]" aria-hidden="true" />
        <div className="relative mb-10 w-[72%] max-w-[430px]">
          <div className="relative z-10 aspect-[4/3] border-[7px] border-white bg-[#0B1F3A] p-[8%] shadow-[0_22px_35px_rgba(11,31,58,0.18)]">
            <div className="h-1.5 w-14 bg-[#FF6A00]" />
            <p className="mt-[10%] font-display text-[clamp(1.2rem,4vw,2.3rem)] font-bold leading-[1.03] tracking-[-0.04em] text-white">
              CUSTOM<br />YARD SIGNS
            </p>
            <p className="mt-[8%] text-[clamp(.55rem,1.4vw,.8rem)] font-bold uppercase tracking-[0.16em] text-slate-300">
              24 × 18 inches · full color
            </p>
          </div>
          <div className="absolute left-[22%] top-[97%] h-28 w-1.5 bg-slate-600" aria-hidden="true" />
          <div className="absolute right-[22%] top-[97%] h-28 w-1.5 bg-slate-600" aria-hidden="true" />
          <div className="absolute left-[22%] right-[22%] top-[118%] h-1.5 bg-slate-600" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const isVinyl = productSlug === 'vinyl-banners';
  return (
    <div className={`flex items-center justify-center overflow-hidden bg-[#F2F4F6] ${className}`}>
      <img
        src={isVinyl ? VINYL_PRODUCT_IMAGE : CAR_MAGNET_PRODUCT_IMAGE}
        alt={isVinyl ? 'Finished custom vinyl banner with reinforced edges and grommets' : 'Finished custom car magnet installed on a vehicle door'}
        width={1000}
        height={750}
        loading={priority ? 'eager' : 'lazy'}
        {...({ fetchpriority: priority ? 'high' : 'auto' } as Record<string, string>)}
        className={`h-full w-full ${isVinyl ? 'object-contain p-5 sm:p-8' : 'object-cover'}`}
      />
    </div>
  );
};

export default ProductVisual;
