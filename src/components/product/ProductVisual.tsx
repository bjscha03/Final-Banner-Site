import React from 'react';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface ProductVisualProps {
  productSlug: CityProductSlug;
  className?: string;
  priority?: boolean;
  presentation?: 'default' | 'selector';
}

const CAR_MAGNET_PRODUCT_IMAGE =
  'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1200/v1777020742/car_magnets_dwoq8q.png';

interface DiagramProps {
  className: string;
  isSelector: boolean;
}

const selectorStageData = (isSelector: boolean) => (
  isSelector ? { 'data-selector-product-stage': '' } : {}
);

const selectorSubjectData = (isSelector: boolean) => (
  isSelector ? { 'data-selector-product-subject': '' } : {}
);

const selectorFaceData = (isSelector: boolean) => (
  isSelector ? { 'data-selector-product-face': '' } : {}
);

/**
 * A deliberately bounded banner diagram. The printed face, hems, and all four
 * grommets are part of one inset subject, so no source-image crop or card
 * aspect ratio can amputate the product.
 */
const BannerDiagram: React.FC<DiagramProps> = ({ className, isSelector }) => (
  <div
    data-product-visual="vinyl-banners"
    className={`flex min-w-0 items-center justify-center bg-[#E9EEF3] ${className}`}
    role="img"
    aria-label="Finished custom vinyl banner shown fully inside its frame"
  >
    <div
      data-product-visual-stage
      {...selectorStageData(isSelector)}
      className="relative flex aspect-video w-[88%] max-w-[680px] items-center justify-center border border-slate-300/80 bg-white shadow-[0_16px_30px_rgba(11,31,58,0.12)]"
    >
      <div
        data-product-visual-subject="vinyl-banners"
        data-product-visual-face
        {...selectorSubjectData(isSelector)}
        {...selectorFaceData(isSelector)}
        className="relative flex aspect-[2/1] w-[82%] min-w-0 flex-col justify-center overflow-hidden border-[3px] border-white bg-[#0B1F3A] px-[8%] shadow-[0_14px_22px_rgba(11,31,58,0.22)] [container-type:inline-size]"
      >
        <div className="absolute inset-[4%] border border-white/15" aria-hidden="true" />
        <span className="absolute left-[3.5%] top-[7%] aspect-square w-[3.5%] rounded-full border border-slate-400 bg-slate-100" aria-hidden="true" />
        <span className="absolute right-[3.5%] top-[7%] aspect-square w-[3.5%] rounded-full border border-slate-400 bg-slate-100" aria-hidden="true" />
        <span className="absolute bottom-[7%] left-[3.5%] aspect-square w-[3.5%] rounded-full border border-slate-400 bg-slate-100" aria-hidden="true" />
        <span className="absolute bottom-[7%] right-[3.5%] aspect-square w-[3.5%] rounded-full border border-slate-400 bg-slate-100" aria-hidden="true" />
        <span className="absolute inset-y-0 left-0 w-[5%] bg-[#FF6A00]" aria-hidden="true" />
        <p className="max-w-full whitespace-nowrap font-display text-[clamp(.68rem,8.3cqi,1.6rem)] font-bold leading-none tracking-[-0.04em] text-white">VINYL BANNERS</p>
        <p className="mt-[5%] max-w-full whitespace-nowrap text-[clamp(.4rem,3.5cqi,.7rem)] font-bold uppercase leading-none tracking-[0.08em] text-slate-300">Custom size · Full color</p>
      </div>
    </div>
  </div>
);

/**
 * One truthful 24 x 18 yard-sign diagram. Every dimension below is relative
 * to an inset subject box, including the complete stake assembly, which keeps
 * the product intact from compact cards through large hero panels.
 */
const YardSignDiagram: React.FC<DiagramProps> = ({ className, isSelector }) => (
  <div
    data-product-visual="yard-signs"
    className={`flex min-w-0 items-center justify-center bg-[#E9EEF3] ${className}`}
    role="img"
    aria-label="One finished 24 by 18 inch yard sign with its full stake assembly"
  >
    <div
      data-product-visual-stage
      {...selectorStageData(isSelector)}
      className="relative aspect-video w-[88%] max-w-[680px] overflow-hidden border border-slate-300/80 bg-[#EDF1F5] shadow-[0_16px_30px_rgba(11,31,58,0.12)]"
    >
      <div className="absolute inset-x-0 bottom-0 h-[19%] bg-[#D8E0E7]" aria-hidden="true" />
      <div
        data-product-visual-subject="yard-signs"
        {...selectorSubjectData(isSelector)}
        className="absolute inset-x-[17%] bottom-[5%] top-[4%]"
      >
        <div
          data-product-visual-face
          {...selectorFaceData(isSelector)}
          className="absolute left-1/2 top-0 z-10 flex aspect-[4/3] w-[78%] min-w-0 -translate-x-1/2 flex-col overflow-hidden border-[clamp(3px,1.8cqi,7px)] border-white bg-[#0B1F3A] p-[6%] shadow-[0_12px_20px_rgba(11,31,58,0.2)] [container-type:inline-size]"
        >
          <div className="h-[4%] min-h-[2px] w-[22%] flex-none bg-[#FF6A00]" aria-hidden="true" />
          <p className="mt-[7%] max-w-full whitespace-nowrap font-display text-[clamp(.55rem,8.7cqi,1.75rem)] font-bold leading-none tracking-[-0.04em] text-white">YARD SIGN</p>
          <p className="mt-auto max-w-full whitespace-nowrap border-t border-white/20 pt-[4%] text-[clamp(.36rem,3.25cqi,.66rem)] font-bold uppercase leading-none tracking-[0.04em] text-slate-300">24 × 18 · Full color</p>
        </div>
        <span className="absolute bottom-0 left-[36%] top-[60%] w-[1.5%] min-w-[2px] bg-slate-600" aria-hidden="true" />
        <span className="absolute bottom-0 right-[36%] top-[60%] w-[1.5%] min-w-[2px] bg-slate-600" aria-hidden="true" />
        <span className="absolute left-[36%] right-[36%] top-[82%] h-[1.5%] min-h-[2px] bg-slate-600" aria-hidden="true" />
      </div>
    </div>
  </div>
);

/**
 * Product-led visuals shared by storefront cards, product/city heroes, buying
 * guides, and the configurator selector. Banner and yard-sign diagrams are
 * fully bounded; the authentic magnet photograph uses contain rather than a
 * crop so the complete printed magnet stays visible.
 */
const ProductVisual: React.FC<ProductVisualProps> = ({
  productSlug,
  className = '',
  priority = false,
  presentation = 'default',
}) => {
  const isSelector = presentation === 'selector';

  if (productSlug === 'vinyl-banners') {
    return <BannerDiagram className={className} isSelector={isSelector} />;
  }

  if (productSlug === 'yard-signs') {
    return <YardSignDiagram className={className} isSelector={isSelector} />;
  }

  return (
    <div data-product-visual={productSlug} className={`flex min-w-0 items-center justify-center bg-[#EEF2F5] ${className}`}>
      <div
        data-product-visual-stage
        {...selectorStageData(isSelector)}
        className="flex aspect-video w-[88%] max-w-[680px] items-center justify-center border border-slate-300/80 bg-white p-[3%] shadow-[0_16px_30px_rgba(11,31,58,0.12)]"
      >
        <img
          data-product-visual-image={productSlug}
          src={CAR_MAGNET_PRODUCT_IMAGE}
          alt="Finished custom car magnet displayed in full on a vehicle door"
          width={1200}
          height={800}
          loading={priority ? 'eager' : 'lazy'}
          {...({ fetchpriority: priority ? 'high' : 'auto' } as Record<string, string>)}
          className="h-full w-full object-contain object-center"
        />
      </div>
    </div>
  );
};

export default ProductVisual;
