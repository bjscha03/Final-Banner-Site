import React, { useState } from 'react';
import { Tag, ChevronRight } from 'lucide-react';

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
      {/* Single row: Main promo message */}
      <div className="py-2 px-4 text-center">
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
    </div>
  );
};

export default PromoBanner;
