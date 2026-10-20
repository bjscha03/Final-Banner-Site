import { getDeliveryEstimate } from './engine';
import { etPartsOf } from './timezone';
import { getSpecialtyDeliveryEstimate } from './specialty';

export const CARRIER_DELIVERY_NOTE = 'Delivery dates are estimates, not guarantees. In rare cases, FedEx delays or delivery issues may occur outside our control. Banners On The Fly is not responsible for carrier-caused delays. Please contact us if your shipment needs attention.';

export type OrderDeliveryInput = {
  created_at?: string | Date | null;
  same_day_hit_service?: boolean;
  saturday_delivery?: boolean;
  items?: Array<{ design_service_enabled?: boolean; product_type?: string }>;
};

export type OrderDeliveryDates = {
  shipDate: string | null; deliveryDate: string | null;
  shipLabel: string; deliveryLabel: string;
};
export type OrderDeliveryResult = OrderDeliveryDates & {
  note: string;
  shipments?: Array<OrderDeliveryDates & { label: string }>;
};

/** An order estimate must use its saved placement time, never the viewing/send time. */
export function getOrderDeliveryEstimate(order: OrderDeliveryInput): OrderDeliveryResult {
  const placedAt = order.created_at ? new Date(order.created_at) : null;
  if (!placedAt || !Number.isFinite(placedAt.getTime())) {
    return { shipDate: null, deliveryDate: null, shipLabel: '', deliveryLabel: '', note: 'Delivery estimate unavailable: order time is missing.' };
  }
  const regular = getDeliveryEstimate({
    nowET: etPartsOf(placedAt),
    isHitSelected: order.same_day_hit_service === true,
    isSaturdaySelected: order.saturday_delivery === true,
  });
  const label = (ymd: string) => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${ymd}T12:00:00Z`));
  const hasSpecialty = order.items?.some(item => item.product_type === 'specialty');
  const specialty = hasSpecialty ? getSpecialtyDeliveryEstimate(placedAt) : null;
  const hasRegular = order.items?.some(item => item.product_type !== 'specialty');
  const dates = (estimate: typeof regular | NonNullable<typeof specialty>): OrderDeliveryDates => ({
    shipDate: estimate.shipDate.ymd, deliveryDate: estimate.deliveryDate.ymd,
    shipLabel: label(estimate.shipDate.ymd), deliveryLabel: label(estimate.deliveryDate.ymd),
  });
  const shipments = specialty && hasRegular ? [
    { label: 'Displays & signs', ...dates(specialty) },
    { label: 'Banners, yard signs & car magnets', ...dates(regular) },
  ] : undefined;
  // Existing callers needing a single date receive the final group's date;
  // mixed-order displays render both schedules below.
  const estimate = specialty && (!hasRegular || specialty.deliveryDate.ymd >= regular.deliveryDate.ymd) ? specialty : regular;
  return {
    ...dates(estimate),
    ...(shipments ? { shipments } : {}),
    note: order.items?.some(item => item.design_service_enabled)
      ? 'Based on the order time. Design approval or artwork changes may move this estimate.'
      : shipments ? 'Products follow separate production schedules and may arrive separately.'
      : hasSpecialty ? 'Based on the order time and the 2 p.m. Pacific / 5 p.m. Eastern cutoff, with included FedEx Next-Day Air after production.'
      : 'Based on the order time, production cutoff, and selected delivery service.',
  };
}
