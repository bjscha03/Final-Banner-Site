import {audit} from './store.mjs';

// One existing researched account per already-reserved discovery slot.
// No independent cadence, no new send path, and no override of qualification.
export async function revalidateBacklog(sql,env,runId,{research,readPage,validate,now=new Date()}={}){
 const [row]=await sql`SELECT o.id AS opportunity_id,a.id AS account_id,a.name,a.website,
 c.id AS contact_id,c.email,c.research
 FROM daniel_sales.opportunities o
 JOIN daniel_sales.accounts a ON a.id=o.account_id
 JOIN daniel_sales.contacts c ON c.account_id=a.id
 WHERE o.stage='researched' AND c.research->>'requires_revalidation'='true'
 AND NOT EXISTS (SELECT 1 FROM daniel_sales.audit_events e
  WHERE e.entity_type='opportunity' AND e.entity_id=o.id::text
  AND (e.event_type IN ('backlog_revalidation_promoted','backlog_revalidation_rejected') OR (e.event_type='backlog_revalidation_retry' AND e.created_at>now()-interval '24 hours')))
 ORDER BY o.created_at,o.id LIMIT 1`;
 if(!row)return null;
 const fail=async(reason,category)=>{
  await audit(sql,'daniel-research','backlog_revalidation_rejected','opportunity',row.opportunity_id,
   {reason:String(reason).slice(0,500),category,run_id:runId,contact_id:row.contact_id});
  await sql`UPDATE daniel_sales.contacts SET research=research ||
   ${JSON.stringify({requires_revalidation:false,revalidation_outcome:'rejected',revalidation_category:category,revalidated_at:now.toISOString()})}::jsonb
   WHERE id=${row.contact_id} AND research->>'requires_revalidation'='true'`;
  return {status:'backlog_rejected',category,opportunityId:row.opportunity_id};
 };
 try{
  const domain=s=>new URL(s).hostname.toLowerCase().replace(/^www\./,'');
  const original=domain(row.website);
  const found=await research(env,
   'Research ONLY the named existing business, not a substitute. Independently search for its current official HTTPS site and publicly listed appropriate general/marketing/operations inbox. Return JSON {company,website,contact_url,email,segment,opportunity,recurring_buyer,facts:[{url,quote}]}; at least two exact official quotes showing US recurring/multi-location end-buyer fit. Do not infer emails. If insufficient return {none:true}.',
   {name:row.name,website:row.website},{search:true});
  if(found.value?.none)return await fail('No independently verified current company/contact evidence','insufficient_evidence');
  const candidate=found.value;
  if(domain(candidate.website)!==original)return await fail('Researched domain does not match existing account','identity_mismatch');
  const urls=[...new Set([candidate.website,candidate.contact_url,...(candidate.facts||[]).map(f=>f.url)])]
   .filter(u=>{try{return new URL(u).protocol==='https:'&&domain(u)===original}catch{return false}}).slice(0,5);
  const pages=[];
  for(const u of urls){try{pages.push({...await readPage(u),requestedUrl:u})}catch{}}
  const related=[...new Set(pages.flatMap(p=>p.links||[]))]
   .filter(u=>{try{return new URL(u).protocol==='https:'&&domain(u)===original&&!urls.includes(u)}catch{return false}}).slice(0,3);
  for(const u of related){try{pages.push({...await readPage(u),requestedUrl:u})}catch{}}
  if(!pages.length)return await fail('No accessible official evidence pages','inaccessible_evidence');
  const extracted=await research(env,
   'Extract only facts actually present in these fetched official pages, never inferred details. Return JSON {company,website,contact_url,email,segment,opportunity,recurring_buyer,facts:[{url,quote}]}; exact contiguous quotes and literal published appropriate business email required. Return {none:true} if incomplete.',
   {website:candidate.website,pages:pages.map(p=>({url:p.url,text:p.text.slice(0,30000)}))});
  if(extracted.value?.none)return await fail('Official pages do not support published inbox and recurring buyer','missing_contact_or_fit');
  const c=extracted.value;
  if(domain(c.website)!==original)return await fail('Extracted identity changed','identity_mismatch');
  let evidence;
  try{evidence=validate(c,pages)}catch(e){return await fail(e.message,'evidence_validation');}
  const [duplicate]=await sql`SELECT id FROM daniel_sales.contacts
   WHERE id<>${row.contact_id} AND lower(email)=${c.email.toLowerCase()} LIMIT 1`;
  const [domainDuplicate]=await sql`SELECT id FROM daniel_sales.accounts
   WHERE id<>${row.account_id} AND split_part(regexp_replace(lower(website),'^https?://(www[.])?',''),'/',1)=${original} LIMIT 1`;
  if(duplicate||domainDuplicate)return await fail('Duplicate email or company domain','duplicate');
  const [suppression]=await sql`SELECT email FROM daniel_sales.suppressions WHERE lower(email)=${c.email.toLowerCase()}`;
  const [blocked]=await sql`SELECT id FROM daniel_sales.contacts WHERE account_id=${row.account_id}
    AND (suppressed_at IS NOT NULL OR replied_at IS NOT NULL) LIMIT 1`;
  if(suppression||blocked)return await fail('Suppressed address or human response','suppressed');
  const review=await research(env,
   'Independently qualify this exact existing corporate prospect using fetched official evidence only. Check US recurring/multi-location END BUYER, appropriate published business email, accurate geographic/quantity claims, exact quotes, specific hypothetical BOF signage use, no print suppliers. Return JSON {approved:boolean,reason:string}.',
   {candidate:c,pages:pages.map(p=>({url:p.url,text:p.text.slice(0,30000)}))});
  if(review.value?.approved!==true)return await fail(review.value?.reason||'Independent review rejected','independent_review');
  evidence.reviewer={response_id:review.responseId,reason:review.value.reason};
  evidence.research_response_id=found.responseId;
  evidence.revalidation_extraction_response_id=extracted.responseId;
  const saved={...evidence,requires_revalidation:false,revalidation_outcome:'promoted',revalidated_at:now.toISOString()};
  await sql`UPDATE daniel_sales.contacts SET email=${c.email.toLowerCase()},
   verified_source_url=${c.contact_url},research=${JSON.stringify(saved)}::jsonb
   WHERE id=${row.contact_id} AND suppressed_at IS NULL AND replied_at IS NULL`;
  const [promoted]=await sql`UPDATE daniel_sales.opportunities SET stage='qualified',
   next_action='Prepare independently reviewed introduction',next_action_at=now()
   WHERE id=${row.opportunity_id} AND stage='researched' RETURNING id`;
  if(!promoted)return await fail('Opportunity no longer researched','concurrent_change');
  await audit(sql,'daniel-research','backlog_revalidation_promoted','opportunity',row.opportunity_id,
   {contact_id:row.contact_id,run_id:runId,review_response_id:review.responseId,no_send_authorized:true});
  return {status:'backlog_promoted',opportunityId:row.opportunity_id};
 }catch(e){
  // Provider/network errors are retryable; do not misclassify as failed evidence.
  await audit(sql,'daniel-research','backlog_revalidation_retry','opportunity',row.opportunity_id,
   {reason:String(e.message).slice(0,350),run_id:runId});
  return {status:'backlog_retry',reason:String(e.message).slice(0,200)};
 }
}
