import promotions from '../../netlify/functions/_shared/daniel-team-promotion.cjs';
export function offerText(code) {
  return `I'd love to give your team a reason to try us. Use ${code} for 25% off sitewide. Share it with your team and other locations, and use it as often as you like—there's no expiration.`;
}
export function approvedOfferText(text, offer, env = process.env) {
  if (!offer || !promotions.getTeamPromotion(offer.code, env)) return text;
  return String(text).replace(offerText(offer.code), 'Owner-approved team offer.');
}
export async function ensureTeamOffer(sql, contact, env) {
  if (!env.DANIEL_PROMO_SIGNING_SECRET) return null;
  const created = {code:promotions.createTeamCode(contact.company, env),percent:25,unlimited:true,expires_at:null,approved_by:'owner-2026-10-21',created_at:new Date().toISOString()};
  const [account] = await sql`UPDATE daniel_sales.accounts SET team_offer=coalesce(team_offer,${JSON.stringify(created)}::jsonb) WHERE id=${contact.account_id} RETURNING team_offer`;
  if (!promotions.getTeamPromotion(account?.team_offer?.code, env)) throw Error('Stored team offer cannot be verified');
  return account.team_offer;
}
export function validTeamOffer(offer, env) { return !!promotions.getTeamPromotion(offer?.code, env); }
