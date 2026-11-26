import React from 'react';
import { Package, Truck } from 'lucide-react';
import { useThanksgivingSchedule } from '@/hooks/useThanksgivingSchedule';

interface PromoBannerProps {
  showStandardPromo?: boolean;
}

const LABOR_DAY_NOTICE_START = Date.parse('2026-09-01T04:00:00Z');
const LABOR_DAY_NOTICE_END = Date.parse('2026-09-08T04:00:00Z');

export const isLaborDayShippingNoticeActive = (now = Date.now()): boolean => (
  now >= LABOR_DAY_NOTICE_START && now < LABOR_DAY_NOTICE_END
);

const PromoBanner: React.FC<PromoBannerProps> = ({ showStandardPromo = false }) => {
  const thanksgiving = useThanksgivingSchedule();
  if (thanksgiving) {
    return (
      <aside aria-label="Thanksgiving shipping schedule" className="relative z-[60] border-b border-orange-200 bg-orange-50 text-[#061A31]">
        <div className="mx-auto flex max-w-[1740px] flex-col items-center justify-center gap-2 px-4 py-3 text-center sm:flex-row sm:gap-5 sm:px-6 sm:py-4">
          <div className="flex shrink-0 items-center gap-2 text-base font-black sm:text-lg">
            <Truck aria-hidden="true" className="h-6 w-6 text-[#c94e00]" />
            <span>Thanksgiving <span className="text-[#c94e00]">Schedule</span></span>
          </div>
          <div className="max-w-3xl text-sm leading-relaxed sm:text-base">
            <p>Banners, yard signs &amp; car magnets ordered <strong>Wednesday 11/25–Sunday 11/29</strong></p>
            <p>Ship <strong>Monday 11/30</strong> · Expected delivery <strong className="rounded bg-orange-200 px-1.5 py-0.5 text-[#061A31]">Tuesday 12/1</strong></p>
            <p className="mt-1 text-sm text-slate-600">Eastern Time · Artwork must be approved. Displays &amp; signs follow the dates shown at checkout.</p>
          </div>
        </div>
      </aside>
    );
  }
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
    <div className="relative z-[60] border-b border-[#e7e1d8] bg-[#f3f0eb] text-[#061A31]">
      <p className="flex items-center justify-center gap-2 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.02em] sm:text-sm">
        <Truck className="h-5 w-5 shrink-0 text-[#c94e00]" aria-hidden="true" />
        Free next-day air shipping on orders $20+
      </p>
    </div>
  );
};

export default PromoBanner;
