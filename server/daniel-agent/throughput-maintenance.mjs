// Daniel throughput maintenance. Defaults to read-only; --apply is explicit.
// Run from a production job with DANIEL_DATABASE_URL and DANIEL_AGENT_MODE=live.
// Never changes settings, suppressions, reply handling, or dispatch quotas.
import {database} from './db.mjs';
import {audit} from './store.mjs';

export async function throughputMaintenance(sql,{apply=false,now=new Date()}={}){
 const settings=(await sql`SELECT * FROM daniel_sales.settings WHERE id=1`)[0];
 if(!settings || settings.auto_reply!==false || settings.reply_mode!=='manual_only' ||
    settings.intro_daily_limit!==25 || settings.followup_daily_limit!==15 ||
    settings.outreach_pacing_enabled!==true)throw Error('Production guardrails mismatch');
 const opportunities=await sql`SELECT o.id,o.stage,o.next_action,o.next_action_at,a.id AS account_id,a.website,
  c.id AS contact_id,c.email,c.verified_source_url,c.suppressed_at,c.replied_at,c.research
  FROM daniel_sales.opportunities o JOIN daniel_sales.accounts a ON a.id=o.account_id
  LEFT JOIN LATERAL (SELECT * FROM daniel_sales.contacts WHERE account_id=a.id ORDER BY created_at LIMIT 1)c ON true`;
 const suppressions=await sql`SELECT lower(email) AS email FROM daniel_sales.suppressions`;
 const suppressed=new Set(suppressions.map(s=>s.email));
 const byEmail=new Map(),byHost=new Map();
 const host=s=>{try{return new URL(s).hostname.toLowerCase().replace(/^www\\./,'')}catch{return ''}};
 for(const o of opportunities){
  const email=(o.email||'').trim().toLowerCase(),domain=host(o.website);
  if(email)byEmail.set(email,(byEmail.get(email)||0)+1);
  if(domain)byHost.set(domain,(byHost.get(domain)||0)+1);
 }
 const breakdown={promoted:0,duplicate:0,suppressed:0,missing_contact_data:0,other:0};
 const reasons={};
 for(const o of opportunities.filter(x=>x.stage==='researched')){
  const email=(o.email||'').trim().toLowerCase(),domain=host(o.website),r=o.research||{};
  let reason;
  if(o.suppressed_at || (email&&suppressed.has(email)) || o.replied_at)reason='suppressed';
  else if((email&&byEmail.get(email)>1)||(domain&&byHost.get(domain)>1))reason='duplicate';
  else if(!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || !o.verified_source_url || !domain)reason='missing_contact_data';
  else if(r.verified!==true || r.recurring_buyer!==true || !r.reviewer?.response_id ||
   !Number.isFinite(Date.parse(r.verified_at)) || now-Date.parse(r.verified_at)>7*86400000 ||
   now-Date.parse(r.verified_at)<0 || !Array.isArray(r.facts) || r.facts.length<2)reason='other';
  if(reason){breakdown[reason]++;reasons[o.id]=reason;continue;}
  // Verified contact evidence is necessary but not sufficient for an introduction.
  // The worker still independently reviews the actual message before queueing.
  breakdown.promoted++;
  if(apply){
   await sql`UPDATE daniel_sales.opportunities SET stage='qualified' WHERE id=${o.id} AND stage='researched'`;
   await audit(sql,'daniel-maintenance','revalidated_qualified','opportunity',o.id,{evidence:'current_verified_research',no_send_authorized:true});
  }
 }
 const approvals=await sql`SELECT a.id,a.message_id,a.request_type,m.status AS message_status,m.kind,m.contact_id,
  m.ai_metadata,c.suppressed_at,c.replied_at,c.research
  FROM daniel_sales.approvals a LEFT JOIN daniel_sales.messages m ON m.id=a.message_id
  LEFT JOIN daniel_sales.contacts c ON c.id=m.contact_id WHERE a.decision='pending'`;
 let approvalsClosed=0,approvalsRetained=0;
 for(const a of approvals){
  const reason=!a.message_id?'missing_message':a.kind==='reply'?'manual_reply_only':
   a.suppressed_at?'suppressed':a.replied_at?'human_reply_received':
   a.message_status!=='pending_approval'?'stale_message_status':
   a.kind==='intro' && (a.research?.verified!==true || !a.ai_metadata?.research_review?.approved)?'missing_current_independent_review':
   a.ai_metadata?.generation_contract!==settings.required_draft_contract?'legacy_contract':'requires_manual_exception_review';
  if(reason==='requires_manual_exception_review'){approvalsRetained++;continue;}
  approvalsClosed++;
  if(apply){
   await sql`UPDATE daniel_sales.approvals SET decision='rejected',decided_at=now(),decided_by='daniel-maintenance',
    decision_note=${'Superseded after eligibility review: '+reason} WHERE id=${a.id} AND decision='pending'`;
   await audit(sql,'daniel-maintenance','stale_approval_closed','approval',a.id,{reason});
  }
 }
 const failed=await sql`SELECT t.id,t.contact_id,t.attempt_count,t.note,c.suppressed_at,c.replied_at,
  c.research FROM daniel_sales.tasks t LEFT JOIN daniel_sales.contacts c ON c.id=t.contact_id
  WHERE t.kind='followup' AND t.status='needs_review' AND t.attempt_count>=3`;
 let failedClosed=0,failedHeld=0;
 for(const t of failed){
  const reason=!t.contact_id?'missing_contact':t.suppressed_at?'suppressed':
   t.replied_at?'human_reply_received':t.research?.verified!==true?'unverified_contact':null;
  if(!reason){failedHeld++;continue;}
  failedClosed++;
  if(apply){
   await sql`UPDATE daniel_sales.tasks SET status='cancelled',note=${'Closed after maintenance eligibility review: '+reason+'; previous attempts retained'} WHERE id=${t.id} AND status='needs_review'`;
   await audit(sql,'daniel-maintenance','failed_followup_closed','task',t.id,{reason,attempts:t.attempt_count});
  }
 }
 // An overdue researched action with no approved next step is not a due send.
 let datesCleared=0;
 for(const o of opportunities){
  if(o.stage!=='researched' || !o.next_action_at || new Date(o.next_action_at)>=now)continue;
  datesCleared++;
  if(apply){
   await sql`UPDATE daniel_sales.opportunities SET next_action_at=NULL,next_action='Await evidence-based revalidation' WHERE id=${o.id} AND stage='researched'`;
   await audit(sql,'daniel-maintenance','stale_next_action_cleared','opportunity',o.id,{previous_due_at:o.next_action_at});
  }
 }
 const result={mode:apply?'apply':'dry_run',baseline:{researched:opportunities.filter(o=>o.stage==='researched').length,
 qualified:opportunities.filter(o=>o.stage==='qualified').length,overdue:opportunities.filter(o=>o.next_action_at&&new Date(o.next_action_at)<now).length,
 pendingApprovals:approvals.length,failedFollowups:failed.length},breakdown,
 approvals:{closed:approvalsClosed,retained:approvalsRetained},
 failedFollowups:{closed:failedClosed,held:failedHeld},staleDatesCleared:datesCleared};
 return result;
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
 const apply=process.argv.includes('--apply');
 const sql=database(process.env);
 const result=await throughputMaintenance(sql,{apply});
 console.log(JSON.stringify(result,null,2));
 if(result.failedFollowups.held)process.exitCode=2;
}
