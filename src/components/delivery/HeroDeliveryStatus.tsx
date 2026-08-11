import React from 'react';
import { CalendarCheck2, Clock3, Truck } from 'lucide-react';
import { useDeliveryCountdown } from '@/hooks/useDeliveryCountdown';
import { formatCountdown, type ETParts } from '@/lib/delivery';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatHeroDate(parts: ETParts): string {
  return DATE_FORMATTER.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

interface HeroDeliveryStatusProps {
  className?: string;
  variant?: 'compact' | 'editorial';
}

const HeroDeliveryStatus: React.FC<HeroDeliveryStatusProps> = ({ className, variant = 'compact' }) => {
  const { estimate, remainingMs } = useDeliveryCountdown({ isHitSelected: false });
  const countdownLabel = estimate.state === 'weekend_lock'
    ? 'Next production'
    : estimate.state === 'hit_available'
      ? 'Fast-service cutoff'
      : 'Order cutoff';

  if (variant === 'editorial') {
    return (
      <div
        data-hero-delivery-status
        data-state={estimate.state}
        data-variant="editorial"
        className={`border-t-[3px] border-[#F45B08] bg-[#061A31] text-white ${className || ''}`}
        aria-label="Current order cutoff, expected ship date, and expected delivery date"
      >
        <div className="mx-auto grid max-w-[1740px] grid-cols-3 divide-x divide-white/20">
          <div className="min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-7">
            <div className="flex items-center gap-2.5 sm:gap-4 lg:gap-6">
              <Clock3 className="h-7 w-7 flex-none text-[#F26A21] sm:h-9 sm:w-9 lg:h-12 lg:w-12" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-mono text-[8px] font-black uppercase tracking-[0.1em] text-white/85 sm:text-[10px] lg:text-xs">
                  {countdownLabel}
                </p>
                <p
                  className="homepage-condensed mt-1 whitespace-nowrap text-xl font-black tracking-[0.02em] text-white sm:text-2xl lg:text-[2.1rem]"
                  role="timer"
                  aria-live="off"
                >
                  {formatCountdown(remainingMs)}
                </p>
              </div>
            </div>
          </div>
          <div className="min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-7">
            <div className="flex items-center gap-2.5 sm:gap-4 lg:gap-6">
              <Truck className="h-7 w-7 flex-none text-[#F26A21] sm:h-9 sm:w-9 lg:h-12 lg:w-12" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-mono text-[8px] font-black uppercase tracking-[0.1em] text-white/85 sm:text-[10px] lg:text-xs">
                  Expected ship
                </p>
                <p className="homepage-condensed mt-1 truncate text-lg font-black uppercase tracking-[0.02em] text-white sm:text-2xl lg:text-[2.1rem]">
                  {formatHeroDate(estimate.shipDate)}
                </p>
              </div>
            </div>
          </div>
          <div className="min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-7">
            <div className="flex items-center gap-2.5 sm:gap-4 lg:gap-6">
              <CalendarCheck2 className="h-7 w-7 flex-none text-[#F26A21] sm:h-9 sm:w-9 lg:h-12 lg:w-12" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-mono text-[8px] font-black uppercase tracking-[0.1em] text-white/85 sm:text-[10px] lg:text-xs">
                  Delivery
                </p>
                <p className="homepage-condensed mt-1 truncate text-lg font-black uppercase tracking-[0.02em] text-white sm:text-2xl lg:text-[2.1rem]">
                  {formatHeroDate(estimate.deliveryDate)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-hero-delivery-status
      data-state={estimate.state}
      className={`overflow-hidden rounded-md border border-white/20 bg-[#061A31]/95 text-white shadow-[0_12px_32px_rgba(6,26,49,.22)] ${className || ''}`}
      aria-label="Current order cutoff, expected ship date, and expected delivery date"
    >
      <div className="grid grid-cols-3 divide-x divide-white/15">
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 text-[#F45B08]">
            <Clock3 className="h-4 w-4 flex-none" aria-hidden="true" />
            <span className="truncate text-[9px] font-black uppercase tracking-[0.1em] sm:text-[10px]">{countdownLabel}</span>
          </div>
          <p
            className="mt-1 whitespace-nowrap font-mono text-sm font-black tracking-[-0.03em] sm:text-base"
            role="timer"
            aria-live="off"
          >
            {formatCountdown(remainingMs)}
          </p>
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 text-[#F45B08]">
            <Truck className="h-4 w-4 flex-none" aria-hidden="true" />
            <span className="truncate text-[9px] font-black uppercase tracking-[0.1em] sm:text-[10px]">Expected ship</span>
          </div>
          <p className="mt-1 truncate text-xs font-extrabold sm:text-sm">{formatHeroDate(estimate.shipDate)}</p>
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 text-[#F45B08]">
            <CalendarCheck2 className="h-4 w-4 flex-none" aria-hidden="true" />
            <span className="truncate text-[9px] font-black uppercase tracking-[0.1em] sm:text-[10px]">Delivery</span>
          </div>
          <p className="mt-1 truncate text-xs font-extrabold sm:text-sm">{formatHeroDate(estimate.deliveryDate)}</p>
        </div>
      </div>
    </div>
  );
};

export default HeroDeliveryStatus;
