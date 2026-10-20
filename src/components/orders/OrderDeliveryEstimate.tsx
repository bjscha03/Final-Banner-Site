import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { Order } from '@/lib/orders/types';
import { getOrderDeliveryEstimate } from '@/lib/delivery/orderEstimate';
import { etPartsOf } from '@/lib/delivery/timezone';

export default function OrderDeliveryEstimate({ order }: { order: Order }) {
  const estimate = getOrderDeliveryEstimate(order);
  const active = !['delivered', 'fulfilled', 'refunded', 'canceled', 'cancelled'].includes(order.status);
  const pastEstimate = active && estimate.deliveryDate && estimate.deliveryDate < etPartsOf(new Date()).ymd;
  return (
    <div data-order-delivery-estimate className={`min-w-0 rounded-lg border p-3 ${pastEstimate ? 'border-amber-300 bg-amber-50' : 'border-orange-200 bg-orange-50/70'}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />Delivery date</div>
      {estimate.shipments ? estimate.shipments.map(shipment => <div key={shipment.label} className="mt-3">
        <p className="text-xs font-semibold text-slate-700">{shipment.label}</p>
        <p className="mt-1 break-words text-sm font-bold text-slate-900">{shipment.deliveryLabel}</p>
        <p className="mt-1 text-xs text-slate-600">Shipping date: {shipment.shipLabel}</p>
      </div>) : <>
        <div className="mt-1 break-words text-sm font-bold text-slate-900">{estimate.deliveryLabel || 'Date unavailable'}</div>
        {estimate.shipLabel && <div className="mt-1 text-xs text-slate-600">Shipping date: {estimate.shipLabel}</div>}
      </>}
      <div className="mt-1 text-xs leading-relaxed text-slate-600">{pastEstimate ? 'Past the delivery date — check FedEx tracking for the latest status.' : estimate.note}</div>
      <div className="mt-1 text-[11px] text-slate-500">We are not responsible for carrier delays caused by weather or other circumstances beyond our control.</div>
    </div>
  );
}
