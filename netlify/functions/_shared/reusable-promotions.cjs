'use strict';

// Owner-authorized, shareable promotions with no expiry or redemption limits.
// Orders retain their applied code; these promotions never consume a coupon row.
function getReusablePromotion(value) {
  const code = String(value || '').trim().toUpperCase();
  const team = require('./daniel-team-promotion.cjs').getTeamPromotion(code);
  if (team) return team;
  if (code !== 'SARAH30' && code !== 'TRIXIE25') return null;
  return {
    id: `${code}_PROMO`,
    code,
    discountPercentage: code === 'TRIXIE25' ? 25 : 30,
    discountAmountCents: null,
    expiresAt: null,
    source: 'reusable_promotion',
    discountScope: 'order',
    campaign: code === 'TRIXIE25' ? 'trixie-friends-25-v1' : 'sarah30',
  };
}

module.exports = { getReusablePromotion };
