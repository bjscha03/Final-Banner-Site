import React from 'react';
import { Clock, Truck, Zap } from 'lucide-react';
import { useDeliveryCountdown } from '@/hooks/useDeliveryCountdown';
import { useCartStore } from '@/store/cart';
import {
  formatCountdown,
  formatWeekdayLong,
  getDeliveryEstimate,
  hitOfferLine,
  hitSelectedLine,
  standardLine,
  weekendLockLine,
} from '@/lib/delivery';

export type DeliveryTimerVariant = 'default' | 'compact' | 'slim';

export interface DeliveryTimerProps {
  variant?: DeliveryTimerVariant;
  /**
   * When true, this component subscribes to the cart store's
   * `sameDayHitService` flag so it reflects the current HIT selection.
   * When false (default), it shows the offer line based purely on time.
   */
  reflectCartSelection?: boolean;
  /**
   * Optional className for the outer wrapper (lets host pages match
   * surrounding card styling).
   */
  className?: string;
}

/**
 * Dynamic Delivery Timer — single component for the three states defined
 * in the spec (standard countdown, HIT countdown, weekend lock). Updates
 * every second via `useDeliveryCountdown`.
 *
 * - When `state === 'hit_selected'` we hide the "Free shipping" copy: the
 *   surrounding cart/checkout panels can read `data-hit-selected` from the
 *   wrapper and CSS-hide their own "free shipping" hint, OR consumers can
 *   read the same flag from the cart store directly.
 */
export const DeliveryTimer: React.FC<DeliveryTimerProps> = ({
  variant = 'default',
  reflectCartSelection = false,
  className,
}) => {
  const cartHitSelected = useCartStore((s) => s.sameDayHitService);
  const isHitSelected = reflectCartSelection ? cartHitSelected : false;

  const { estimate, remainingMs } = useDeliveryCountdown({ isHitSelected });
  const isCompact = variant === 'compact';
  const isSlim = variant === 'slim';

  if (isSlim) {
    const isWeekend = estimate.state === 'weekend_lock';
    const isHitActive = estimate.state === 'hit_selected';
    const isHitOffer = estimate.state === 'hit_available';
    const Icon = isWeekend ? Clock : isHitActive || isHitOffer ? Zap : Truck;
    const title = isWeekend
      ? `Expected ${formatWeekdayLong(estimate.deliveryDate)} delivery`
      : isHitActive
      ? `HIT active · expected ${formatWeekdayLong(estimate.deliveryDate)} delivery`
      : isHitOffer
      ? `HIT available · arrive ${formatWeekdayLong(getDeliveryEstimate({ isHitSelected: true }).deliveryDate)}`
      : `Expected ${formatWeekdayLong(estimate.deliveryDate)} delivery`;
    const supportingText = isWeekend
      ? `Ships ${formatWeekdayLong(estimate.shipDate)} · next production window`
      : isHitActive
      ? `Ships ${formatWeekdayLong(estimate.shipDate)} · slot held for`
      : isHitOffer
      ? `Standard arrives ${formatWeekdayLong(estimate.deliveryDate)} · add HIT within`
      : `Ships ${formatWeekdayLong(estimate.shipDate)} · order within`;
    const theme = isWeekend
      ? 'border-orange-200 bg-gradient-to-r from-orange-50 via-white to-blue-50'
      : isHitActive
      ? 'border-amber-200 bg-amber-50'
      : isHitOffer
      ? 'border-emerald-200 bg-emerald-50'
      : 'border-blue-200 bg-blue-50';
    const iconTheme = isWeekend
      ? 'bg-orange-100 text-[#C94E00] ring-orange-200'
      : isHitActive
      ? 'bg-amber-100 text-amber-700 ring-amber-200'
      : isHitOffer
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
      : 'bg-blue-100 text-blue-700 ring-blue-200';
    const countdownTheme = isWeekend
      ? 'text-[#C94E00]'
      : isHitActive
      ? 'text-amber-700'
      : isHitOffer
      ? 'text-emerald-700'
      : 'text-[#18448D]';

    return (
      <div
        className={`rounded-xl border px-3 py-2.5 shadow-sm sm:px-4 ${theme}${className ? ` ${className}` : ''}`}
        data-testid="delivery-timer"
        data-state={estimate.state}
        data-variant="slim"
        data-hit-selected={isHitActive ? 'true' : undefined}
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ring-1 ${iconTheme}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold leading-4 text-[#0B1F3A] sm:text-sm">{title}</p>
            <p className="truncate text-[10px] leading-4 text-slate-600 sm:text-xs">{supportingText}</p>
          </div>
          <p
            className={`whitespace-nowrap font-mono text-base font-black tracking-[0.02em] sm:text-lg ${countdownTheme}`}
            data-testid="delivery-countdown"
            role="timer"
            aria-live="off"
            aria-label={`${formatCountdown(remainingMs)} remaining for ${supportingText.toLowerCase()}`}
          >
            {formatCountdown(remainingMs)}
          </p>
        </div>
      </div>
    );
  }

  const wrapperClass =
    `rounded-xl border ${isCompact ? 'p-3 sm:p-4 text-sm' : 'p-4 sm:p-5'} ` +
    (estimate.state === 'weekend_lock'
      ? 'border-orange-200 bg-gradient-to-br from-white via-orange-50 to-blue-50 text-slate-900 shadow-[0_12px_30px_rgba(11,31,58,0.10)]'
      : estimate.state === 'hit_selected'
      ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-slate-900'
      : estimate.state === 'hit_available'
      ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-slate-900'
      : 'border-blue-200 bg-blue-50 text-slate-900') +
    (className ? ` ${className}` : '');

  // Weekend lock — keep the clock visible and count down to the next
  // production-scheduling window. The engine owns this cutoff calculation.
  if (estimate.state === 'weekend_lock') {
    return (
      <div
        className={wrapperClass}
        data-testid="delivery-timer"
        data-state={estimate.state}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-orange-100 text-[#C94E00] ring-1 ring-orange-200">
            <Clock className={`${isCompact ? 'h-4 w-4' : 'h-5 w-5'}`} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-bold uppercase tracking-[0.12em] text-[#C94E00] ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
              Production &amp; delivery estimate
            </p>
            <h3 className={`mt-0.5 font-display font-bold leading-tight text-[#0B1F3A] ${isCompact ? 'text-base' : 'text-lg'}`}>
              Order now for expected {formatWeekdayLong(estimate.deliveryDate)} delivery
            </h3>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2" aria-label={weekendLockLine(estimate)}>
          <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 shadow-sm">
            <p className={`font-bold uppercase tracking-[0.1em] text-slate-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
              Expected ship
            </p>
            <p className={`mt-0.5 font-display font-bold text-[#0B1F3A] ${isCompact ? 'text-base' : 'text-lg'}`}>
              {formatWeekdayLong(estimate.shipDate)}
            </p>
          </div>
          <div className="rounded-lg border border-orange-200 bg-white/90 px-3 py-2 shadow-sm">
            <p className={`font-bold uppercase tracking-[0.1em] text-slate-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
              Expected delivery
            </p>
            <p className={`mt-0.5 font-display font-bold text-[#C94E00] ${isCompact ? 'text-base' : 'text-lg'}`}>
              {formatWeekdayLong(estimate.deliveryDate)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[#0B1F3A] px-3 py-2.5 text-white shadow-sm">
          <div className="min-w-0">
            <p className={`font-bold uppercase tracking-[0.1em] text-orange-300 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
              Next production window
            </p>
            <p className={`mt-0.5 text-slate-300 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Eastern Time</p>
          </div>
          <p
            className={`shrink-0 font-mono font-black tracking-[0.04em] text-white ${isCompact ? 'text-xl' : 'text-2xl'}`}
            data-testid="delivery-countdown"
            role="timer"
            aria-live="off"
            aria-label={`${formatCountdown(remainingMs)} until production scheduling resumes`}
          >
            {formatCountdown(remainingMs)}
          </p>
        </div>
      </div>
    );
  }

  // HIT actively selected — confirmation + countdown to today's 1:00 PM ET cutoff.
  if (estimate.state === 'hit_selected') {
    return (
      <div
        className={wrapperClass}
        data-testid="delivery-timer"
        data-state={estimate.state}
        data-hit-selected="true"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-full bg-amber-100 p-1.5">
            <Zap className={`${isCompact ? 'h-4 w-4' : 'h-5 w-5'} text-amber-700`} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold ${isCompact ? 'text-sm' : 'text-base'}`}>
              Same-Day Hit Service active
            </h3>
            <p className={`mt-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
              {hitSelectedLine(estimate)}
            </p>
            <p className={`mt-2 font-mono font-bold ${isCompact ? 'text-base' : 'text-lg'} text-amber-700`}>
              {formatCountdown(remainingMs)}
            </p>
            <p className={`text-slate-500 ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
              remaining to hold your slot
            </p>
          </div>
        </div>
      </div>
    );
  }

  // HIT available (not yet selected) — show the upsell line + countdown
  // to today's 1:00 PM ET cutoff. Compute a HIT-selected estimate so the
  // copy reflects the FASTER delivery date the customer would receive.
  if (estimate.state === 'hit_available') {
    const fasterEstimate = getDeliveryEstimate({ isHitSelected: true });
    return (
      <div
        className={wrapperClass}
        data-testid="delivery-timer"
        data-state={estimate.state}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-full bg-emerald-100 p-1.5">
            <Zap className={`${isCompact ? 'h-4 w-4' : 'h-5 w-5'} text-emerald-700`} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold ${isCompact ? 'text-sm' : 'text-base'}`}>
              Add HIT Service for faster delivery
            </h3>
            <p className={`mt-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
              {hitOfferLine(fasterEstimate, remainingMs)}
            </p>
            <p className={`mt-2 font-mono font-bold ${isCompact ? 'text-base' : 'text-lg'} text-emerald-700`}>
              {formatCountdown(remainingMs)}
            </p>
            <p className={`text-slate-500 ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
              Standard option: expected to ship {formatWeekdayLong(estimate.shipDate)} and arrive {formatWeekdayLong(estimate.deliveryDate)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Standard — countdown to today's 22:00 ET cutoff.
  return (
    <div
      className={wrapperClass}
      data-testid="delivery-timer"
      data-state={estimate.state}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-full bg-blue-100 p-1.5">
          <Truck className={`${isCompact ? 'h-4 w-4' : 'h-5 w-5'} text-blue-700`} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold ${isCompact ? 'text-sm' : 'text-base'}`}>
            Expected {formatWeekdayLong(estimate.deliveryDate)} delivery
          </h3>
          <p className={`mt-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
            {standardLine(estimate, remainingMs)}
          </p>
          <p className={`mt-1 leading-tight text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
            Free next-day air is available anywhere in the United States after production. Weekends, holidays, and carrier schedules can affect the arrival day; HIT service orders are accepted until 1:00 PM ET.
          </p>
          <p className={`mt-2 font-mono font-bold ${isCompact ? 'text-base' : 'text-lg'} text-blue-700`}>
            {formatCountdown(remainingMs)}
          </p>
          <p className={`text-slate-500 ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
            remaining until tonight's 10:00 PM ET cutoff
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeliveryTimer;
