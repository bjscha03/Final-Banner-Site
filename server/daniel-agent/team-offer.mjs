import promotions from '../../netlify/functions/_shared/daniel-team-promotion.cjs';
import { hash, attemptCount } from './auth.mjs';
import * as v from './validation.mjs';
export const TEAM_CODE_LIMIT = 100;
export function teamCodeRateKey(ip) {
  return hash('team-code:' + String(ip || 'unknown'));
}
export function offerText(code) {
  return `I'd love to give your team a reason to try us. Use ${code} for 25% off sitewide. Share it with your team and other locations, and use it as often as you like—there's no expiration.`;
}
export function approvedOfferText(text, offer, env = process.env) {
  if (!offer || !promotions.getTeamPromotion(offer.code, env)) return text;
  return String(text).replace(offerText(offer.code), 'Owner-approved team offer.');
}
function teamOfferRecord(company, env) {
  return {code:promotions.createTeamCode(company, env),percent:25,unlimited:true,expires_at:null,approved_by:'owner-2026-10-21',created_at:new Date().toISOString()};
}
function signingConfigured(env) {
  const key = env && env.DANIEL_PROMO_SIGNING_SECRET;
  return typeof key === 'string' && key.length >= 32;
}
function storedOffer(value) {
  if (!value) return null;
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return null; } }
  return value;
}
export async function ensureTeamOffer(sql, contact, env) {
  if (!env.DANIEL_PROMO_SIGNING_SECRET) return null;
  const created = teamOfferRecord(contact.company, env);
  const [account] = await sql`UPDATE daniel_sales.accounts SET team_offer=coalesce(team_offer,${JSON.stringify(created)}::jsonb) WHERE id=${contact.account_id} RETURNING team_offer`;
  if (!promotions.getTeamPromotion(account?.team_offer?.code, env)) throw Error('Stored team offer cannot be verified');
  return account.team_offer;
}
export async function mintTeamCode(sql, companyInput, env, actor, ip = 'unknown') {
  const company = v.text(companyInput, 'Company name', 200);
  if (!company.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '')) v.fail('Company name must include letters or numbers');
  if (!signingConfigured(env)) v.fail('Team offer signing is not configured', 503);
  const attempts = await attemptCount(sql, teamCodeRateKey(ip));
  if (attempts > TEAM_CODE_LIMIT) v.fail('Too many team codes requested. Try again in 15 minutes.', 429);
  let created;
  try { created = teamOfferRecord(company, env); }
  catch (error) { if (error && error.status) throw error; v.fail('Team offer signing is not configured', 503); }
  const promotion = promotions.getTeamPromotion(created.code, env);
  if (!promotion || promotion.discountPercentage !== 25) v.fail('Minted team code failed verification', 500);
  const matches = await sql`SELECT id, team_offer FROM daniel_sales.accounts WHERE lower(btrim(name))=lower(btrim(${company}))`;
  let accounts_recorded = 0, accounts_preserved = 0;
  for (const row of matches) {
    const existing = storedOffer(row.team_offer);
    if (existing) { accounts_preserved++; continue; }
    const [saved] = await sql`UPDATE daniel_sales.accounts SET team_offer=coalesce(team_offer,${JSON.stringify(created)}::jsonb) WHERE id=${row.id} RETURNING team_offer`;
    const offer = storedOffer(saved?.team_offer);
    if (!offer || offer.created_at !== created.created_at) { accounts_preserved++; continue; }
    if (!promotions.getTeamPromotion(offer.code, env) || offer.code !== created.code) v.fail('Stored team offer cannot be verified', 500);
    accounts_recorded++;
  }
  const result = {
    company,
    code: created.code,
    percent: 25,
    unlimited: true,
    expires_at: null,
    offer: offerText(created.code),
    accounts_matched: matches.length,
    accounts_recorded,
    accounts_preserved,
  };
  await sql`INSERT INTO daniel_sales.audit_events(entity_type,entity_id,event_type,actor,metadata_json) VALUES('account',${company},'team_code_minted',${String(actor || 'unknown')},${JSON.stringify({code:result.code,accounts_matched:result.accounts_matched,accounts_recorded,accounts_preserved})}::jsonb)`;
  return result;
}
export function validTeamOffer(offer, env) { return !!promotions.getTeamPromotion(offer?.code, env); }
