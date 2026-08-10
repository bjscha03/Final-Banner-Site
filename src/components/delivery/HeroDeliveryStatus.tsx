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
}

const HeroDeliveryStatus: React.FC<HeroDeliveryStatusProps> = ({ className }) => {
  const { estimate, remainingMs } = useDeliveryCountdown({ isHitSelected: false });
  const countdownLabel = estimate.state === 'weekend_lock'
    ? 'Next production'
    : estimate.state === 'hit_available'
      ? 'Fast-service cutoff'
      : 'Order cutoff';

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
