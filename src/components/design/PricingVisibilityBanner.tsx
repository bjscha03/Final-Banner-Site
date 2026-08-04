import React from 'react';
import { DollarSign } from 'lucide-react';
import { PRICE_PER_SQFT } from '@/lib/pricing';

const PricingVisibilityBanner: React.FC = () => {
  const lowestPrice = PRICE_PER_SQFT['13oz'];
  return (
    <div className="mb-6 border-l-4 border-[#FF6A00] bg-white p-4 shadow-[0_8px_24px_rgba(11,31,58,0.05)] md:p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center bg-[#0B1F3A]">
          <DollarSign className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-[#0B1F3A]">Current base material rates</h3>
          <p className="text-sm text-slate-600">Starting at <span className="text-lg font-bold text-[#D95700]">${lowestPrice.toFixed(2)}/sq ft</span>. Options and quantity update the total.</p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2"><div className="h-2 w-2 bg-[#FF6A00]"></div><span className="text-slate-700">13oz Vinyl: <span className="font-semibold">${PRICE_PER_SQFT['13oz'].toFixed(2)}/sq ft</span></span></div>
          <div className="flex items-center gap-2"><div className="h-2 w-2 bg-[#FF6A00]"></div><span className="text-slate-700">15oz Vinyl: <span className="font-semibold">${PRICE_PER_SQFT['15oz'].toFixed(2)}/sq ft</span></span></div>
          <div className="flex items-center gap-2"><div className="h-2 w-2 bg-[#FF6A00]"></div><span className="text-slate-700">18oz Vinyl: <span className="font-semibold">${PRICE_PER_SQFT['18oz'].toFixed(2)}/sq ft</span></span></div>
        </div>
      </div>
    </div>
  );
};

export default PricingVisibilityBanner;
