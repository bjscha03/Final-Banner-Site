/**
 * Product Type Switcher
 * 
 * Admin-only toggle for switching between Banner and Yard Sign product types.
 * Only visible when user has admin privileges.
 */
import React from 'react';
import type { ProductTypeSlug } from '@/lib/products';

interface ProductTypeSwitcherProps {
  productType: ProductTypeSlug;
  onProductTypeChange: (type: ProductTypeSlug) => void;
}

const ProductTypeSwitcher: React.FC<ProductTypeSwitcherProps> = ({ productType, onProductTypeChange }) => {
  return (
    <div className="flex items-center justify-center gap-1 bg-gray-100 rounded-xl p-1 mb-6 max-w-xs mx-auto">
      <button
        onClick={() => onProductTypeChange('banner')}
        className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
          productType === 'banner'
            ? 'bg-white text-orange-600 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Banner
      </button>
      <button
        onClick={() => onProductTypeChange('yard_sign')}
        className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
          productType === 'yard_sign'
            ? 'bg-white text-orange-600 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Yard Signs
      </button>
    </div>
  );
};

export default ProductTypeSwitcher;
