'use strict';
const policy = require('./specialty-pricing-policy.json');

// Mixed carts also use the 20% order-wide ceiling. Banner-only scoped offers
// never discount specialty lines, so their existing eligibility is preserved.
function capSpecialtyPromotion(items, subtotalCents, promotion) {
  if (!promotion || !items.some(item => item.product_type === 'specialty')) return promotion;
  if (['banner_lines', 'qualifying_large_banner_lines', 'qualifying_small_banner_lines', 'recovery_qualifying_banner_lines'].includes(promotion.discountScope)) return promotion;
  // Explicit owner-approved sitewide team offer; other promotions retain the cap.
  if (promotion.source === 'reusable_promotion' && promotion.campaign === 'daniel-team-25-v1' && Number(promotion.discountPercentage) === 25 && promotion.discountScope === 'order' && !promotion.discountAmountCents) return promotion;
  const percent = Number(promotion.discountPercentage || 0);
  const fixed = Number(promotion.discountAmountCents || 0);
  const maximum = Math.floor(Math.max(0, subtotalCents) * policy.maximumDiscountPercent / 100);
  if (percent <= policy.maximumDiscountPercent && !(percent <= 0 && fixed > maximum)) return promotion;
  return {
    ...promotion,
    discountPercentage: percent > 0 ? policy.maximumDiscountPercent : promotion.discountPercentage,
    discountAmountCents: percent <= 0 ? maximum : promotion.discountAmountCents,
    specialtyDiscountCapped: true,
  };
}
module.exports = { capSpecialtyPromotion };
