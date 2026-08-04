import React from 'react';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface ProductVisualProps {
  productSlug: CityProductSlug;
  className?: string;
  priority?: boolean;
  presentation?: 'default' | 'selector';
}

const VINYL_PRODUCT_IMAGE =
  'https://res.cloudinary.com/dtrxl120u/image/upload/x_0,y_160,w_1000,h_650,c_crop/f_auto,q_auto,w_1200/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png';
const CAR_MAGNET_PRODUCT_IMAGE =
  'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1200/v1777020742/car_magnets_dwoq8q.png';

/**
 * A product-led visual used instead of scene-generator imagery. Vinyl and
 * magnet pages use existing supplier/product photography; the yard-sign
 * visual is a deliberately simple product diagram so it never implies a
 * fabricated location, installation, or customer.
 */
const ProductVisual: React.FC<ProductVisualProps> = ({
  productSlug,
  className = '',
  priority = false,
  presentation = 'default',
}) => {
  if (productSlug === 'yard-signs') {
    const isSelector = presentation === 'selector';
    return (
      <div className={`relative flex min-w-0 items-center justify-center overflow-hidden bg-[#EDF1F5] ${className}`} role="img" aria-label="One custom 24 by 18 inch yard sign product diagram">
        <div className="absolute inset-x-0 bottom-0 h-[24%] bg-[#D8E0E7]" aria-hidden="true" />
        <div className={isSelector
          ? 'relative w-[50%] max-w-[230px] -translate-y-1'
          : 'relative mb-8 w-[76%] max-w-[430px] sm:mb-10 sm:w-[72%]'}>
          <div className="relative z-10 flex aspect-[4/3] min-w-0 flex-col overflow-hidden border-[5px] border-white bg-[#0B1F3A] p-[7%] shadow-[0_22px_35px_rgba(11,31,58,0.18)] [container-type:inline-size] sm:border-[7px]">
            <div className="h-1 w-10 flex-none bg-[#FF6A00] sm:h-1.5 sm:w-14" />
            <p className="mt-[8%] max-w-full font-display text-[clamp(.82rem,9cqi,2.15rem)] font-bold leading-[1.02] tracking-[-0.045em] text-white">
              <span className="block whitespace-nowrap">CUSTOM</span>
              <span className="block whitespace-nowrap">YARD SIGN</span>
            </p>
            <div className="mt-auto border-t border-white/20 pt-[4%]">
              <p className="max-w-full text-[clamp(.5rem,3.15cqi,.76rem)] font-bold uppercase leading-[1.15] tracking-[0.08em] text-slate-300">
                <span className="block whitespace-nowrap">24 × 18 <span className="text-[#FF8A3D]">· Full color</span></span>
              </p>
            </div>
          </div>
          <div className={`absolute left-[22%] top-[97%] w-1.5 bg-slate-600 ${isSelector ? 'h-8' : 'h-28'}`} aria-hidden="true" />
          <div className={`absolute right-[22%] top-[97%] w-1.5 bg-slate-600 ${isSelector ? 'h-8' : 'h-28'}`} aria-hidden="true" />
          <div className={`absolute left-[22%] right-[22%] h-1.5 bg-slate-600 ${isSelector ? 'top-[116%]' : 'top-[118%]'}`} aria-hidden="true" />
        </div>
      </div>
    );
  }

  const isVinyl = productSlug === 'vinyl-banners';
  return (
    <div data-product-visual={productSlug} className={`flex min-w-0 items-center justify-center bg-[#EEF2F5] ${className}`}>
      <div className="flex aspect-video w-[90%] max-w-[680px] items-center justify-center border border-slate-300/80 bg-white p-2 shadow-[0_16px_30px_rgba(11,31,58,0.12)] sm:p-3">
        <img
          data-product-visual-image={productSlug}
          src={isVinyl ? VINYL_PRODUCT_IMAGE : CAR_MAGNET_PRODUCT_IMAGE}
          alt={isVinyl ? 'Finished custom vinyl banner with reinforced edges and grommets' : 'Finished custom car magnet displayed in full on a vehicle door'}
          width={1200}
          height={isVinyl ? 780 : 800}
          loading={priority ? 'eager' : 'lazy'}
          {...({ fetchpriority: priority ? 'high' : 'auto' } as Record<string, string>)}
          className="h-full w-full object-contain object-center"
        />
      </div>
    </div>
  );
};

export default ProductVisual;
