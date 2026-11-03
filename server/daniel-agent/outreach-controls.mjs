// This file intentionally does not change daily limits or quota enforcement.
// The proposed cap migration was not applied.
export function automationEnabled(settings={},kind) {
  if(kind==='reply') return settings.auto_reply===true;
  if(settings.cold_outreach_paused===true) return false;
  if(kind==='intro') return settings.auto_prospect===true;
  // Prospecting includes non-responder bumps. Preserve legacy routine-mode
  // behavior, but auto_reply=false no longer disables enabled prospecting.
  if(kind==='followup') return settings.auto_prospect===true || settings.auto_reply===true;
  return false;
}
export function replySendAllowed(settings={},kind,{preview=false,gmailTest=false}={}) {
  // A preview is not a prospect send. Controlled Gmail tests are separately
  // restricted to the expiring owner allowlist by dispatch.
  return kind!=='reply' || preview || gmailTest || settings.auto_reply===true;
}
