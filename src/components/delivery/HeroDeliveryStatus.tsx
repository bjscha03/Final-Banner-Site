import React, { useSyncExternalStore } from 'react';
import WeekendDeliveryEstimate from './WeekendDeliveryEstimate';
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
  variant?: 'compact' | 'editorial' | 'light' | 'arrival';
  condensed?: boolean;
}

const LiveHeroDeliveryStatus: React.FC<HeroDeliveryStatusProps> = ({ className, variant = 'compact', condensed = false }) => {
  const { estimate, remainingMs } = useDeliveryCountdown({ isHitSelected: false });
  const countdownLabel = estimate.state === 'hit_available'
      ? 'Fast-service cutoff'
      : 'Order cutoff';

  if (variant === 'arrival') {
    const dateLabel = (parts: ETParts) => new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
    return (
      <div data-hero-delivery-status data-state={estimate.state} data-variant="arrival" className={`rounded-xl border border-[#e5dfd6] bg-[#f8f6f1] px-3 ${condensed ? 'py-1.5' : 'py-2'} text-[#061A31] ${className || ''}`} aria-label="Estimated delivery and shipping dates">
        <div className={`flex ${condensed ? 'items-center' : 'items-start'} gap-2.5`}>
          <Truck className={condensed ? 'mt-1 h-5 w-5 shrink-0' : 'mt-1 h-6 w-6 shrink-0'} aria-hidden="true" />
          <div className="min-w-0">
            <div className={condensed ? 'flex flex-wrap items-baseline gap-x-2' : undefined}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Estimated delivery</p>
              <p className={`${condensed ? 'whitespace-nowrap text-base' : 'mt-0.5 text-[clamp(1.125rem,5vw,1.25rem)]'} font-extrabold leading-tight`}>{condensed ? formatHeroDate(estimate.deliveryDate) : dateLabel(estimate.deliveryDate)}</p>
            </div>
            {condensed ? <p className="mt-0.5 text-[10px] text-slate-600">Ships {formatHeroDate(estimate.shipDate)} · Free next-business-day air</p> : <>
              <p className="mt-0.5 text-[11px]">Expected to ship {dateLabel(estimate.shipDate)}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">Free next-business-day air after production.</p>
            </>}
          </div>
        </div>
      </div>
    );
  }

  if (estimate.state === 'weekend_lock') {
    return (
      <div
        data-hero-delivery-status data-state={estimate.state} data-variant={variant}
        className={`${variant === 'light'
          ? 'rounded-xl border border-[#e5dfd6] bg-white'
          : 'border-t-[3px] border-[#F45B08] bg-[#061A31]'} ${className || ''}`}
        aria-label="Estimated delivery and shipping dates"
      >
        <WeekendDeliveryEstimate estimate={estimate} dark={variant !== 'light'} editorial={variant === 'editorial'} />
      </div>
    );
  }

  if (variant === 'light') {
    return (
      <div data-hero-delivery-status data-state={estimate.state} data-variant="light" className={`rounded-xl border border-[#e5dfd6] bg-white px-3 py-4 text-[#061A31] shadow-sm sm:px-4 ${className || ''}`} aria-label="Current order cutoff, expected ship date, and expected delivery date">
        <div className="grid grid-cols-3 divide-x divide-[#e5dfd6]">
          <div className="min-w-0 pr-2">
            <div className="flex min-h-7 items-center gap-1.5 text-slate-600">
              <Clock3 className="hidden h-4 w-4 shrink-0 text-[#FF6A00] sm:block" aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase leading-3 tracking-[0.04em] sm:text-[10px]">{countdownLabel}</span>
            </div>
            <p className="mt-1 whitespace-nowrap font-mono text-base font-bold tracking-tight sm:text-xl" role="timer" aria-live="off">{formatCountdown(remainingMs)}</p>
          </div>
          <div className="min-w-0 px-2 sm:px-4">
            <p className="flex min-h-7 items-center text-[9px] font-bold uppercase leading-3 tracking-[0.04em] text-slate-600 sm:text-[10px]">Expected ship</p>
            <p className="mt-1 whitespace-nowrap text-xs font-bold sm:text-base">{formatHeroDate(estimate.shipDate)}</p>
          </div>
          <div className="min-w-0 pl-2 sm:pl-4">
            <p className="flex min-h-7 items-center text-[9px] font-bold uppercase leading-3 tracking-[0.04em] text-slate-600 sm:text-[10px]">Est. delivery</p>
            <p className="mt-1 whitespace-nowrap text-xs font-bold sm:text-base">{formatHeroDate(estimate.deliveryDate)}</p>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="min-w-0 px-2.5 py-3 sm:px-3">
          <div className="flex min-h-7 items-center gap-1.5 text-[#FFAC75]">
            <Clock3 className="hidden h-3.5 w-3.5 flex-none sm:block" aria-hidden="true" />
            <span className="text-[9px] font-bold uppercase leading-3 tracking-[0.04em] sm:text-[10px]">{countdownLabel}</span>
          </div>
          <p
            className="mt-1 whitespace-nowrap font-mono text-sm font-black tracking-[-0.03em] sm:text-base"
            role="timer"
            aria-live="off"
          >
            {formatCountdown(remainingMs)}
          </p>
        </div>
        <div className="min-w-0 px-2.5 py-3 sm:px-3">
          <div className="flex min-h-7 items-center gap-1.5 text-[#FFAC75]">
            <Truck className="hidden h-3.5 w-3.5 flex-none sm:block" aria-hidden="true" />
            <span className="text-[9px] font-bold uppercase leading-3 tracking-[0.04em] sm:text-[10px]">Expected ship</span>
          </div>
          <p className="mt-1 truncate text-xs font-extrabold sm:text-sm">{formatHeroDate(estimate.shipDate)}</p>
        </div>
        <div className="min-w-0 px-2.5 py-3 sm:px-3">
          <div className="flex min-h-7 items-center gap-1.5 text-[#FFAC75]">
            <CalendarCheck2 className="hidden h-3.5 w-3.5 flex-none sm:block" aria-hidden="true" />
            <span className="text-[9px] font-bold uppercase leading-3 tracking-[0.04em] sm:text-[10px]">Delivery</span>
          </div>
          <p className="mt-1 truncate text-xs font-extrabold sm:text-sm">{formatHeroDate(estimate.deliveryDate)}</p>
        </div>
      </div>
    </div>
  );
};

const subscribeToClient = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

const HeroDeliveryStatus: React.FC<HeroDeliveryStatusProps> = (props) => {
  // Build-time HTML can be days old. Hydrate stable shipping copy first, then
  // mount the live clock. Ordinary client navigation renders the clock directly.
  const ready = useSyncExternalStore(subscribeToClient, clientReady, serverReady);
  if (ready) return <LiveHeroDeliveryStatus {...props} />;
  const light = props.variant === 'light' || props.variant === 'arrival';
  return (
    <div data-hero-delivery-status data-state="pending" data-variant={props.variant || 'compact'}
      className={`${props.condensed ? 'min-h-[68px] py-2' : 'min-h-[94px] py-4'} rounded-md border px-3 ${light ? 'border-[#e5dfd6] bg-white text-[#061A31]' : 'border-white/20 bg-[#061A31] text-white'} ${props.className || ''}`}
      aria-label="Production and shipping">
      <p className="text-sm font-bold">24-hour standard production</p>
      <p className="mt-1 text-xs">Free next-day air after production</p>
    </div>
  );
};

export default HeroDeliveryStatus;
