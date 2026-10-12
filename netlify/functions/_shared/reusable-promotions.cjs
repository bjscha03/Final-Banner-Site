'use strict';

// Owner-authorized, shareable promotions with no expiry or redemption limits.
// Orders retain their applied code; these promotions never consume a coupon row.
function getReusablePromotion(value) {
  const code = String(value || '').trim().toUpperCase();
  if (code !== 'SARAH30') return null;
  return {
    id: 'SARAH30_PROMO',
    code,
    discountPercentage: 30,
    discountAmountCents: null,
    expiresAt: null,
    source: 'reusable_promotion',
    discountScope: 'order',
    campaign: 'sarah30',
  };
}

module.exports = { getReusablePromotion };
