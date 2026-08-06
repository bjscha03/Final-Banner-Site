import { getItemDisplayName, type NormalizableOrderItem } from './product-display';
import { attemptPurchaseTracking, type PurchaseTrackingResult } from './purchaseTracking';

export type CanonicalPurchaseOrder = {
  items?: CanonicalPurchaseItem[];
  status?: string | null;
  order_number?: string | null;
  tax_cents?: number | null;
  shipping_cents?: number | null;
  total_cents?: number | null;
  subtotal_cents?: number | null;
  same_day_fee_cents?: number | null;
  saturday_fee_cents?: number | null;
  applied_discount_label?: string | null;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  is_test_order?: boolean | null;
};

export type CanonicalPurchaseItem = NormalizableOrderItem & {
  item_id?: string | null;
};

export const buildPurchaseAnalyticsItems = (orderId: string, items: CanonicalPurchaseItem[]) => items.map((item, index) => {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const lineTotalCents = Number(item.line_total_cents || 0);
  const itemId = String(
    item.id
    || item.item_id
    || item.file_key
    || `${orderId}-item-${index + 1}`
  );

  return {
    item_id: itemId,
    item_name: getItemDisplayName(item),
    item_category: item.product_type || 'Banner',
    item_variant: item.material || item.product_type || 'banner',
    price: Math.round(lineTotalCents / quantity),
    quantity,
  };
});

export const attemptCanonicalPurchaseTracking = (
  orderId: string,
  order: CanonicalPurchaseOrder,
  pageUrl: string,
): Promise<PurchaseTrackingResult> => attemptPurchaseTracking({
  orderId,
  orderNumber: order.order_number,
  status: order.status,
  totalCents: Number(order.total_cents || 0),
  taxCents: Number(order.tax_cents || 0),
  shippingCents: Number(order.shipping_cents || 0),
  items: buildPurchaseAnalyticsItems(orderId, order.items || []),
  coupon: order.applied_discount_label || null,
  pageUrl,
  paypalOrderId: order.paypal_order_id,
  paypalCaptureId: order.paypal_capture_id,
  isTestOrder: order.is_test_order === true,
});
