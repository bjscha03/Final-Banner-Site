import React from 'react';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface ProductVisualProps {
  productSlug: CityProductSlug;
  className?: string;
  priority?: boolean;
  presentation?: 'default' | 'selector' | 'card' | 'hero';
}

const HERO_IMAGE_ALTS: Record<CityProductSlug, string> = {
  'vinyl-banners': 'Orange grand opening vinyl banner with grommets beside a blue local business banner',
  'yard-signs': 'Open house, lawn care and graduation signs on metal H stakes in grass',
  'car-magnets': 'Summit Home Services magnet on a white work truck',
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
        src={presentation === 'hero' ? `/images/campaign/${productSlug}-1536.webp` : `/images/product-editorial/${productSlug}-1440.webp`}
        srcSet={presentation === 'hero' ? `/images/campaign/${productSlug}-640.webp 640w, /images/campaign/${productSlug}-1536.webp 1536w` : `/images/product-editorial/${productSlug}-640.webp 640w, /images/product-editorial/${productSlug}-1440.webp 1440w`}
        sizes={presentation === 'selector' || presentation === 'card' ? '(min-width: 768px) 33vw, 100vw' : '(min-width: 1024px) 60vw, 100vw'}
        alt={(presentation === 'hero' ? HERO_IMAGE_ALTS : PRODUCT_IMAGE_ALTS)[productSlug]}
        width={presentation === 'hero' ? 1536 : 1440}
        height={presentation === 'hero' ? 1024 : 1080}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="h-full w-full object-cover object-center"
      />
    </div>
  </div>
);

export default ProductVisual;
