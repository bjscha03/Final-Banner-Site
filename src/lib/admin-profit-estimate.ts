import type { Order, OrderItem } from './orders/types';
import { normalizeSizeKey, resolveFixedProductCost } from './admin-product-costs';

export const ADMIN_PROFIT_SHIPPING_COST_PER_LINE_ITEM_CENTS = 1000;

export const estimateSupplierShippingCostCents = (order: Pick<Order, 'items'>): number => {
  // Supplier shipping is billed once per distinct order row/line item, not per unit quantity.
  // Examples: quantity 2 of one banner size/design = 1 line item; two separate banner rows = 2 line items.
  return (order.items || []).length * ADMIN_PROFIT_SHIPPING_COST_PER_LINE_ITEM_CENTS;
};

const bannerMaterialCostPerSqFt: Record<string, number> = {
  '13oz': 1.25,
  '15oz': 1.75,
  '18oz': 2.25,
  mesh: 2.44,
};

type LineEstimate = {
  reviewRequired: boolean;
  productionCostCents: number;
  reason?: string;
  diagnostics?: Record<string, unknown>;
};

const getRawProductName = (item: OrderItem): string | null => {
  const extendedItem = item as OrderItem & { product_name?: string; productName?: string; name?: string; title?: string; sku?: string };
  return extendedItem.product_name || extendedItem.productName || extendedItem.name || extendedItem.title || extendedItem.sku || null;
};

const getRawSize = (item: OrderItem): string | null => {
  const extendedItem = item as OrderItem & { size?: string; dimensions?: string; selected_size?: string; selectedSize?: string; variant_title?: string };
  const rawSize = extendedItem.size || extendedItem.dimensions || extendedItem.selected_size || extendedItem.selectedSize || extendedItem.variant_title;
  if (rawSize) return rawSize;
  if (Number.isFinite(item.width_in) && Number.isFinite(item.height_in)) return `${item.width_in}x${item.height_in}`;
  return null;
};

const parsePolePocketEdges = (polePocketPosition?: string): string[] => {
  if (!polePocketPosition) return [];
  return polePocketPosition
    .toLowerCase()
    .split(/[|,+]/g)
    .map((x) => x.trim())
    .filter((edge) => ['top', 'bottom', 'left', 'right'].includes(edge));
};

const estimateBannerCost = (item: OrderItem): LineEstimate => {
  if (!item.material || !Number.isFinite(item.width_in) || !Number.isFinite(item.height_in) || !Number.isFinite(item.quantity)) {
    return { reviewRequired: true, productionCostCents: 0, reason: 'Missing banner fields' };
  }

  const materialRate = bannerMaterialCostPerSqFt[item.material];
  if (!materialRate) {
    return { reviewRequired: true, productionCostCents: 0, reason: `Unknown banner material: ${item.material}` };
  }

  const squareFeetPerBanner = (item.width_in / 12) * (item.height_in / 12);
  const qty = item.quantity || 0;
  let totalCost = squareFeetPerBanner * materialRate * qty;

  const edges = parsePolePocketEdges(item.pole_pocket_position);
  if (edges.length > 0) {
    let linearFeet = 0;
    for (const edge of edges) {
      if (edge.includes('top') || edge.includes('bottom')) linearFeet += item.width_in / 12;
      if (edge.includes('left') || edge.includes('right')) linearFeet += item.height_in / 12;
    }
    if (linearFeet > 0) {
      totalCost += linearFeet * 1.0 * qty;
      totalCost += 10; // setup fee once per line when selected
    }
  }

  if (Number.isFinite(item.rope_feet) && (item.rope_feet || 0) > 0) {
    totalCost += (item.rope_feet || 0) * 1.0;
  }

  return { reviewRequired: false, productionCostCents: Math.round(totalCost * 100) };
};

const estimateFixedProductCost = (item: OrderItem): LineEstimate => {
  const result = resolveFixedProductCost({
    productType: item.product_type,
    productName: getRawProductName(item),
    rawSize: getRawSize(item),
    quantity: item.quantity,
  });

  if (!result.ok) {
    return {
      reviewRequired: true,
      productionCostCents: 0,
      reason: result.diagnostics.reason,
      diagnostics: result.diagnostics as unknown as Record<string, unknown>,
    };
  }

  return {
    reviewRequired: false,
    productionCostCents: result.totalCostCents,
    diagnostics: result.diagnostics as unknown as Record<string, unknown>,
  };
};

const estimateYardSignCost = (item: OrderItem): LineEstimate => {
  if (!Number.isFinite(item.quantity)) return { reviewRequired: true, productionCostCents: 0, reason: 'Missing yard sign quantity' };
  const qty = item.quantity || 0;
  if (qty % 10 !== 0) return { reviewRequired: true, productionCostCents: 0, reason: `Yard sign qty not divisible by 10: ${qty}` };

  const doubleSided = [item.grommets, item.pole_pockets, item.pole_pocket_position]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes('double');

  const unit = doubleSided ? 5.5 : 4.4;
  return { reviewRequired: false, productionCostCents: Math.round(unit * qty * 100) };
};

const estimateLineItemCost = (item: OrderItem): LineEstimate => {
  const productName = getRawProductName(item);
  const type = (item.product_type || '').toLowerCase();
  const productIdentity = `${type} ${productName || ''}`.toLowerCase();
  if (productIdentity.includes('magnet')) return estimateFixedProductCost(item);
  if (productIdentity.includes('poster')) return estimateFixedProductCost(item);
  if (type.includes('yard_sign') || type.includes('yardsign') || type.includes('yard-sign')) return estimateYardSignCost(item);
  if (!type || type === 'banner' || type.includes('banner')) return estimateBannerCost(item);
  return {
    reviewRequired: true,
    productionCostCents: 0,
    reason: `Unsupported product type: ${type}`,
    diagnostics: {
      productType: item.product_type || null,
      rawProductName: productName,
      rawSize: getRawSize(item),
      normalizedSize: normalizeSizeKey(getRawSize(item)),
      quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
      reason: `Unsupported product type: ${type}`,
    },
  };
};

const getRevenueBreakdownCents = (order: Order) => {
  const itemSubtotal = (order.items || []).reduce((sum, item) => {
    const lineTotal = Number(item?.line_total_cents);
    return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);

  const discount = Number.isFinite(Number(order.applied_discount_cents)) ? Number(order.applied_discount_cents) : 0;
  const sameDay = Number.isFinite(Number(order.same_day_fee_cents)) ? Number(order.same_day_fee_cents) : 0;
  const saturday = Number.isFinite(Number(order.saturday_fee_cents)) ? Number(order.saturday_fee_cents) : 0;

  if (itemSubtotal > 0) {
    const originalSubtotalCents = Math.max(0, itemSubtotal + sameDay + saturday);
    const adjustedRetailSubtotalCents = Math.max(0, itemSubtotal - discount + sameDay + saturday);
    return {
      originalSubtotalCents,
      discountsAppliedCents: Math.max(0, discount),
      adjustedRetailSubtotalCents,
    };
  }

  const storedSubtotal = Number.isFinite(Number(order.subtotal_cents)) ? Number(order.subtotal_cents) : 0;
  return {
    originalSubtotalCents: Math.max(0, storedSubtotal + discount),
    discountsAppliedCents: Math.max(0, discount),
    adjustedRetailSubtotalCents: Math.max(0, storedSubtotal),
  };
};

export const estimateOrderProfit = (order: Order) => {
  const lineEstimates = (order.items || []).map((item, idx) => {
    const estimate = estimateLineItemCost(item);
    if (estimate.reviewRequired) {
      console.warn('[admin-profit] Needs review line item', {
        orderId: order.id,
        index: idx,
        productType: item.product_type,
        material: item.material,
        widthIn: item.width_in,
        heightIn: item.height_in,
        rawProductName: getRawProductName(item),
        rawSize: getRawSize(item),
        normalizedSize: normalizeSizeKey(getRawSize(item)),
        quantity: item.quantity,
        reason: estimate.reason,
        diagnostics: estimate.diagnostics,
      });
    }
    return estimate;
  });

  const needsReview = lineEstimates.some((x) => x.reviewRequired);
  const productionCostCents = lineEstimates.reduce((sum, x) => sum + x.productionCostCents, 0);
  const revenue = getRevenueBreakdownCents(order);
  const retailSubtotalCents = revenue.adjustedRetailSubtotalCents;
  const shippingCostCents = estimateSupplierShippingCostCents(order);
  const totalCostCents = productionCostCents + shippingCostCents;
  const estimatedNetProfitCents = retailSubtotalCents - totalCostCents;
  const marginPct = retailSubtotalCents > 0 ? (estimatedNetProfitCents / retailSubtotalCents) * 100 : 0;

  return {
    needsReview,
    originalSubtotalCents: revenue.originalSubtotalCents,
    discountsAppliedCents: revenue.discountsAppliedCents,
    adjustedRetailSubtotalCents: revenue.adjustedRetailSubtotalCents,
    retailSubtotalCents,
    productionCostCents,
    shippingCostCents,
    totalCostCents,
    estimatedNetProfitCents,
    // Backwards-compatible alias used across existing admin UI surfaces.
    netProfitCents: estimatedNetProfitCents,
    marginPct,
  };
};
