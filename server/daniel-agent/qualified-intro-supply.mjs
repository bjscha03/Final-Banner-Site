import {reviewedIntroduction} from './discovery.mjs';
import {saveDraft,audit} from './store.mjs';
import {routeApproval} from './automation.mjs';

// Rebuild only failed/held introduction drafts for currently verified qualified accounts.
// Existing approvals, queued/sent messages, and reply threads are never touched.
export async function replenishQualifiedIntroductions(sql,env,settings,{now=new Date(),draft,review}={}){
 if(settings.paused || settings.cold_outreach_paused || !settings.auto_prospect)return {status:'disabled'};
 const [candidate]=await sql`SELECT o.id AS opportunity_id,c.id AS contact_id,c.research
  FROM daniel_sales.opportunities o
  JOIN daniel_sales.contacts c ON c.account_id=o.account_id
  WHERE o.stage='qualified' AND c.suppressed_at IS NULL AND c.replied_at IS NULL
  AND c.research->>'verified'='true' AND c.research->>'requires_revalidation' IS DISTINCT FROM 'true'
  AND (c.research->>'verified_at')::timestamptz>${new Date(+now-7*86400000)}
  AND c.research->'reviewer'->>'response_id' IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM daniel_sales.suppressions s WHERE lower(s.email)=lower(c.email))
  AND NOT EXISTS(SELECT 1 FROM daniel_sales.contacts peer WHERE peer.account_id=c.account_id AND peer.replied_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM daniel_sales.audit_events e WHERE e.entity_type='opportunity' AND e.entity_id=o.id::text AND e.event_type IN ('qualified_intro_review_failed','qualified_intro_rebuild_failed') AND e.created_at>now()-interval '2 hours')
  AND EXISTS(SELECT 1 FROM daniel_sales.messages old WHERE old.contact_id=c.id AND old.kind='intro' AND old.status='draft')
  AND NOT EXISTS(SELECT 1 FROM daniel_sales.messages m WHERE m.contact_id=c.id AND m.kind='intro' AND m.status IN ('queued','sending','sent','uncertain','pending_approval'))
  AND NOT EXISTS(SELECT 1 FROM daniel_sales.messages m WHERE m.contact_id=c.id AND m.kind='intro' AND m.idempotency_key=('qualified-rebuild:' || c.id::text))
  ORDER BY o.next_action_at,o.id LIMIT 1`;
 if(!candidate)return {status:'no_eligible_qualified_drafts'};
 try{
  const [previous]=await sql`SELECT metadata_json->>'reason' AS reason FROM daniel_sales.audit_events
   WHERE entity_type='opportunity' AND entity_id=${candidate.opportunity_id}::text
   AND event_type='qualified_intro_review_failed' ORDER BY id DESC LIMIT 1`;
  // Feed the actual independent veto into the next bounded rewrite attempt.
  const generated=await reviewedIntroduction(sql,env,candidate.contact_id,candidate.research,
   {draft,research:review,feedback:previous?.reason || null});
  if(generated.ai_metadata?.research_review?.approved!==true){
   await audit(sql,'daniel-worker','qualified_intro_review_failed','opportunity',candidate.opportunity_id,{reason:generated.ai_metadata?.research_review?.reason||'independent_content_rejected'});
   return {status:'content_rejected'};
  }
  const message=await saveDraft(sql,{...generated,idempotency_key:'qualified-rebuild:'+candidate.contact_id},'daniel-worker');
  const outcome=await routeApproval(sql,message,settings,env);
  await audit(sql,'daniel-worker','qualified_intro_rebuilt','opportunity',candidate.opportunity_id,
   {message_id:message.id,approval_status:outcome.status,no_send_bypass:true});
  return {status:'reviewed',approvalStatus:outcome.status};
 }catch(e){
  await audit(sql,'daniel-worker','qualified_intro_rebuild_failed','opportunity',candidate.opportunity_id,
   {reason:String(e.message).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,250)});
  return {status:'failed'};
 }
}
