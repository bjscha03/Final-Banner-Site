import { useEffect, useState } from 'react';
import DeliveryDateCard from './DeliveryDateCard';
import { Clock3, Truck } from 'lucide-react';
import { formatCountdown } from '@/lib/delivery/messages';
import { getSpecialtyDeliveryEstimate, SPECIALTY_CUTOFF_LABEL, specialtyDateLabel } from '@/lib/delivery/specialty';

/** Only for the displays/signs catalog and specialty cart lines. */
export default function SpecialtyDeliveryStatus({ compact = false, featured = false }: { compact?: boolean; featured?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const estimate = getSpecialtyDeliveryEstimate(now);
  const ship = specialtyDateLabel(estimate.shipDate);
  const delivery = specialtyDateLabel(estimate.deliveryDate);

  if (featured) return <section data-specialty-delivery className="specialty-shipping-featured" aria-label="Displays and signs shipping schedule">
    <div className="specialty-shipping-overview">
      <DeliveryDateCard shipDate={estimate.shipDate} deliveryDate={estimate.deliveryDate} />
      <div className="specialty-shipping-countdown"><span>Order within</span><strong role="timer" aria-live="off" aria-label="Time remaining to order for the shipping date shown">{formatCountdown(estimate.remainingMs)}</strong></div>
    </div>
    <details className="specialty-shipping-details"><summary>Shipping details</summary>
      <p><strong>Free FedEx Next-Day Air · Shipping included in the price.</strong> After production. Cutoff: {specialtyDateLabel(estimate.processingDate)} · {SPECIALTY_CUTOFF_LABEL}.</p>
      <p>Complete your order and artwork approval before {SPECIALTY_CUTOFF_LABEL}, Monday–Friday, for shipment the next business day. After the cutoff, allow one additional business day. Orders after Friday’s cutoff and over the weekend ship Tuesday. Holidays shift these dates to the next business days.</p>
      <p>We are not responsible for carrier delays caused by weather or other circumstances beyond our control.</p>
    </details>
  </section>;

  return <section data-specialty-delivery aria-label="Displays and signs shipping schedule"
    className={`min-w-0 rounded-xl border border-orange-200 bg-orange-50/70 text-[#0B1F3A] ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
    <div className={`flex flex-wrap items-center justify-between gap-4 ${compact ? '' : 'sm:gap-6'}`}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold"><Truck aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-600" />Free FedEx Next-Day Air</p>
        <p className="mt-1 text-xs text-slate-600">Shipping included in the price · After production</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-live="polite" aria-atomic="true">
          <p>Ships <strong>{ship}</strong></p>
          <p>Delivery <strong>{delivery}</strong></p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />Order within</p>
        <p role="timer" aria-live="off" aria-label="Time remaining to order for the shipping date shown" className={`mt-1 font-mono font-bold tabular-nums tracking-wide text-[#c94e00] ${compact ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
          {formatCountdown(estimate.remainingMs)}
        </p>
        <p className="mt-1 text-xs text-slate-600">Cutoff: {specialtyDateLabel(estimate.processingDate)} · {SPECIALTY_CUTOFF_LABEL}</p>
      </div>
    </div>
    {!compact && <p className="mt-4 border-t border-orange-200 pt-3 text-xs leading-5 text-slate-600">Complete your order and artwork approval before {SPECIALTY_CUTOFF_LABEL}, Monday–Friday, for shipment the next business day. After the cutoff, allow one additional business day. Orders after Friday’s cutoff and over the weekend ship Tuesday. Holidays shift these dates to the next business days.</p>}
    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">We are not responsible for carrier delays caused by weather or other circumstances beyond our control.</p>
  </section>;
}
