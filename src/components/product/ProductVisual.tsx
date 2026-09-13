import React from 'react';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface ProductVisualProps {
  productSlug: CityProductSlug;
  className?: string;
  priority?: boolean;
  presentation?: 'default' | 'selector' | 'card';
}

const PRODUCT_IMAGE_ALTS: Record<CityProductSlug, string> = {
  'vinyl-banners': 'Navy and orange Make It Big vinyl banner mounted on a black storefront railing',
  'yard-signs': 'For Sale yard sign on metal stakes in a landscaped front lawn',
  'car-magnets': 'Landscaping car magnet fitted entirely within one front door of a gray SUV',
};

/** Shared, full-bleed photography for product cards, heroes and selectors. */
const ProductVisual: React.FC<ProductVisualProps> = ({ productSlug, className = '', priority = false, presentation = 'default' }) => (
  <div data-product-visual={productSlug} className={`flex min-w-0 items-center justify-center overflow-hidden bg-[#0B1F3A] ${className}`}>
    <div data-product-visual-stage {...(presentation === 'selector' ? { 'data-selector-product-stage': '' } : {})} className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden">
      <img
        data-product-visual-image={productSlug}
        data-product-visual-subject={productSlug}
        data-product-visual-face={productSlug}
        {...(presentation === 'selector' ? { 'data-selector-product-subject': '', 'data-selector-product-face': '' } : {})}
        src={`/images/product-editorial/${productSlug}-1440.webp`}
        srcSet={`/images/product-editorial/${productSlug}-640.webp 640w, /images/product-editorial/${productSlug}-1440.webp 1440w`}
        sizes={presentation === 'selector' || presentation === 'card' ? '(min-width: 768px) 33vw, 100vw' : '(min-width: 1024px) 60vw, 100vw'}
        alt={PRODUCT_IMAGE_ALTS[productSlug]}
        width={1440}
        height={1080}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="h-full w-full object-cover object-center"
      />
    </div>
  </div>
);

export default ProductVisual;
