import { getDeliveryEstimate } from './engine';
import { etPartsOf } from './timezone';

export const CARRIER_DELIVERY_NOTE = 'Delivery dates are estimates, not guarantees. In rare cases, FedEx delays or delivery issues may occur outside our control. Banners On The Fly is not responsible for carrier-caused delays. Please contact us if your shipment needs attention.';

export type OrderDeliveryInput = {
  created_at?: string | Date | null;
  same_day_hit_service?: boolean;
  saturday_delivery?: boolean;
  items?: Array<{ design_service_enabled?: boolean }>;
};

/** An order estimate must use its saved placement time, never the viewing/send time. */
export function getOrderDeliveryEstimate(order: OrderDeliveryInput) {
  const placedAt = order.created_at ? new Date(order.created_at) : null;
  if (!placedAt || !Number.isFinite(placedAt.getTime())) {
    return { shipDate: null, deliveryDate: null, shipLabel: '', deliveryLabel: '', note: 'Delivery estimate unavailable: order time is missing.' };
  }
  const estimate = getDeliveryEstimate({
    nowET: etPartsOf(placedAt),
    isHitSelected: order.same_day_hit_service === true,
    isSaturdaySelected: order.saturday_delivery === true,
  });
  const label = (ymd: string) => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${ymd}T12:00:00Z`));
  return {
    shipDate: estimate.shipDate.ymd,
    deliveryDate: estimate.deliveryDate.ymd,
    shipLabel: label(estimate.shipDate.ymd),
    deliveryLabel: label(estimate.deliveryDate.ymd),
    note: order.items?.some(item => item.design_service_enabled)
      ? 'Based on the order time. Design approval or artwork changes may move this estimate.'
      : 'Based on the order time, production cutoff, and selected delivery service.',
  };
}
