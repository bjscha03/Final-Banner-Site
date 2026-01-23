import React, { useState } from 'react';
import { Tag, Plane, ChevronRight } from 'lucide-react';

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
    <div className="bg-orange-500 text-white">
      {/* Row 1: Main promo message */}
      <div className="py-2 px-4 text-center border-b border-orange-400/30">
        <button
          onClick={handleCopyCode}
          className="inline-flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer group"
          title="Click to copy code"
        >
          <Tag className="w-4 h-4" />
          <span className="text-sm font-medium">
            New customers: Save 20% with code{' '}
            <span className="underline decoration-2 underline-offset-2 font-bold">{PROMO_CODE}</span>
            {' '}(first order only)
          </span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          {copied && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded animate-pulse">Copied!</span>
          )}
        </button>
      </div>

      {/* Row 2: Feature badges */}
      <div className="py-1.5 px-4 text-center bg-orange-600/50">
        <div className="flex items-center justify-center gap-2 md:gap-6 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <Plane className="w-3.5 h-3.5" />
            FREE NEXT-DAY AIR SHIPPING
          </span>
          <span className="hidden sm:inline text-orange-300">•</span>
          <span className="hidden sm:inline">PROFESSIONAL QUALITY</span>
          <span className="hidden sm:inline text-orange-300">•</span>
          <span className="hidden sm:inline">24-HOUR PRODUCTION</span>
        </div>
      </div>
    </div>
  );
};

export default PromoBanner;
