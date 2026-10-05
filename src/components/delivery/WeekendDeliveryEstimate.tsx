import React from 'react';
import { Truck } from 'lucide-react';
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
    <div className={`flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-4 ${dark ? 'text-white' : 'text-[#0B1F3A]'}`}>
      <Truck className="mt-1 h-5 w-5 shrink-0 text-[#FF6A00]" aria-hidden="true" />
      <div className={`min-w-0 flex-1 ${editorial ? 'sm:grid sm:grid-cols-3 sm:items-center sm:gap-6' : ''}`}>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${dark ? 'text-orange-200' : 'text-slate-600'}`}>Estimated delivery</p>
          <p className="mt-0.5 text-base font-bold sm:text-lg">{dateLabel(estimate.deliveryDate)}</p>
        </div>
        <p className={`mt-1 text-xs sm:text-sm ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
          Expected to ship {dateLabel(estimate.shipDate)}
        </p>
        <p className={`mt-1 text-xs ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
          Free next-business-day air after production.
        </p>
      </div>
    </div>
  );
}
