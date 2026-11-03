import { approvedOfferText } from './team-offer.mjs';
import { routinePolicyText } from './policy.mjs';
import { createHash } from 'node:crypto';
import { approvalNeeded } from './operations.mjs';
import { requestApproval,decide,audit } from './store.mjs';
import { currentReplyReview } from './reply-review.mjs';
import { reviewFollowup } from './followup-review.mjs';
import { DRAFT_CONTRACT,currentFollowupReview,followupHash,recoveryEligibility } from './recovery-policy.mjs';
import { automationEnabled } from './outreach-controls.mjs';

export function businessException(message,knowledge,env=process.env) {
 const meta=message.ai_metadata || {};
 const text=routinePolicyText(approvedOfferText(message.subject+'\n'+message.body,meta.team_offer,env),knowledge.facts);
 // Asking whether someone wants a quote is not itself a price commitment.
 // Actual amounts, special terms, financial actions and commitments stay held.
 return approvalNeeded(text) || /\$|\d\s*%|\b(refund|complaint|payment|invoice|contract|guarantee|discount|meeting|appointment|schedule a call|net\s*\d|credit|password|credentials|supplier)\b/i.test(text)
   || ['quote_request','meeting_request','escalate'].includes(meta.model_classification);
}
export function routineEligible(message,knowledge,env=process.env) {
 const meta=message.ai_metadata;
 if(!['reply','followup'].includes(message.kind) || !meta || meta.requires_approval!==false)return false;
 const acknowledgment=message.kind==='reply' && currentReplyReview(message) && meta.conversation_review.acknowledgment_only===true;
 if(meta.knowledge_version!==knowledge.version || !Array.isArray(meta.fact_ids) || (!meta.fact_ids.length && !acknowledgment) || !meta.fact_ids.every(k=>Object.hasOwn(knowledge.facts,k)))return false;
 if(message.kind==='reply' && (meta.classification!=='needs_review' || meta.model_classification!=='routine_product' || !currentReplyReview(message)))return false;
 if(message.kind==='followup' && meta.model_classification!=='followup')return false;
 return !businessException(message,knowledge,env);
}
export function introductionEvidenceEligible(message,research,now=new Date()) {
 const meta=message.ai_metadata || {},hash=createHash('sha256').update(message.subject+'\n'+message.body).digest('hex');
 return message.kind==='intro' && research?.verified===true && research.recurring_buyer===true
   && +now-Date.parse(research.verified_at)>=0 && +now-Date.parse(research.verified_at)<7*86400000
   && !!research.reviewer?.response_id && meta.research_review?.approved===true
   && !!meta.research_review.response_id && meta.research_review.content_hash===hash;
}
export function introductionEligible(message,knowledge,research,now=new Date(),env=process.env) {
 return introductionEvidenceEligible(message,research,now) && routineEligible({...message,kind:'followup',ai_metadata:{...message.ai_metadata,model_classification:'followup'}},knowledge,env);
}
export async function routeApproval(sql,message,settings,env=process.env,{followupReviewer=reviewFollowup}={}) {
 if(!['draft','pending_approval'].includes(message.status))return {status:'not_reviewable'};
 if(message.kind==='reply')return {status:'manual_reply_only'};
 if(!['intro','followup'].includes(message.kind))return {status:'policy_hold',reason:'invalid_message_kind'};
 // Existing legacy records are not opened, rewritten, approved or deleted.
 if(settings.required_draft_contract && (settings.required_draft_contract!==DRAFT_CONTRACT || message.ai_metadata?.generation_contract!==DRAFT_CONTRACT))return {status:'legacy_hold'};
 if(settings.cold_outreach_paused)return {status:'cold_outreach_hold'};
 // Review during a global pause is permitted, but never permits dispatch.
 if(!automationEnabled({...settings,paused:false},message.kind))return {status:'automation_disabled'};
 const [knowledge]=await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;
 const meta=message.ai_metadata || {};
 if(!knowledge?.facts || meta.knowledge_version!==knowledge.version || !Array.isArray(meta.fact_ids)
   || !meta.fact_ids.length || !meta.fact_ids.every(k=>typeof k==='string' && Object.hasOwn(knowledge.facts,k)))
   return {status:'policy_hold',reason:'invalid_or_missing_business_fact_references'};
 const [contact]=await sql`SELECT research,suppressed_at FROM daniel_sales.contacts WHERE id=${message.contact_id}`;
 if(!contact || contact.suppressed_at)return {status:'policy_hold',reason:'suppressed_or_missing_contact'};
 if(message.kind==='intro' && !introductionEvidenceEligible(message,contact.research))
   return {status:'independent_review_hold',reason:'current_verified_research_and_content_review_required'};
 if(message.kind==='followup' && meta.generation_contract===DRAFT_CONTRACT && !currentFollowupReview(message)) {
  const prior=meta.followup_review;
  if(prior?.approved===false && prior?.response_id && prior.content_hash===followupHash(message))
   return {status:'independent_review_hold',reason:'exact_content_was_rejected'};
  const review=await followupReviewer(sql,message,knowledge,env);
  await sql`UPDATE daniel_sales.messages SET ai_metadata=ai_metadata || ${JSON.stringify({followup_review:review})}::jsonb WHERE id=${message.id} AND status IN ('draft','pending_approval')`;
  await audit(sql,'daniel-review','followup_context_reviewed','message',message.id,{approved:review.approved===true,reason:review.reason,response_id:review.response_id || null});
  message={...message,ai_metadata:{...message.ai_metadata,followup_review:review}};
  if(!currentFollowupReview(message))return {status:'independent_review_hold',reason:'followup_content_review_failed'};
 }
 // Only an independently checked draft with an actual business exception
 // enters the human approval queue. Quality/format failures remain drafts.
 if(businessException(message,knowledge,env)) {
  if(message.ai_metadata.requires_approval!==true)return {status:'policy_hold',reason:'exception_metadata_inconsistent'};
  await requestApproval(sql,message.id,'daniel-worker');
  return {status:'business_exception'};
 }
 if(settings.required_draft_contract) {
  const gate=recoveryEligibility(message,{...settings,paused:false},knowledge);
  if(!gate.ok)return {status:'policy_hold',reason:gate.reason};
 }
 const eligible=message.kind==='intro'
   ? introductionEligible(message,knowledge,contact.research,new Date(),env)
   : routineEligible(message,knowledge,env);
 if(!eligible)return {status:'policy_hold',reason:'routine_eligibility_failed'};
 // Create the durable decision record only AFTER every required check passes.
 // Routine decisions are immediately approved by policy, not left for Brandon.
 await requestApproval(sql,message.id,'daniel-worker');
 const [approval]=await sql`SELECT id FROM daniel_sales.approvals WHERE message_id=${message.id} AND decision='pending'`;
 if(approval)await decide(sql,approval.id,'approved','Grounded routine outreach passed all eligibility and independent content checks; fresh-thread dispatch and pacing remain mandatory.','daniel-policy');
 return {status:approval?'approved':'no_pending_approval'};
}
