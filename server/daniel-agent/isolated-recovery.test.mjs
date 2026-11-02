import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from './migrate.mjs';
import { createProspect,saveDraft,requestApproval,decide } from './store.mjs';
import { dispatch } from './dispatch.mjs';
import { ingest } from './mail-sync.mjs';
import { routeApproval } from './automation.mjs';
import { replyHash } from './reply-review.mjs';
import { reviewFollowup } from './followup-review.mjs';
import { generateReviewedFollowup } from './reviewed-followup.mjs';
import { generateDraft } from './ai.mjs';
import { discover } from './discovery.mjs';
import { DRAFT_CONTRACT,contentHash,followupHash,currentFollowupReview,recoveryEligibility } from './recovery-policy.mjs';
import { routinePolicyText } from './policy.mjs';

const knowledge={version:'test-kb',facts:{products:['vinyl banners'],vinyl_banner_shipping:'Free Next-Day Air shipping in the U.S. for qualifying orders of $20 or more'}};
const controls={paused:false,cold_outreach_paused:false,required_draft_contract:DRAFT_CONTRACT};
function message(kind='followup') {
 const m={kind,subject:'Event banners',body:'A reusable entrance banner can identify your event check-in. Would a reusable layout help?',contact_id:'fixture-contact',thread_key:'fixture-thread',reply_to_id:'<fixture-parent@test>',ai_metadata:{generation_contract:DRAFT_CONTRACT,knowledge_version:knowledge.version,requires_approval:false,model_requires_approval:false,classification:'needs_review',model_classification:kind==='followup'?'followup':'routine_product',fact_ids:['products']}};
 if(kind==='followup')m.ai_metadata.followup_review={approved:true,response_id:'test-review',content_hash:followupHash(m),knowledge_version:knowledge.version};
 if(kind==='intro')m.ai_metadata.research_review={approved:true,response_id:'test-review',content_hash:contentHash(m)};
 if(kind==='reply'){
  m.ai_metadata.reply_recipient='buyer@example.test';
  m.ai_metadata.conversation_review={approved:true,response_id:'test-review',content_hash:replyHash(m),inbound_rfc:m.reply_to_id,knowledge_version:knowledge.version};
 }
 return m;
}

test('recovery: emergency pause overrides every message type and cold pause allows only reviewed replies',()=>{
 for(const kind of ['intro','followup','reply'])assert.equal(recoveryEligibility(message(kind),{...controls,paused:true},knowledge).ok,false);
 for(const kind of ['intro','followup'])assert.equal(recoveryEligibility(message(kind),{...controls,cold_outreach_paused:true},knowledge).reason,'cold_outreach_paused');
 assert.equal(recoveryEligibility(message('reply'),{...controls,cold_outreach_paused:true},knowledge).ok,true);
});
test('recovery: old drafts, unknown contracts, stale facts and explicit review flags fail closed',()=>{
 const cases=[{generation_contract:null},{generation_contract:'future-unknown'},{requires_approval:true},{model_requires_approval:true},{model_requires_approval:undefined},{knowledge_version:'stale'},{fact_ids:['invented']}];
 for(const patch of cases){const m=message();m.ai_metadata={...m.ai_metadata,...patch};assert.equal(recoveryEligibility(m,controls,knowledge).ok,false);}
 assert.equal(recoveryEligibility(message(),{...controls,required_draft_contract:'unknown'},knowledge).ok,false);
});
test('recovery: follow-up review is bound to body, subject, contact, thread and parent',()=>{
 const m=message();assert.equal(currentFollowupReview(m),true);
 for(const field of ['body','subject','contact_id','thread_key','reply_to_id'])assert.equal(currentFollowupReview({...m,[field]:m[field]+'changed'}),false);
 for(const approved of [false,'true',null])assert.equal(currentFollowupReview({...m,ai_metadata:{...m.ai_metadata,followup_review:{...m.ai_metadata.followup_review,approved}}}),false);
});
test('recovery: fresh introduction and reply still need exact independent approval',()=>{
 for(const kind of ['intro','reply']){
  const m=message(kind);assert.equal(recoveryEligibility(m,controls,knowledge).ok,true);
  assert.equal(recoveryEligibility({...m,body:m.body+' changed'},controls,knowledge).ok,false);
 }
 const m=message('reply');m.ai_metadata.conversation_review.knowledge_version='old';assert.equal(recoveryEligibility(m,controls,knowledge).ok,false);
});
test('recovery: approval routing never opens or mutates a legacy draft',async()=>{
 const m={...message(),status:'pending_approval',ai_metadata:{}};
 const sql=()=>{throw Error('Legacy draft must not be queried or mutated');};
 assert.equal((await routeApproval(sql,m,{...controls,auto_reply:true})).status,'legacy_hold');
});
test('recovery: cold-paused discovery does not research or touch pending introductions',async()=>{
 const sql=()=>{throw Error('No database work during prospecting hold');};
 assert.equal((await discover(sql,{}, {auto_prospect:true,cold_outreach_paused:true})).status,'cold_outreach_paused');
});
test('recovery: hyphenated vinyl wording only exempts the exact published shipping threshold',()=>{
 const phrase='Our vinyl-banner production includes free next-day air shipping on orders of $20 or more.';
 assert.ok(!routinePolicyText(phrase,knowledge.facts).includes('$20'));
 for(const text of [phrase.replace('$20','$25'),phrase.replace('vinyl-banner','yard-sign'),phrase.replace('free next-day air shipping','a custom price')])assert.match(routinePolicyText(text,knowledge.facts),/\$/);
 assert.match(routinePolicyText(phrase,{}),/\$20/);
 assert.match(routinePolicyText(phrase+' Our custom price is $40.',knowledge.facts),/\$40/);
});
test('follow-up review: human reply or missing sent parent prevents an AI call',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('Should not call AI');};
 const m=message();
 assert.equal((await reviewFollowup(async()=>[{direction:'inbound',classification:'needs_review',body:'Forwarded to Marketing'}],m,knowledge,{OPENAI_API_KEY:'test'},fetcher)).approved,false);
 assert.equal((await reviewFollowup(async()=>[],m,knowledge,{OPENAI_API_KEY:'test'},fetcher)).approved,false);
 assert.equal(calls,0);
});
test('follow-up review: validates response schema and binds approval to the real parent',async()=>{
 const m=message(),prior={direction:'outbound',rfc_message_id:m.reply_to_id,body:'Previous actual email'};
 const sql=async strings=>{const q=strings.join('?');assert.match(q,/status IN \('sent','simulated'\)/);return [prior];};
 for(const result of [null,[],{approved:'true',reason:'Invalid boolean'}]){
  const fetcher=async()=>Response.json({id:'test',choices:[{message:{content:JSON.stringify(result)}}]});
  assert.equal((await reviewFollowup(sql,m,knowledge,{OPENAI_API_KEY:'test'},fetcher)).approved,false);
 }
 const fetcher=async(_url,init)=>{const p=JSON.parse(init.body);assert.equal(JSON.parse(p.messages[1].content).conversation[0].body,prior.body);return Response.json({id:'test-accepted',choices:[{message:{content:JSON.stringify({approved:true,reason:'Specific useful next step'})}}]});};
 const review=await reviewFollowup(sql,m,knowledge,{OPENAI_API_KEY:'test'},fetcher);
 assert.equal(currentFollowupReview({...m,ai_metadata:{...m.ai_metadata,followup_review:review}}),true);
});
test('follow-up revisions: rejection feedback is used but three rejections never become approval',async()=>{
 const sql=async()=>[knowledge];let generations=0,reviews=0;const feedbacks=[];
 const generator=async(_sql,_id,_kind,_env,_fetcher,_attempt,feedback)=>{generations++;feedbacks.push(feedback);const m=message();delete m.ai_metadata.followup_review;return m;};
 const rejected=async(_sql,m)=>{reviews++;return {approved:false,reason:'Repeats the previous pitch',response_id:'review-'+reviews,content_hash:followupHash(m),knowledge_version:knowledge.version};};
 const held=await generateReviewedFollowup(sql,'fixture-contact',{}, {generator,reviewer:rejected});
 assert.equal(generations,3);assert.equal(reviews,3);assert.equal(held.requires_approval,true);assert.equal(held.ai_metadata.followup_review.approved,false);assert.match(feedbacks[1],/Repeats the previous pitch/);
 generations=0;reviews=0;
 const eventual=async(s,m)=>{const value=await rejected(s,m);return {...value,approved:reviews===2};};
 const approved=await generateReviewedFollowup(sql,'fixture-contact',{}, {generator,reviewer:eventual});
 assert.equal(generations,2);assert.equal(currentFollowupReview(approved),true);
});
test('follow-up revisions: unavailable independent review fails closed without repeated model calls',async()=>{
 let calls=0;const generator=async()=>{calls++;return message();};
 await assert.rejects(generateReviewedFollowup(async()=>[knowledge],'fixture-contact',{}, {generator,reviewer:async()=>({approved:false,reason:'Unavailable'})}),/unavailable/);
 assert.equal(calls,1);
});

function adapter(db){
 function sql(strings,...values){const text=typeof strings==='string'?strings:strings.reduce((a,s,i)=>a+(i?'$'+i:'')+s,'');if(typeof strings==='string')values=values[0]||[];return {q:{text,values},then(resolve,reject){return db.query(text,values).then(r=>r.rows).then(resolve,reject);}};}
 sql.transaction=queries=>db.transaction(async tx=>{const out=[];for(const p of queries)out.push((await tx.query(p.q.text,p.q.values)).rows);return out;});return sql;
}
async function databaseFixture(){
 const db=new PGlite(),sql=adapter(db);await migrate(sql);
 await db.exec('CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(integer,integer) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$');
 await sql`UPDATE daniel_sales.settings SET paused=false,cold_outreach_paused=false,required_draft_contract=${DRAFT_CONTRACT},auto_reply=true,auto_prospect=true WHERE id=1`;
 const [kb]=await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;
 let serial=0;
 const prospect=()=>{serial++;return createProspect(sql,{name:'Test Event Group '+serial,segment:'event venue',website:'https://example.test',source_url:'https://example.test/contact',contact_name:'Verified business team',email:'buyer'+serial+'@example.test'},'test');};
 const queue=async input=>{const m=await saveDraft(sql,input,'test');await requestApproval(sql,m.id,'test');const [a]=await sql`SELECT id FROM daniel_sales.approvals WHERE message_id=${m.id}`;await decide(sql,a.id,'approved','Controlled test fixture','test');return m;};
 return {db,sql,kb,prospect,queue};
}
const preview={DANIEL_AGENT_MODE:'preview'};

test('database recovery: legacy pending and queued records remain unchanged while a fresh reviewed weekend reply is processed',async()=>{
 const f=await databaseFixture();try{
  const p=await f.prospect(),[c]=await f.sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  const legacy=await f.queue({contact_id:c.id,kind:'intro',subject:'Legacy',body:'Do not release this old draft.'});
  const pending=await saveDraft(f.sql,{contact_id:c.id,kind:'intro',subject:'Old pending',body:'Unreviewed legacy content'},'test');await requestApproval(f.sql,pending.id,'test');
  const incoming={id:'test-inbound',threadId:'test-thread',payload:{mimeType:'text/plain',headers:[{name:'From',value:c.email},{name:'Message-ID',value:'<test-inbound@example.test>'}],body:{data:Buffer.from('Which products do you sell?').toString('base64url')}}};await ingest(f.sql,incoming);
  const fresh={contact_id:c.id,kind:'reply',subject:'Re: Products',body:'We offer vinyl banners.',thread_key:incoming.threadId,reply_to_id:'<test-inbound@example.test>',ai_metadata:{generation_contract:DRAFT_CONTRACT,knowledge_version:f.kb.version,requires_approval:false,model_requires_approval:false,model_classification:'routine_product',classification:'needs_review',fact_ids:['products'],reply_recipient:c.email}};
  fresh.ai_metadata.conversation_review={approved:true,response_id:'test-review',inbound_rfc:fresh.reply_to_id,content_hash:replyHash(fresh),knowledge_version:f.kb.version};
  const m=await f.queue(fresh);
  await f.sql`UPDATE daniel_sales.settings SET cold_outreach_paused=true WHERE id=1`;
  const result=await dispatch(f.sql,preview,null,{now:new Date('2026-11-01T16:00:00Z')});
  assert.equal(result.simulated,1);assert.equal((await f.sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'simulated');
  assert.equal((await f.sql`SELECT status FROM daniel_sales.messages WHERE id=${legacy.id}`)[0].status,'queued');
  assert.equal((await f.sql`SELECT status FROM daniel_sales.messages WHERE id=${pending.id}`)[0].status,'pending_approval');
  assert.equal((await f.sql`SELECT count(*)::int AS n FROM daniel_sales.approvals WHERE message_id=${pending.id} AND decision='pending'`)[0].n,1);
 }finally{await f.db.close();}
});
test('database recovery: a fresh follow-up cannot dispatch until its independent exact-thread review passes',async()=>{
 const f=await databaseFixture();try{
  const p=await f.prospect();const prior=await saveDraft(f.sql,{contact_id:p.contact_id,kind:'intro',subject:'Event banners',body:'Original invitation'},'test');
  await f.sql`UPDATE daniel_sales.messages SET status='sent',thread_key='follow-thread',rfc_message_id='<prior@test>',sent_at='2026-10-01',updated_at='2026-10-01' WHERE id=${prior.id}`;
  const input={...message(),contact_id:p.contact_id,thread_key:'follow-thread',reply_to_id:'<prior@test>',ai_metadata:{...message().ai_metadata,knowledge_version:f.kb.version,followup_review:null}};
  const m=await f.queue(input);
  assert.equal((await dispatch(f.sql,preview,null,{now:new Date('2026-11-02T15:00:00Z')})).simulated,0);
  const review={approved:true,response_id:'test-reviewed',content_hash:followupHash(input),knowledge_version:f.kb.version};
  await f.sql`UPDATE daniel_sales.messages SET ai_metadata=ai_metadata || ${JSON.stringify({followup_review:review})}::jsonb WHERE id=${m.id}`;
  assert.equal((await dispatch(f.sql,preview,null,{now:new Date('2026-11-02T15:00:00Z')})).simulated,1);
 }finally{await f.db.close();}
});
test('database recovery: a cold hold set during the fresh conversation check blocks the provider call and releases quota',async()=>{
 const f=await databaseFixture();try{
  const p=await f.prospect(),[c]=await f.sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  const prior=await saveDraft(f.sql,{contact_id:c.id,kind:'intro',subject:'Event banners',body:'Original invitation'},'test');
  await f.sql`UPDATE daniel_sales.messages SET status='sent',thread_key='race-thread',rfc_message_id='<race-parent@test>',sent_at='2026-10-01',updated_at='2026-10-01' WHERE id=${prior.id}`;
  const input={...message(),contact_id:c.id,thread_key:'race-thread',reply_to_id:'<race-parent@test>',ai_metadata:{...message().ai_metadata,knowledge_version:f.kb.version}};
  input.ai_metadata.followup_review={approved:true,response_id:'race-review',content_hash:followupHash(input),knowledge_version:f.kb.version};
  const m=await f.queue(input);let sends=0;
  const request=async()=>{await f.sql`UPDATE daniel_sales.settings SET cold_outreach_paused=true WHERE id=1`;return {id:'race-thread',messages:[{id:'race-sent',threadId:'race-thread',labelIds:['SENT'],payload:{headers:[{name:'From',value:'info@bannersonthefly.com'},{name:'To',value:c.email},{name:'Message-ID',value:'<race-parent@test>'}]}}]};};
  await dispatch(f.sql,{DANIEL_AGENT_MODE:'live',DANIEL_CUTOVER_APPROVED:'true',CONTEXT:'production',DANIEL_SENDER_EMAIL:'info@bannersonthefly.com'},'test-token',{now:new Date('2026-11-02T15:00:00Z'),verifyIdentity:async()=>{},request,send:async()=>{sends++;throw Error('Must never send');}});
  assert.equal(sends,0);assert.equal((await f.sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'blocked');
  assert.equal(Number((await f.sql`SELECT coalesce(sum(reserved_count),0) AS n FROM daniel_sales.daily_limits`)[0].n),0);
 }finally{await f.db.close();}
});
test('database recovery: generator marks fresh drafts and never adds an unsolicited follow-up offer',async()=>{
 const f=await databaseFixture();try{
  const p=await f.prospect(),env={OPENAI_API_KEY:'unit-test-key',DANIEL_PROMO_SIGNING_SECRET:'unit-test-team-offer-key-at-least-32-characters'};
  const model=classification=>async()=>Response.json({model:'test',choices:[{message:{content:JSON.stringify({subject:'Reusable event banners',body:'Would a reusable vinyl entrance banner help your event team?',classification,requires_approval:false,reason:'Approved product information',fact_ids:['products']})}}]});
  const follow=await generateDraft(f.sql,p.contact_id,'followup',env,model('followup'));
  assert.equal(follow.ai_metadata.generation_contract,DRAFT_CONTRACT);assert.equal(follow.ai_metadata.team_offer,null);assert.ok(!follow.body.includes('25%'));
  const intro=await generateDraft(f.sql,p.contact_id,'intro',env,model('routine_product'));
  assert.ok(intro.body.includes('25% off sitewide'));assert.ok(intro.ai_metadata.team_offer.code);
  const held=await generateDraft(f.sql,p.contact_id,'intro',env,model('needs_review'));
  assert.equal(held.requires_approval,true);assert.equal(held.ai_metadata.model_requires_approval,false);assert.equal(held.ai_metadata.model_classification,'needs_review');
 }finally{await f.db.close();}
});
