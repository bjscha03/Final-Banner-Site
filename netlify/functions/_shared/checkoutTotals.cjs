// Shared server-side checkout total calculator.
//
// Mirrors the logic that `paypal-create-order.cjs` and `create-order.cjs`
// have historically inlined: feature-flag-driven minimum order, one resolved
// discount, banner-only quantity tiers, US flat-free shipping, and 6% tax.
// New payment integrations (Stripe) MUST use this so that the amount charged
// always matches the amount the existing order pipeline persists.

const {
  AUTOMATIC_LARGE_BANNER_PERCENTAGE,
  AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
  AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL,
  allQualifyingLargeBannerSubtotalCents,
  capPromoDiscountAmount,
  promoSubtotalForItems,
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

const normalizedCents = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
};

const promoLabel = (promoDiscount, amountCents) => {
  const code = String(promoDiscount?.code || 'Promo').trim().toUpperCase() || 'Promo';
  const percentage = Number(promoDiscount?.discountPercentage || 0);
  const valueLabel = percentage > 0
    ? `${percentage}% off`
    : `$${(amountCents / 100).toFixed(2)} off`;
  return `${code} (${valueLabel})`;
};

const isAutomaticAlias = (code) => {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === AUTOMATIC_LARGE_BANNER_PROMOTION_ID || normalized === 'BIG25';
};

const resolveBestDiscount = (
  subtotalCents,
  quantity,
  promoDiscount = null,
  quantitySubtotalCents = null,
  promoSubtotalCents = null,
  automaticLargeBannerSubtotalCents = 0,
) => {
  const quantityBaseCents = quantitySubtotalCents == null
    ? normalizedCents(subtotalCents)
    : normalizedCents(quantitySubtotalCents);
  const promoBaseCents = promoSubtotalCents == null
    ? normalizedCents(subtotalCents)
    : normalizedCents(promoSubtotalCents);
  const automaticBaseCents = normalizedCents(automaticLargeBannerSubtotalCents);

  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);

  let promoDiscountAmountCents = 0;
  let promoDiscountRate = 0;
  const promoCode = promoDiscount?.code
    ? String(promoDiscount.code).trim().toUpperCase()
    : null;
  const promoPercentage = Number(promoDiscount?.discountPercentage || 0);
  const fixedPromoAmountCents = normalizedCents(promoDiscount?.discountAmountCents);

  if (promoDiscount) {
    if (promoPercentage > 0) {
      promoDiscountRate = promoPercentage / 100;
      promoDiscountAmountCents = Math.round(promoBaseCents * promoDiscountRate);
    } else if (fixedPromoAmountCents > 0) {
      promoDiscountAmountCents = Math.min(fixedPromoAmountCents, promoBaseCents);
      promoDiscountRate = promoBaseCents > 0 ? promoDiscountAmountCents / promoBaseCents : 0;
    }
    promoDiscountAmountCents = capPromoDiscountAmount(promoDiscountAmountCents, promoDiscount);
  }

  const automaticRate = AUTOMATIC_LARGE_BANNER_PERCENTAGE / 100;
  const automaticDiscountAmountCents = Math.round(automaticBaseCents * automaticRate);

  if (automaticDiscountAmountCents > 0) {
    const isFixedPromo = fixedPromoAmountCents > 0 && promoPercentage <= 0;
    const manualPromoCanReplaceAutomatic = promoDiscountAmountCents > automaticDiscountAmountCents
      && !isAutomaticAlias(promoCode)
      && (isFixedPromo || promoPercentage > AUTOMATIC_LARGE_BANNER_PERCENTAGE);

    if (manualPromoCanReplaceAutomatic) {
      return {
        appliedDiscountType: 'promo',
        appliedDiscountAmountCents: promoDiscountAmountCents,
        appliedDiscountRate: promoDiscountRate,
        appliedDiscountLabel: promoLabel(promoDiscount, promoDiscountAmountCents),
        promotionId: null,
        appliedPromoCode: promoCode,
        helperMessage: "Discounts can't be combined — we applied the larger promotion.",
        quantityDiscountCents: 0,
        promoDiscountCents: promoDiscountAmountCents,
        automaticLargeBannerDiscountCents: automaticDiscountAmountCents,
      };
    }

    return {
      appliedDiscountType: 'promo',
      appliedDiscountAmountCents: automaticDiscountAmountCents,
      appliedDiscountRate: automaticRate,
      appliedDiscountLabel: AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL,
      promotionId: AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
      appliedPromoCode: AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
      helperMessage: quantityDiscountAmountCents > 0 || promoDiscountAmountCents > 0
        ? 'Large-banner pricing is automatic and cannot be combined with other discounts.'
        : null,
      quantityDiscountCents: 0,
      promoDiscountCents: automaticDiscountAmountCents,
      automaticLargeBannerDiscountCents: automaticDiscountAmountCents,
    };
  }

  if (quantityDiscountAmountCents >= promoDiscountAmountCents && quantityDiscountAmountCents > 0) {
    return {
      appliedDiscountType: 'quantity',
      appliedDiscountAmountCents: quantityDiscountAmountCents,
      appliedDiscountRate: quantityDiscountRate,
      appliedDiscountLabel: `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`,
      promotionId: null,
      appliedPromoCode: null,
      helperMessage: promoDiscountAmountCents > 0
        ? "Discounts can't be combined — we applied the best one."
        : null,
      quantityDiscountCents: quantityDiscountAmountCents,
      promoDiscountCents: 0,
      automaticLargeBannerDiscountCents: 0,
    };
  }

  if (promoDiscountAmountCents > 0) {
    return {
      appliedDiscountType: 'promo',
      appliedDiscountAmountCents: promoDiscountAmountCents,
      appliedDiscountRate: promoDiscountRate,
      appliedDiscountLabel: promoLabel(promoDiscount, promoDiscountAmountCents),
      promotionId: null,
      appliedPromoCode: promoCode,
      helperMessage: quantityDiscountAmountCents > 0
        ? "Discounts can't be combined — we applied the best one."
        : null,
      quantityDiscountCents: 0,
      promoDiscountCents: promoDiscountAmountCents,
      automaticLargeBannerDiscountCents: 0,
    };
  }

  return {
    appliedDiscountType: 'none',
    appliedDiscountAmountCents: 0,
    appliedDiscountRate: 0,
    appliedDiscountLabel: '',
    promotionId: null,
    appliedPromoCode: null,
    helperMessage: null,
    quantityDiscountCents: 0,
    promoDiscountCents: 0,
    automaticLargeBannerDiscountCents: 0,
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
  const automaticLargeBannerSubtotalCents = allQualifyingLargeBannerSubtotalCents(items);
  const bestDiscount = resolveBestDiscount(
    adjusted,
    bannerQuantity,
    promoDiscount,
    bannerSubtotalCents,
    promoSubtotalCents,
    automaticLargeBannerSubtotalCents,
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
    applied_discount_label: bestDiscount.appliedDiscountLabel,
    applied_promotion_id: bestDiscount.promotionId,
    applied_promo_code: bestDiscount.appliedPromoCode,
    helper_message: bestDiscount.helperMessage,
    automatic_large_banner_discount_cents: bestDiscount.automaticLargeBannerDiscountCents,
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
