export const OUTREACH_CEILINGS = Object.freeze({intro:25,followup:15});
export const REPLY_MODE = 'manual_only';
export const SEND_SLOT_MINUTES = 15;
export const MAX_DISCOVERY_RUNS = 48;

export function dailyLimit(settings={},kind) {
  if(!Object.hasOwn(OUTREACH_CEILINGS,kind)) return 0;
  const key=kind==='intro'?'intro_daily_limit':'followup_daily_limit';
  const value=settings[key];
  return Number.isInteger(value) && value>=0 ? Math.min(value,OUTREACH_CEILINGS[kind]) : OUTREACH_CEILINGS[kind];
}
export function automationEnabled(settings={},kind) {
  if(settings.paused || settings.cold_outreach_paused) return false;
  if(kind==='intro') return settings.auto_prospect===true;
  if(kind==='followup') return settings.auto_followup===true;
  return false; // A human reply is never an autonomous sending activity.
}
export function sendKindAllowed(settings={},kind) {
  return automationEnabled(settings,kind);
}
export function easternWindow(now=new Date()) {
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const day=p.find(x=>x.type==='weekday').value;
  const elapsed=Number(p.find(x=>x.type==='hour').value)*60+Number(p.find(x=>x.type==='minute').value)-480;
  return {open:day!=='Sat' && day!=='Sun' && elapsed>=0 && elapsed<720,elapsedMinutes:elapsed};
}
export function pacedAllowance(settings={},kind,now=new Date()) {
  const cap=dailyLimit(settings,kind),window=easternWindow(now);
  if(!window.open || cap===0) return 0;
  if(settings.outreach_pacing_enabled===false) return cap;
  return Math.min(cap,1+Math.floor(window.elapsedMinutes*cap/720));
}
export function discoveryInterval(settings={}) {
  const minutes=settings.discovery_interval_minutes;
  return Number.isInteger(minutes) && minutes>=15 && minutes<=60 ? minutes : 15;
}
export function discoverySlot(settings={},now=new Date()) {
  return 'outreach:'+Math.floor(+now/(discoveryInterval(settings)*60000));
}
export function discoveryLimit(settings={}) {
  const n=settings.discovery_daily_limit;
  return Number.isInteger(n) && n>=0 ? Math.min(n,MAX_DISCOVERY_RUNS) : MAX_DISCOVERY_RUNS;
}
export function controlsSnapshot(settings={}) {
  return {paused:settings.paused===true,coldOutreachPaused:settings.cold_outreach_paused===true,autoReply:settings.auto_reply===true,replyMode:REPLY_MODE,autoFollowup:settings.auto_followup===true,autoProspect:settings.auto_prospect===true,introDailyLimit:dailyLimit(settings,'intro'),followupDailyLimit:dailyLimit(settings,'followup'),outreachPacingEnabled:settings.outreach_pacing_enabled!==false,sendSlotMinutes:SEND_SLOT_MINUTES,discoveryIntervalMinutes:discoveryInterval(settings),discoveryDailyLimit:discoveryLimit(settings),requiredDraftContract:settings.required_draft_contract || null};
}
