import React from 'react';
import { DollarSign } from 'lucide-react';
import { PRICE_PER_SQFT } from '@/lib/pricing';

const PricingVisibilityBanner: React.FC = () => {
  const lowestPrice = PRICE_PER_SQFT['13oz'];
  return (
    <div className="bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-200 rounded-lg p-4 md:p-6 mb-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
          <DollarSign className="h-6 w-6 text-[#18448D]" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-gray-900">Transparent Pricing</h3>
          <p className="text-sm text-gray-700">Starting at <span className="font-bold text-[#18448D] text-lg">${lowestPrice.toFixed(2)}/sq ft</span> • No hidden fees</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-blue-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div><span className="text-gray-700">13oz Vinyl: <span className="font-semibold">${PRICE_PER_SQFT['13oz'].toFixed(2)}/sq ft</span></span></div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div><span className="text-gray-700">15oz Vinyl: <span className="font-semibold">${PRICE_PER_SQFT['15oz'].toFixed(2)}/sq ft</span></span></div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div><span className="text-gray-700">18oz Vinyl: <span className="font-semibold">${PRICE_PER_SQFT['18oz'].toFixed(2)}/sq ft</span></span></div>
        </div>
      </div>
    </div>
  );
};

export default PricingVisibilityBanner;
