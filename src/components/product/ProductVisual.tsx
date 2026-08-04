import React from 'react';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface ProductVisualProps {
  productSlug: CityProductSlug;
  className?: string;
  priority?: boolean;
  presentation?: 'default' | 'selector' | 'card';
}

interface ProductImageSource {
  src: string;
  alt: string;
  width: number;
  height: number;
  defaultFit: string;
}

interface ProductImageDefinition extends ProductImageSource {
  card?: ProductImageSource;
}

const PRODUCT_IMAGES: Record<CityProductSlug, ProductImageDefinition> = {
  'vinyl-banners': {
    src: '/images/premium-vinyl-banner-installation-v2.webp',
    alt: 'Navy and orange custom vinyl banner mounted on a black railing outside a modern storefront',
    width: 1586,
    height: 992,
    defaultFit: 'object-cover object-center transition-transform duration-500 group-hover:scale-[1.015]',
    card: {
      src: '/images/vinyl-banner-product-card-v2.webp',
      alt: 'Grand opening vinyl banner installed on a storefront railing with its complete edges and mounting hardware visible',
      width: 1586,
      height: 992,
      defaultFit: 'object-cover object-center transition-transform duration-500 group-hover:scale-[1.015]',
    },
  },
  'yard-signs': {
    src: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1400/v1776995816/e27d8b12-34ac-4dc2-ad13-e5882932cbfc_b9urpx.jpg',
    alt: 'One finished 24 by 18 inch yard sign installed in front of a home',
    width: 1400,
    height: 782,
    defaultFit: 'object-cover object-[68%_center]',
  },
  'car-magnets': {
    src: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1400/v1776755781/car_magnet_yinavh.png',
    alt: 'Finished removable car magnet installed cleanly on a vehicle door',
    width: 1400,
    height: 934,
    defaultFit: 'object-cover object-center',
  },
};

/**
 * One photographic product system for storefront cards, product heroes and
 * the configurator. Selector images always use contain so the complete item
 * remains visible; editorial cards can use a deliberate crop where the source
 * photograph needs it.
 */
const ProductVisual: React.FC<ProductVisualProps> = ({
  productSlug,
  className = '',
  priority = false,
  presentation = 'default',
}) => {
  const definition = PRODUCT_IMAGES[productSlug];
  const image = presentation === 'card' && definition.card ? definition.card : definition;
  const isSelector = presentation === 'selector';

  return (
    <div
      data-product-visual={productSlug}
      className={`flex min-w-0 items-center justify-center overflow-hidden bg-[#E9EEF3] ${className}`}
    >
      <div
        data-product-visual-stage
        {...(isSelector ? { 'data-selector-product-stage': '' } : {})}
        className={isSelector
          ? 'flex aspect-video w-[88%] max-w-[680px] items-center justify-center overflow-hidden border border-slate-300/80 bg-white p-[4%] shadow-[0_16px_30px_rgba(11,31,58,0.12)]'
          : 'flex h-full w-full min-w-0 items-center justify-center overflow-hidden'}
      >
        <img
          data-product-visual-image={productSlug}
          data-product-visual-subject={productSlug}
          data-product-visual-face={productSlug}
          {...(isSelector ? {
            'data-selector-product-subject': '',
            'data-selector-product-face': '',
          } : {})}
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading={priority ? 'eager' : 'lazy'}
          {...({ fetchpriority: priority ? 'high' : 'auto' } as Record<string, string>)}
          className={`h-full w-full ${isSelector ? 'object-contain object-center' : image.defaultFit}`}
        />
      </div>
    </div>
  );
};

export default ProductVisual;
