import { createHash } from 'node:crypto';
import { currentReplyReview } from './reply-review.mjs';

// Set only by the strict generator after its schema validation succeeds.
export const DRAFT_CONTRACT = 'daniel-strict-metadata-20261102';
export const contentHash = message => createHash('sha256').update(message.subject+'\n'+message.body).digest('hex');
export const followupHash = message => createHash('sha256').update([message.subject,message.body,message.contact_id,message.thread_key,message.reply_to_id].join('\n')).digest('hex');

export function currentFollowupReview(message) {
  const review=message.ai_metadata?.followup_review;
  return review?.approved===true && typeof review.response_id==='string' && !!review.response_id &&
    review.content_hash===followupHash(message) && review.knowledge_version===message.ai_metadata?.knowledge_version;
}

// This adds restrictions; it never overrides global pause, suppression, quota,
// independent review or Gmail conversation checks.
export function recoveryEligibility(message, settings={}, knowledge=null) {
  if(settings.paused) return {ok:false,reason:'agent_paused'};
  if(settings.cold_outreach_paused && message.kind!=='reply') return {ok:false,reason:'cold_outreach_paused'};
  if(!settings.required_draft_contract) return {ok:true};
  const meta=message.ai_metadata || {};
  if(settings.required_draft_contract!==DRAFT_CONTRACT || meta.generation_contract!==DRAFT_CONTRACT)
    return {ok:false,reason:'legacy_draft_quarantined'};
  if(!knowledge || meta.knowledge_version!==knowledge.version || meta.requires_approval!==false || meta.model_requires_approval!==false)
    return {ok:false,reason:'recovery_policy_review_required'};
  if(!Array.isArray(meta.fact_ids) || !meta.fact_ids.every(key=>typeof key==='string' && Object.hasOwn(knowledge.facts || {},key)))
    return {ok:false,reason:'invalid_fact_identifiers'};
  if(message.kind==='reply') {
    if(meta.model_classification!=='routine_product' || !currentReplyReview(message) || meta.conversation_review.knowledge_version!==knowledge.version)
      return {ok:false,reason:'current_reply_review_required'};
  } else if(message.kind==='intro') {
    if(meta.model_classification!=='routine_product' || meta.research_review?.approved!==true ||
       !meta.research_review?.response_id || meta.research_review.content_hash!==contentHash(message))
      return {ok:false,reason:'current_introduction_review_required'};
  } else if(message.kind==='followup') {
    if(meta.model_classification!=='followup' || !currentFollowupReview(message))
      return {ok:false,reason:'current_followup_review_required'};
  } else return {ok:false,reason:'invalid_message_kind'};
  return {ok:true};
}
