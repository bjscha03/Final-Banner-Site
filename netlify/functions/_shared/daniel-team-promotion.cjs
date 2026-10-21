'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const CAMPAIGN = 'daniel-team-25-v1';
function signingKey(env) {
  const key = env.DANIEL_PROMO_SIGNING_SECRET;
  return typeof key === 'string' && key.length >= 32 ? key : null;
}
function signature(base, key) {
  return createHmac('sha256', key).update(CAMPAIGN + ':' + base).digest('hex').slice(0, 12).toUpperCase();
}
function createTeamCode(company, env = process.env) {
  const key = signingKey(env);
  if (!key) throw Error('Team offer signing is not configured');
  const slug = String(company).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 26) || 'YOURTEAM';
  const base = slug + '25';
  return base + '-' + signature(base, key);
}
function getTeamPromotion(value, env = process.env) {
  const key = signingKey(env), code = String(value || '').trim().toUpperCase();
  const match = code.match(/^([A-Z0-9]{1,26}25)-([A-F0-9]{12})$/);
  if (!key || !match || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(match[1], key)))) return null;
  return { id: 'DANIEL_TEAM_' + code, code, discountPercentage: 25, discountAmountCents: null,
    expiresAt: null, source: 'reusable_promotion', discountScope: 'order', campaign: CAMPAIGN };
}
module.exports = { CAMPAIGN, createTeamCode, getTeamPromotion };
