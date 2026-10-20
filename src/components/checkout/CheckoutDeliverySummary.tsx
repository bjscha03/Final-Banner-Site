import { useEffect, useState } from 'react';
import { Package, Truck } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useDeliveryCountdown } from '@/hooks/useDeliveryCountdown';
import { getSpecialtyDeliveryEstimate, SPECIALTY_CUTOFF_LABEL, specialtyDateLabel } from '@/lib/delivery/specialty';
import { formatCountdown } from '@/lib/delivery/messages';
import type { ETParts } from '@/lib/delivery';

function Dates({ ship, delivery, label }: { ship: ETParts; delivery: ETParts; label?: string }) {
  return <div className="checkout-shipment" aria-label={label || 'Shipping and delivery dates'}>
    {label && <h3>{label}</h3>}
    <div className="checkout-shipment-dates">
      <div><Package aria-hidden="true" /><div><span>Shipping date</span><strong>{specialtyDateLabel(ship)}</strong></div></div>
      <div><Truck aria-hidden="true" /><div><span>Delivery date</span><strong>{specialtyDateLabel(delivery)}</strong></div></div>
    </div>
  </div>;
}

/** Presentation only. Both product families retain their canonical date engines. */
export default function CheckoutDeliverySummary({ shippingPending = false }: { shippingPending?: boolean }) {
  const { items, sameDayHitService, saturdayDelivery } = useCartStore();
  const { estimate } = useDeliveryCountdown({ isHitSelected: sameDayHitService, isSaturdaySelected: saturdayDelivery });
  const hasSpecialty = items.some(item => item.product_type === 'specialty');
  const hasRegular = items.some(item => item.product_type !== 'specialty');
  const mixed = hasSpecialty && hasRegular;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!hasSpecialty) return;
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [hasSpecialty]);
  const specialty = getSpecialtyDeliveryEstimate(now);
  return <section className="checkout-shipping-summary" aria-label="Shipping schedule">
    <div className="checkout-shipping-card">
      {hasRegular && <Dates ship={estimate.shipDate} delivery={estimate.deliveryDate} label={mixed ? 'Banners, yard signs & car magnets' : undefined} />}
      {hasSpecialty && <Dates ship={specialty.shipDate} delivery={specialty.deliveryDate} label={mixed ? 'Displays & signs' : undefined} />}
      <p className="checkout-shipping-benefit">{shippingPending ? 'Shipping price pending confirmation' : <><span>FREE</span> Next-Day Air shipping</>}</p>
    </div>
    {hasSpecialty && <p className="checkout-shipping-timer">{mixed ? 'Displays & signs: order within ' : 'Order within '}<strong role="timer" aria-live="off">{formatCountdown(specialty.remainingMs)}</strong></p>}
    {mixed && <p className="checkout-split-shipment-note">Your products may arrive separately.</p>}
    <details className="checkout-shipping-details">
      <summary>Shipping details &amp; carrier-delay policy</summary>
      {hasSpecialty && <p><strong>Displays &amp; signs:</strong> Shipping is included in the price via FedEx Next-Day Air after production. Complete your order and artwork approval before {SPECIALTY_CUTOFF_LABEL}, Monday–Friday, for shipment the next business day. After the cutoff, allow one additional business day. Orders after Friday’s cutoff and over the weekend ship Tuesday. Holidays shift these dates to the next business days.</p>}
      {hasRegular && <p><strong>Banners, yard signs &amp; car magnets:</strong> The dates shown reflect your selected production and delivery services. Next-Day Air transit begins after production.</p>}
      <p>We are not responsible for carrier delays caused by weather or other circumstances beyond our control.</p>
    </details>
  </section>;
}
