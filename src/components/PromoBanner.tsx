import React, { useState } from 'react';
import { Tag, Truck, Copy, Check } from 'lucide-react';

const PROMO_CODE = 'NEW20';

const PromoBanner: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 px-4 text-center shadow-lg">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6">
          {/* Main Promo with clickable code */}
          <div className="flex items-center gap-2 text-lg md:text-xl font-bold">
            <Tag className="w-5 h-5 md:w-6 md:h-6" />
            <span>New Customers: 20% OFF with code</span>
            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-all cursor-pointer group"
              title="Click to copy code"
            >
              <span className="font-mono font-bold tracking-wider">{PROMO_CODE}</span>
              {copied ? (
                <Check className="w-4 h-4 text-green-200" />
              ) : (
                <Copy className="w-4 h-4 opacity-70 group-hover:opacity-100" />
              )}
            </button>
            {copied && (
              <span className="text-sm text-green-200 animate-pulse">Copied!</span>
            )}
          </div>

          {/* Separator */}
          <span className="hidden md:inline text-2xl font-light">+</span>

          {/* Free Shipping */}
          <div className="flex items-center gap-2 text-lg md:text-xl font-bold">
            <Truck className="w-5 h-5 md:w-6 md:h-6" />
            <span>FREE NEXT-DAY AIR SHIPPING</span>
          </div>
        </div>

        {/* Subtext */}
        <p className="text-xs md:text-sm mt-2 opacity-90">
          Professional Quality • 24-Hour Production • First Order Only
        </p>
      </div>
    </div>
  );
};

export default PromoBanner;
