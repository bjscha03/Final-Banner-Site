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
    <div className="border-b border-orange-200 bg-[#FFF4EC] text-[#0B1F3A]">
      <div className="px-4 py-2.5 text-center">
        <button
          onClick={handleCopyCode}
          className="group inline-flex items-center gap-2 font-medium transition-colors hover:text-[#D95700]"
          title="Click to copy code"
        >
          <Tag className="h-4 w-4 text-[#FF6A00]" />
          <span className="text-sm font-medium">
            New customers: Save 20% with code{' '}
            <span className="border-b-2 border-[#FF6A00] font-bold">{PROMO_CODE}</span>
            {' '}(first order only)
          </span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          {copied && (
            <span className="border border-orange-200 bg-white px-2 py-0.5 text-xs font-bold text-[#D95700]">Copied</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default PromoBanner;
