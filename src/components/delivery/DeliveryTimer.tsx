import React from 'react';
import { Clock, Truck, Zap } from 'lucide-react';
import { useDeliveryCountdown } from '@/hooks/useDeliveryCountdown';
import { useCartStore } from '@/store/cart';
import {
  formatCountdown,
  formatWeekdayLong,
  hitOfferLine,
  hitSelectedLine,
  standardLine,
  weekendLockLine,
} from '@/lib/delivery';

export type DeliveryTimerVariant = 'default' | 'compact';

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

  const wrapperClass =
    `rounded-xl border ${isCompact ? 'p-3 sm:p-4 text-sm' : 'p-4 sm:p-5'} ` +
    (estimate.state === 'weekend_lock'
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : estimate.state === 'hit_selected'
      ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-slate-900'
      : estimate.state === 'hit_available'
      ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-slate-900'
      : 'border-blue-200 bg-blue-50 text-slate-900') +
    (className ? ` ${className}` : '');

  // Weekend lock — no countdown.
  if (estimate.state === 'weekend_lock') {
    return (
      <div
        className={wrapperClass}
        data-testid="delivery-timer"
        data-state={estimate.state}
      >
        <div className="flex items-start gap-3">
          <Clock className={`${isCompact ? 'h-4 w-4' : 'h-5 w-5'} text-slate-500 mt-0.5 flex-shrink-0`} aria-hidden="true" />
          <div>
            <h3 className={`font-semibold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>
              Production resumes Monday
            </h3>
            <p className={`mt-1 ${isCompact ? 'text-xs text-slate-600' : 'text-sm text-slate-600'}`}>
              {weekendLockLine(estimate)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // HIT actively selected — confirmation + countdown to today's noon ET cutoff.
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
  // to today's noon ET cutoff.
  if (estimate.state === 'hit_available') {
    // Compute the HIT-selected variant of the estimate so we can show the
    // FASTER delivery date in the copy without flipping the surrounding UI.
    const fasterEstimate = { ...estimate, deliveryDate: estimate.deliveryDate };
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
              Standard option: ship {formatWeekdayLong(estimate.shipDate)}, deliver {formatWeekdayLong(estimate.deliveryDate)}
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
            Order today for {formatWeekdayLong(estimate.deliveryDate)} delivery
          </h3>
          <p className={`mt-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
            {standardLine(estimate, remainingMs)}
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
