import React from 'react';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface ProductVisualProps {
  productSlug: CityProductSlug;
  className?: string;
  priority?: boolean;
  presentation?: 'default' | 'selector' | 'card' | 'hero';
}

const HERO_IMAGE_ALTS: Record<CityProductSlug, string> = {
  'vinyl-banners': 'FIELDWORK mountain photography vinyl banner with bold white lettering, secured with grommets to a storefront railing',
  'yard-signs': 'Bold orange and charcoal RIDGELINE open house yard sign on a galvanized H stake outside a modern home',
  'car-magnets': 'Orange and charcoal APEX Home Services removable magnet fitted entirely within a white work van door',
};

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
        src={`/images/${presentation === 'hero' ? 'product-heroes' : 'product-editorial'}/${productSlug}${presentation === 'hero' ? '-bold' : ''}-1440.webp`}
        srcSet={`/images/${presentation === 'hero' ? 'product-heroes' : 'product-editorial'}/${productSlug}${presentation === 'hero' ? '-bold' : ''}-640.webp 640w, /images/${presentation === 'hero' ? 'product-heroes' : 'product-editorial'}/${productSlug}${presentation === 'hero' ? '-bold' : ''}-1440.webp 1440w`}
        sizes={presentation === 'selector' || presentation === 'card' ? '(min-width: 768px) 33vw, 100vw' : '(min-width: 1024px) 60vw, 100vw'}
        alt={(presentation === 'hero' ? HERO_IMAGE_ALTS : PRODUCT_IMAGE_ALTS)[productSlug]}
        width={1440}
        height={presentation === 'hero' ? 960 : 1080}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="h-full w-full object-cover object-center"
      />
    </div>
  </div>
);

export default ProductVisual;
