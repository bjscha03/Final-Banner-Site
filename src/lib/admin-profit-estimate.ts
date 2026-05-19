import type { Order, OrderItem } from './orders/types';

export const ADMIN_PROFIT_SHIPPING_COST_CENTS = 1000;

const bannerMaterialCostPerSqFt: Record<string, number> = {
  '13oz': 1.25,
  '15oz': 1.75,
  '18oz': 2.25,
  mesh: 2.44,
};

const magnetUnitCosts: Record<string, number> = {
  '18x12': 11.95,
  '24x12': 14.95,
  '24x18': 20.95,
  '42x12': 29.95,
  '72x24': 89.7,
};

type LineEstimate = {
  reviewRequired: boolean;
  productionCostCents: number;
  reason?: string;
};

const normalizeDimKey = (wIn?: number, hIn?: number): string | null => {
  if (!Number.isFinite(wIn) || !Number.isFinite(hIn)) return null;
  const dims = [Math.round(wIn || 0), Math.round(hIn || 0)].sort((a, b) => a - b);
  return `${dims[0]}x${dims[1]}`;
};

const parsePolePocketEdges = (polePocketPosition?: string): string[] => {
  if (!polePocketPosition) return [];
  return polePocketPosition
    .toLowerCase()
    .split(/[|,+]/g)
    .map((x) => x.trim())
    .filter(Boolean);
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

  const edges = parsePolePocketEdges(item.pole_pocket_position || item.pole_pockets);
  if (edges.length > 0) {
    let linearFeet = 0;
    for (const edge of edges) {
      if (edge.includes('top') || edge.includes('bottom')) linearFeet += item.width_in / 12;
      if (edge.includes('left') || edge.includes('right')) linearFeet += item.height_in / 12;
    }
    totalCost += linearFeet * 1.0 * qty;
    totalCost += 10; // setup fee once per line when selected
  }

  if (Number.isFinite(item.rope_feet) && (item.rope_feet || 0) > 0) {
    totalCost += (item.rope_feet || 0) * 1.0;
  }

  return { reviewRequired: false, productionCostCents: Math.round(totalCost * 100) };
};

const estimateMagnetCost = (item: OrderItem): LineEstimate => {
  const key = normalizeDimKey(item.width_in, item.height_in);
  if (!key || !Number.isFinite(item.quantity)) {
    return { reviewRequired: true, productionCostCents: 0, reason: 'Missing magnet dimensions/quantity' };
  }
  const unit = magnetUnitCosts[key];
  if (!unit) return { reviewRequired: true, productionCostCents: 0, reason: `Unknown magnet size: ${key}` };
  return { reviewRequired: false, productionCostCents: Math.round(unit * item.quantity * 100) };
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
  const type = (item.product_type || 'banner').toLowerCase();
  if (type.includes('magnet')) return estimateMagnetCost(item);
  if (type.includes('yard_sign') || type.includes('yardsign') || type.includes('yard-sign')) return estimateYardSignCost(item);
  if (type === 'banner' || type.includes('banner')) return estimateBannerCost(item);
  return { reviewRequired: true, productionCostCents: 0, reason: `Unsupported product type: ${type}` };
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
        quantity: item.quantity,
        reason: estimate.reason,
      });
    }
    return estimate;
  });

  const needsReview = lineEstimates.some((x) => x.reviewRequired);
  const productionCostCents = lineEstimates.reduce((sum, x) => sum + x.productionCostCents, 0);
  const retailSubtotalCents = order.subtotal_cents || 0;
  const shippingCostCents = ADMIN_PROFIT_SHIPPING_COST_CENTS;
  const netProfitCents = retailSubtotalCents - productionCostCents - shippingCostCents;
  const marginPct = retailSubtotalCents > 0 ? (netProfitCents / retailSubtotalCents) * 100 : 0;

  return {
    needsReview,
    retailSubtotalCents,
    productionCostCents,
    shippingCostCents,
    netProfitCents,
    marginPct,
  };
};
