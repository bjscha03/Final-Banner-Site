import { Truck } from 'lucide-react';
import { useDeliveryCountdown } from '@/hooks/useDeliveryCountdown';
import { useCartStore } from '@/store/cart';
import type { ETParts } from '@/lib/delivery';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
});
const dateLabel = (date: ETParts) => dateFormatter.format(new Date(Date.UTC(date.year, date.month - 1, date.day)));

/** Uses the same delivery engine and selected services as checkout. */
export default function PriceDeliveryEstimate({ compact = false, variant = 'default' }: { compact?: boolean; variant?: 'default' | 'checkout' }) {
  const isHitSelected = useCartStore(state => state.sameDayHitService);
  const isSaturdaySelected = useCartStore(state => state.saturdayDelivery);
  const { estimate } = useDeliveryCountdown({ isHitSelected, isSaturdaySelected });

  if (variant === 'checkout') {
    const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const label = (date: ETParts) => longDate.format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
    return <div data-price-delivery-estimate className="checkout-delivery">
      <Truck aria-hidden="true" />
      <div><p>Delivery date</p><strong>{label(estimate.deliveryDate)}</strong>
        <p className="checkout-free-shipping"><span>FREE</span> Next-Day Air Shipping</p>
        <p className="checkout-ship-date">Shipping date: {label(estimate.shipDate)}</p>
        <p className="mt-2 text-[10px] font-normal leading-relaxed text-slate-500">We are not responsible for carrier delays caused by weather or other circumstances beyond our control.</p>
      </div>
    </div>;
  }

  return (
    <div data-price-delivery-estimate className={compact
      ? 'mt-1 text-[11px] font-semibold leading-4 text-[#18448D]'
      : 'mt-3 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-[#061A31]'}>
      {!compact && <Truck className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />}
      <div>
        <p className={compact ? '' : 'text-sm font-bold'}>Delivery date: {dateLabel(estimate.deliveryDate)}</p>
        {!compact && <p className="mt-0.5 text-xs text-slate-600">Ships {dateLabel(estimate.shipDate)} · Next-day air</p>}
        <p className="mt-1 text-[10px] font-normal leading-relaxed text-slate-500">We are not responsible for carrier delays caused by weather or other circumstances beyond our control.</p>
      </div>
    </div>
  );
}
