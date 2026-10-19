import React from 'react';
import type { DeliveryEstimate, ETParts } from '@/lib/delivery';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
});

const dateLabel = (date: ETParts) => dateFormatter.format(
  new Date(Date.UTC(date.year, date.month - 1, date.day)),
);

/** Calendar estimates, rather than a clock counting down to an internal reset. */
export default function WeekendDeliveryEstimate({ estimate, dark = false, editorial = false }: {
  estimate: DeliveryEstimate;
  dark?: boolean;
  editorial?: boolean;
}) {
  return (
    <div className={`grid grid-cols-2 gap-4 px-4 py-3 ${dark ? 'text-white' : 'text-[#0B1F3A]'}`}>
      <div><p className="text-[10px] font-bold uppercase tracking-wider">Shipping date</p>
        <p className="mt-1 text-sm font-bold">{dateLabel(estimate.shipDate)}</p></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wider">Delivery date</p>
        <p className="mt-1 text-sm font-bold">{dateLabel(estimate.deliveryDate)}</p></div>
    </div>
  );
}
