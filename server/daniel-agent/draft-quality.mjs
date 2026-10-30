// Deterministic checks supplement, never replace, independent content review.
export const MAX_DRAFT_ATTEMPTS = 3;
const NUMBER_WORD = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)';
const COUNT = new RegExp('\\b(?:\\d[\\d,+]*|' + NUMBER_WORD + '(?:[ -]' + NUMBER_WORD + ')*)\\s+(?:(?:U\\.?S\\.?|U\\.?K\\.?|American|US-based)\\s+)?(?:locations?|restaurants?|stores?|sites?|properties|breweries|venues|offices|branches)\\b', 'i');
export function hasCompanyLocationCount(body) {
  return COUNT.test(String(body || ''));
}
export function invalidFactIds(ids, facts) {
  if (!Array.isArray(ids)) return ['fact_ids must be an array'];
  return ids.filter(id => typeof id !== 'string' || !Object.hasOwn(facts || {}, id));
}
export function shouldAppendTeamOffer(kind, intent, inboundBody = '') {
  if (kind === 'intro') return true;
  if (kind !== 'reply' || intent === 'referral') return false;
  return /(?:what|which|how|send|share|use|apply|redeem)[\s\S]{0,50}\b(?:code|discount)\b|\b(?:code|discount)\b[^\n]{0,80}\?/i.test(inboundBody);
}
export function draftFailure(error) {
  const message = String(error?.message || '');
  if (/fact_ids|fact identifiers/i.test(message)) return {code:'invalid_fact_ids', note:'Draft cited unknown business facts. Regenerate against the approved fact keys; never remove checks to approve it.'};
  if (/invalid JSON|invalid draft/i.test(message)) return {code:'invalid_ai_output', note:'AI output failed its schema. Regenerate and independently review.'};
  if (/company counts|prior contact/i.test(message)) return {code:'unsupported_personalization', note:'Draft violated company-count or prior-contact policy. Regenerate from verified evidence.'};
  if (/Stored team offer cannot be verified/i.test(message)) return {code:'unverified_offer', note:'Stored team offer failed verification. Do not send or invent a replacement code.'};
  if (/Human response already received/i.test(message)) return {code:'human_reply_present', note:'Human reply exists. Stop unanswered-prospect follow-ups and reconcile the conversation.'};
  if (/verified human reply|canonical conversation/i.test(message)) return {code:'reply_identity_unverified', note:'Reply identity or canonical conversation could not be verified. Hold for review.'};
  if (/not configured|unavailable|timeout|aborted|fetch failed/i.test(message)) return {code:'dependency_unavailable', note:'A required AI or service dependency was unavailable. Check the connection before another attempt.'};
  return {code:'draft_or_review_failed', note:'Draft generation or independent review failed. Inspect the task before retrying; no message was authorized by this failure.'};
}
export function retryDecision(attemptCount, error) {
  const attempts = Number.isFinite(Number(attemptCount)) ? Math.max(0, Number(attemptCount)) : 0;
  const failure = draftFailure(error);
  const terminal = attempts + 1 >= MAX_DRAFT_ATTEMPTS || ['unverified_offer','human_reply_present','reply_identity_unverified'].includes(failure.code);
  return {attempts:attempts+1, status:terminal?'needs_review':'pending', delayHours:Math.min(4, 2 ** Math.min(attempts, 2)), ...failure};
}
