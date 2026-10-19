import React from 'react';
import WeekendDeliveryEstimate from './WeekendDeliveryEstimate';
import { useDeliveryCountdown } from '@/hooks/useDeliveryCountdown';
import { useCartStore } from '@/store/cart';

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

/** Display the selected service's shipping and delivery dates without a countdown. */
export const DeliveryTimer: React.FC<DeliveryTimerProps> = ({ variant = 'default', reflectCartSelection = false, className }) => {
  const cartHitSelected = useCartStore(s => s.sameDayHitService);
  const cartSaturdaySelected = useCartStore(s => s.saturdayDelivery);
  const { estimate } = useDeliveryCountdown({
    isHitSelected: reflectCartSelection && cartHitSelected,
    isSaturdaySelected: reflectCartSelection && cartSaturdaySelected,
  });
  return <div className={`rounded-xl border border-blue-200 bg-blue-50/70 ${className || ''}`}
    data-testid="delivery-timer" data-state={estimate.state} data-variant={variant}
    data-hit-selected={estimate.state === 'hit_selected' ? 'true' : undefined}>
    <WeekendDeliveryEstimate estimate={estimate} />
  </div>;
};
export default DeliveryTimer;
