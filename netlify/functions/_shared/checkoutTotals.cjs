// Shared server-side checkout total calculator.
//
// Mirrors the logic that `paypal-create-order.cjs` and `create-order.cjs`
// have historically inlined: feature-flag-driven minimum order, "best
// discount wins" between quantity tier and promo, banner-only quantity
// tiers, US flat-free shipping, 6% tax. New payment integrations
// (Stripe) MUST use this so that the amount we charge always matches
// the amount the existing order pipeline persists.

const getFeatureFlags = () => ({
  freeShipping: process.env.FEATURE_FREE_SHIPPING === '1',
  minOrderFloor: process.env.FEATURE_MIN_ORDER_FLOOR === '1',
  minOrderCents: parseInt(process.env.MIN_ORDER_CENTS || '2000', 10),
  shippingMethodLabel: process.env.SHIPPING_METHOD_LABEL || 'Free Next-Day Air',
});

// Quantity discount tiers - "Buy More, Save More"
// Must match src/lib/quantity-discount.ts exactly.
const QUANTITY_DISCOUNT_TIERS = [
  { minQuantity: 1, discountRate: 0.00 },
  { minQuantity: 2, discountRate: 0.05 },
  { minQuantity: 3, discountRate: 0.07 },
  { minQuantity: 4, discountRate: 0.10 },
  { minQuantity: 5, discountRate: 0.13 },
];

const getQuantityDiscountRate = (quantity) => {
  let rate = 0;
  for (const tier of QUANTITY_DISCOUNT_TIERS) {
    if (quantity >= tier.minQuantity) rate = tier.discountRate;
  }
  return rate;
};

const resolveBestDiscount = (subtotalCents, quantity, promoDiscount = null, quantitySubtotalCents = null) => {
  const quantityBaseCents = quantitySubtotalCents == null ? subtotalCents : quantitySubtotalCents;
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);

  let promoDiscountAmountCents = 0;
  let promoDiscountRate = 0;
  if (promoDiscount) {
    if (promoDiscount.discountPercentage) {
      promoDiscountRate = promoDiscount.discountPercentage / 100;
      promoDiscountAmountCents = Math.round(subtotalCents * promoDiscountRate);
    } else if (promoDiscount.discountAmountCents) {
      promoDiscountAmountCents = Math.min(promoDiscount.discountAmountCents, subtotalCents);
      promoDiscountRate = subtotalCents > 0 ? promoDiscountAmountCents / subtotalCents : 0;
    }
  }

  if (quantityDiscountAmountCents >= promoDiscountAmountCents && quantityDiscountAmountCents > 0) {
    return {
      appliedDiscountType: 'quantity',
      appliedDiscountAmountCents: quantityDiscountAmountCents,
      appliedDiscountRate: quantityDiscountRate,
      quantityDiscountCents: quantityDiscountAmountCents,
      promoDiscountCents: 0,
    };
  } else if (promoDiscountAmountCents > 0) {
    return {
      appliedDiscountType: 'promo',
      appliedDiscountAmountCents: promoDiscountAmountCents,
      appliedDiscountRate: promoDiscountRate,
      quantityDiscountCents: 0,
      promoDiscountCents: promoDiscountAmountCents,
    };
  }
  return {
    appliedDiscountType: 'none',
    appliedDiscountAmountCents: 0,
    appliedDiscountRate: 0,
    quantityDiscountCents: 0,
    promoDiscountCents: 0,
  };
};

const computeTotals = (items, taxRate, opts, promoDiscount = null) => {
  const raw = items.reduce((sum, i) => sum + (i.line_total_cents || 0), 0);
  const adjusted = Math.max(raw, opts.minFloorCents || 0);
  const minAdj = Math.max(0, adjusted - raw);

  // Only BANNER items count toward quantity discount tiers; yard signs
  // and car magnets use flat pricing with NO quantity discounts.
  const isBanner = (i) => {
    const t = i.product_type || 'banner';
    return t !== 'yard_sign' && t !== 'car_magnet';
  };
  const bannerItems = items.filter(isBanner);
  const bannerQuantity = bannerItems.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const bannerSubtotalCents = bannerItems.reduce((sum, i) => sum + (i.line_total_cents || 0), 0);
  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

  const bestDiscount = resolveBestDiscount(adjusted, bannerQuantity, promoDiscount, bannerSubtotalCents);
  const subtotalAfterDiscount = adjusted - bestDiscount.appliedDiscountAmountCents;

  const shipping_cents = opts.freeShipping ? 0 : 0; // Always free for US
  const tax_cents = Math.round(subtotalAfterDiscount * taxRate);
  const total_cents = subtotalAfterDiscount + tax_cents + shipping_cents;

  return {
    raw_subtotal_cents: raw,
    adjusted_subtotal_cents: adjusted,
    min_order_adjustment_cents: minAdj,
    total_quantity: totalQuantity,
    applied_discount_type: bestDiscount.appliedDiscountType,
    applied_discount_cents: bestDiscount.appliedDiscountAmountCents,
    applied_discount_rate: bestDiscount.appliedDiscountRate,
    quantity_discount_rate: getQuantityDiscountRate(bannerQuantity),
    quantity_discount_cents: bestDiscount.quantityDiscountCents,
    promo_discount_cents: bestDiscount.promoDiscountCents,
    subtotal_after_discount_cents: subtotalAfterDiscount,
    shipping_cents,
    tax_cents,
    total_cents,
  };
};

module.exports = {
  getFeatureFlags,
  getQuantityDiscountRate,
  resolveBestDiscount,
  computeTotals,
};
