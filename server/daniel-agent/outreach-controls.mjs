import { easternBusinessDay } from './policy.mjs';

// First ramp ceiling. Raising these ceilings requires a separately reviewed
// change; an editable setting can reduce, but cannot silently exceed, step 1.
export const RAMP_CEILINGS = Object.freeze({intro:25,followup:15});
export function dailyLimit(settings={},kind) {
  if(!Object.hasOwn(RAMP_CEILINGS,kind)) return 0;
  const value=settings[kind==='intro'?'intro_daily_limit':'followup_daily_limit'];
  const fallback=kind==='intro'?10:5;
  return Number.isInteger(value)&&value>=0 ? Math.min(value,RAMP_CEILINGS[kind]) : fallback;
}
export function automationEnabled(settings={},kind) {
  if(kind==='intro')return settings.auto_prospect===true;
  if(kind==='followup')return typeof settings.auto_followup==='boolean' ? settings.auto_followup : settings.auto_reply===true;
  if(kind==='reply')return settings.prospecting_only!==true && settings.auto_reply===true;
  return false;
}
export function sendKindAllowed(settings={},kind) {
  // Manual approval must never bypass the owner's prospecting-only model.
  if(kind==='reply')return settings.prospecting_only!==true && (settings.auto_reply!==false || settings.outreach_pacing_enabled!==true);
  return ['intro','followup'].includes(kind) && settings.cold_outreach_paused!==true;
}
export function pacedAllowance(settings,kind,now=new Date()) {
  const cap=dailyLimit(settings,kind);
  if(!easternBusinessDay(now))return 0;
  if(!settings.outreach_pacing_enabled)return cap;
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const minutes=Number(p.find(x=>x.type==='hour').value)*60+Number(p.find(x=>x.type==='minute').value)-480;
  return Math.min(cap,1+Math.floor(minutes*cap/720));
}
export function discoverySlot(settings,now) {
  return settings.outreach_pacing_enabled ? 'ramp:'+Math.floor(+now/900000) : now.toISOString().slice(0,13);
}
export function discoveryLimit(settings) { return settings.outreach_pacing_enabled ? 48 : 16; }

export async function reviewReputationStop(sql,settings) {
  if(!settings.outreach_pacing_enabled || !settings.ramp_started_at)return {held:false,complaint_telemetry:'not_connected'};
  const [signals]=await sql`SELECT (SELECT count(*)::int FROM daniel_sales.suppressions WHERE created_at>=${settings.ramp_started_at}::timestamptz AND reason ILIKE 'Hard bounce%') AS hard_bounces,(SELECT count(*)::int FROM daniel_sales.messages WHERE direction='inbound' AND classification IS DISTINCT FROM 'automated' AND created_at>=${settings.ramp_started_at}::timestamptz AND body ~* '(spam|unsolicited|report.{0,30}(abuse|gmail))') AS complaint_signals`;
  if(!signals?.hard_bounces && !signals?.complaint_signals)return {held:false,hard_bounces:0,complaint_signals:0,complaint_telemetry:'not_connected'};
  const reason='Ramp reputation hold: '+signals.hard_bounces+' confirmed hard bounces; '+signals.complaint_signals+' complaint-language signals. Human review required; no automatic restart.';
  await sql`UPDATE daniel_sales.settings SET cold_outreach_paused=true,reputation_hold_reason=${reason},updated_at=now() WHERE id=1 AND cold_outreach_paused=false`;
  return {held:true,...signals,reason,complaint_telemetry:'not_connected'};
}
