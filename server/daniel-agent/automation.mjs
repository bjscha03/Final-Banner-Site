import { approvedOfferText } from './team-offer.mjs';
import { routinePolicyText } from './policy.mjs';
import { createHash } from 'node:crypto';
import { approvalNeeded } from './operations.mjs';
import { requestApproval,decide,audit } from './store.mjs';
import { reviewReply,currentReplyReview } from './reply-review.mjs';
import { reviewFollowup } from './followup-review.mjs';
import { DRAFT_CONTRACT,currentFollowupReview,followupHash,recoveryEligibility } from './recovery-policy.mjs';

export function routineEligible(message,knowledge,env=process.env) {
 const meta=message.ai_metadata;
 if(!['reply','followup'].includes(message.kind) || !meta || meta.requires_approval!==false) return false;
 const acknowledgment=message.kind==='reply' && currentReplyReview(message) && meta.conversation_review.acknowledgment_only===true;
 if(meta.knowledge_version!==knowledge.version || !Array.isArray(meta.fact_ids) || (!meta.fact_ids.length && !acknowledgment) || !meta.fact_ids.every(k=>Object.hasOwn(knowledge.facts,k))) return false;
 if(message.kind==='reply' && (meta.classification!=='needs_review' || meta.model_classification!=='routine_product' || !currentReplyReview(message))) return false;
 if(message.kind==='followup' && meta.model_classification!=='followup') return false;
 const body=routinePolicyText(approvedOfferText(message.subject+'\n'+message.body,meta.team_offer,env),knowledge.facts);
 if(approvalNeeded(body) || /\$|\d\s*%|\b(price|pricing|quote|refund|complaint|payment|invoice|contract|guarantee|discount|meeting|appointment|schedule a call|net\s*\d|credit|password|credentials|supplier)\b/i.test(body)) return false;
 return true;
}
export function introductionEligible(message,knowledge,research,now=new Date(),env=process.env) {
 const meta=message.ai_metadata || {},hash=createHash('sha256').update(message.subject+'\n'+message.body).digest('hex');
 return message.kind==='intro' && research?.verified===true && research.recurring_buyer===true && +now-Date.parse(research.verified_at)>=0 && +now-Date.parse(research.verified_at)<7*86400000 && research.reviewer?.response_id && meta.research_review?.approved===true && meta.research_review?.content_hash===hash && routineEligible({...message,kind:'followup',ai_metadata:{...meta,model_classification:'followup'}},knowledge,env);
}
export async function routeApproval(sql,message,settings,env=process.env,{reviewer=reviewReply,followupReviewer=reviewFollowup}={}) {
 if(!['draft','pending_approval'].includes(message.status)) return {status:'not_reviewable'};
 // Legacy drafts remain untouched and unresolved during isolated recovery.
 if(settings.required_draft_contract && (settings.required_draft_contract!==DRAFT_CONTRACT || message.ai_metadata?.generation_contract!==DRAFT_CONTRACT)) return {status:'legacy_hold'};
 if(settings.cold_outreach_paused && message.kind!=='reply') return {status:'cold_outreach_hold'};
 await requestApproval(sql,message.id,'daniel-worker');
 if(!(message.kind==='intro'?settings.auto_prospect:settings.auto_reply)) return {status:'automation_disabled'};
 const [knowledge]=await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;
 if(message.kind==='reply' && message.ai_metadata?.requires_approval===false && !currentReplyReview(message)) {
  const review=await reviewer(sql,message,knowledge,env);
  await sql`UPDATE daniel_sales.messages SET ai_metadata=ai_metadata || ${JSON.stringify({conversation_review:review})}::jsonb WHERE id=${message.id} AND status IN ('draft','pending_approval')`;
  await audit(sql,'daniel-review','reply_context_reviewed','message',message.id,{approved:review.approved===true,reason:review.reason,response_id:review.response_id || null});
  message={...message,ai_metadata:{...message.ai_metadata,conversation_review:review}};
 }
 if(message.kind==='followup' && message.ai_metadata?.generation_contract===DRAFT_CONTRACT && message.ai_metadata?.requires_approval===false && !currentFollowupReview(message)) {
  const prior=message.ai_metadata?.followup_review;
  // An exact-content independent rejection is a hold, never a retry-until-pass loop.
  if(prior?.approved===false && prior?.response_id && prior.content_hash===followupHash(message)) return {status:'independent_review_hold'};
  const review=await followupReviewer(sql,message,knowledge,env);
  await sql`UPDATE daniel_sales.messages SET ai_metadata=ai_metadata || ${JSON.stringify({followup_review:review})}::jsonb WHERE id=${message.id} AND status IN ('draft','pending_approval')`;
  await audit(sql,'daniel-review','followup_context_reviewed','message',message.id,{approved:review.approved===true,reason:review.reason,response_id:review.response_id || null});
  message={...message,ai_metadata:{...message.ai_metadata,followup_review:review}};
  if(!currentFollowupReview(message)) return {status:'independent_review_hold'};
 }
 if(settings.required_draft_contract) {
  // Reviewing a draft while paused does not dispatch it. Global pause remains
  // enforced independently by the worker, database claims and dispatcher.
  const gate=recoveryEligibility(message,{...settings,paused:false},knowledge);
  if(!gate.ok) return {status:'policy_hold',reason:gate.reason};
 }
 if(message.kind==='intro') {
  const [contact]=await sql`SELECT research,suppressed_at FROM daniel_sales.contacts WHERE id=${message.contact_id}`;
  if(contact?.suppressed_at || !introductionEligible(message,knowledge,contact?.research,new Date(),env))return {status:'policy_hold'};
 } else if(!routineEligible(message,knowledge,env))return {status:'policy_hold'};
 const [approval]=await sql`SELECT id FROM daniel_sales.approvals WHERE message_id=${message.id} AND decision='pending'`;
 if(approval)await decide(sql,approval.id,'approved','Grounded routine draft passed policy and applicable independent content review; fresh-thread dispatch checks remain mandatory.','daniel-policy');
 return {status:approval?'approved':'no_pending_approval'};
}
