// Shared server-side checkout total calculator.
//
// Mirrors the logic that `paypal-create-order.cjs` and `create-order.cjs`
// have historically inlined: feature-flag-driven minimum order, "best
// discount wins" between quantity tier and promo, banner-only quantity
// tiers, US flat-free shipping, 6% tax. New payment integrations
// (Stripe) MUST use this so that the amount we charge always matches
// the amount the existing order pipeline persists.

const {
  capPromoDiscountAmount,
  promoSubtotalForItems,
  allQualifyingLargeBannerSubtotalCents,
  AUTOMATIC_LARGE_BANNER_ID,
  AUTOMATIC_LARGE_BANNER_LABEL,
  AUTOMATIC_LARGE_BANNER_RATE,
} = require('./recovery-discount-policy.cjs');

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

const resolveBestDiscount = (
  subtotalCents,
  quantity,
  promoDiscount = null,
  quantitySubtotalCents = null,
  promoSubtotalCents = null,
  automaticDiscountBaseCents = 0,
) => {
  const quantityBaseCents = quantitySubtotalCents == null ? subtotalCents : quantitySubtotalCents;
  const promoBaseCents = promoSubtotalCents == null ? subtotalCents : promoSubtotalCents;
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);
  const quantityDiscountAvailable = quantityDiscountAmountCents > 0;

  const automaticBaseCents = Math.max(0, Number(automaticDiscountBaseCents) || 0);
  const automaticDiscountAmountCents = Math.round(automaticBaseCents * AUTOMATIC_LARGE_BANNER_RATE);
  const automaticDiscountAvailable = automaticDiscountAmountCents > 0;

  let promoDiscountAmountCents = 0;
  let promoDiscountRate = 0;
  const promoIsPercentage = Boolean(promoDiscount && promoDiscount.discountPercentage);
  if (promoDiscount) {
    if (promoDiscount.discountPercentage) {
      promoDiscountRate = promoDiscount.discountPercentage / 100;
      promoDiscountAmountCents = Math.round(promoBaseCents * promoDiscountRate);
    } else if (promoDiscount.discountAmountCents) {
      promoDiscountAmountCents = Math.min(promoDiscount.discountAmountCents, promoBaseCents);
      promoDiscountRate = promoBaseCents > 0 ? promoDiscountAmountCents / promoBaseCents : 0;
    }
    promoDiscountAmountCents = capPromoDiscountAmount(promoDiscountAmountCents, promoDiscount);
  }
  const promoDiscountAvailable = promoDiscountAmountCents > 0;

  // "Best Discount Wins" — never stack. Among percentage-rate discounts
  // (automatic, quantity, percentage promo codes) the HIGHEST EFFECTIVE RATE
  // (actual dollars saved per dollar spent — `effectiveRate`, which accounts
  // for dollar caps) wins; on equal effective rates the larger dollar
  // savings wins; on a further tie the automatic promotion wins (listed
  // first). A fixed-dollar promo code can still beat the percentage winner
  // outright by strictly greater savings, but it never stacks with it.
  // Must mirror src/lib/discount-resolver.ts.
  const candidates = [];
  if (automaticDiscountAvailable) {
    candidates.push({
      type: 'automatic',
      rate: AUTOMATIC_LARGE_BANNER_RATE,
      effectiveRate: automaticBaseCents > 0 ? automaticDiscountAmountCents / automaticBaseCents : 0,
      amount: automaticDiscountAmountCents,
      id: AUTOMATIC_LARGE_BANNER_ID,
      label: AUTOMATIC_LARGE_BANNER_LABEL,
    });
  }
  if (quantityDiscountAvailable) {
    candidates.push({
      type: 'quantity',
      rate: quantityDiscountRate,
      effectiveRate: quantityBaseCents > 0 ? quantityDiscountAmountCents / quantityBaseCents : 0,
      amount: quantityDiscountAmountCents,
      id: null,
      label: null,
    });
  }
  if (promoDiscountAvailable && promoIsPercentage) {
    candidates.push({
      type: 'promo',
      rate: promoDiscountRate,
      effectiveRate: promoBaseCents > 0 ? promoDiscountAmountCents / promoBaseCents : 0,
      amount: promoDiscountAmountCents,
      id: null,
      label: null,
    });
  }

  let winner = null;
  for (const candidate of candidates) {
    if (!winner
        || candidate.effectiveRate > winner.effectiveRate
        || (candidate.effectiveRate === winner.effectiveRate && candidate.amount > winner.amount)) {
      winner = candidate;
    }
  }

  if (promoDiscountAvailable && !promoIsPercentage) {
    const fixedCandidate = {
      type: 'promo', rate: promoDiscountRate, amount: promoDiscountAmountCents, id: null, label: null,
    };
    if (!winner || fixedCandidate.amount > winner.amount) {
      winner = fixedCandidate;
    }
  }

  if (!winner) {
    return {
      appliedDiscountType: 'none',
      appliedDiscountAmountCents: 0,
      appliedDiscountRate: 0,
      appliedDiscountId: null,
      quantityDiscountCents: 0,
      promoDiscountCents: 0,
      automaticDiscountCents: 0,
    };
  }
  return {
    appliedDiscountType: winner.type,
    appliedDiscountAmountCents: winner.amount,
    appliedDiscountRate: winner.rate,
    appliedDiscountId: winner.id,
    quantityDiscountCents: winner.type === 'quantity' ? winner.amount : 0,
    promoDiscountCents: winner.type === 'promo' ? winner.amount : 0,
    automaticDiscountCents: winner.type === 'automatic' ? winner.amount : 0,
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

  const promoSubtotalCents = promoSubtotalForItems(items, adjusted, promoDiscount);
  const automaticDiscountBaseCents = allQualifyingLargeBannerSubtotalCents(items);
  const bestDiscount = resolveBestDiscount(
    adjusted,
    bannerQuantity,
    promoDiscount,
    bannerSubtotalCents,
    promoSubtotalCents,
    automaticDiscountBaseCents,
  );
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
    applied_discount_id: bestDiscount.appliedDiscountId,
    quantity_discount_rate: getQuantityDiscountRate(bannerQuantity),
    quantity_discount_cents: bestDiscount.quantityDiscountCents,
    promo_discount_cents: bestDiscount.promoDiscountCents,
    automatic_discount_cents: bestDiscount.automaticDiscountCents,
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
