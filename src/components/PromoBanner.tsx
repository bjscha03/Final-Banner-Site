import React from 'react';
import { Package } from 'lucide-react';

interface PromoBannerProps {
  showStandardPromo?: boolean;
}

const LABOR_DAY_NOTICE_START = Date.parse('2026-09-01T04:00:00Z');
const LABOR_DAY_NOTICE_END = Date.parse('2026-09-08T04:00:00Z');

export const isLaborDayShippingNoticeActive = (now = Date.now()): boolean => (
  now >= LABOR_DAY_NOTICE_START && now < LABOR_DAY_NOTICE_END
);

const PromoBanner: React.FC<PromoBannerProps> = ({ showStandardPromo = false }) => {
  if (isLaborDayShippingNoticeActive()) {
    return (
      <aside
        aria-label="Labor Day shipping schedule"
        className="relative z-[60] border-b border-[#D5B800] bg-[#FFDD00] text-[#111111]"
      >
        <div className="mx-auto flex max-w-[1740px] flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-2.5 text-center text-sm leading-snug sm:gap-x-3 sm:px-6 sm:text-base lg:text-lg">
          <strong className="font-black">Labor Day Schedule:</strong>
          <Package className="h-5 w-5 shrink-0 text-[#9A5A00] sm:h-6 sm:w-6" aria-hidden="true" />
          <span>
            Orders placed <strong>September 4–7</strong> will <strong>ship September 8</strong> for <strong>delivery September 9</strong>.
          </span>
        </div>
      </aside>
    );
  }

  if (!showStandardPromo) return null;

  return (
    <div className="relative z-[60] border-b border-[#ff8a37] bg-[#C94008] text-white">
      <p className="px-4 py-2.5 text-center text-xs font-extrabold uppercase tracking-[0.02em] sm:text-sm lg:text-base">
        Free next-day air shipping on orders $20+
      </p>
    </div>
  );
};

export default PromoBanner;
