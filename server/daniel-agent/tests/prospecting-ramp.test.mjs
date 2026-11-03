import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createTestDatabase,TEST_NOW} from './test-database.mjs';
import {createProspect,saveDraft,requestApproval,decide,suppress} from '../store.mjs';
import {dispatch,finish} from '../dispatch.mjs';
import {ingest} from '../mail-sync.mjs';
import {runWorker} from '../worker.mjs';
import {routeApproval,businessException} from '../automation.mjs';
import {handler} from '../api.mjs';
import {MIGRATION_FILES,statements} from '../migrate.mjs';
import {DRAFT_CONTRACT,contentHash,followupHash} from '../recovery-policy.mjs';
import {dailyLimit,configurationReady,automationEnabled,sendKindAllowed,pacedAllowance,discoverySlot,discoveryLimit,controlsSnapshot} from '../outreach-controls.mjs';
let f,sql,kb,serial=0;
const now=new Date(TEST_NOW),preview={DANIEL_AGENT_MODE:'preview'};
const env={...preview,DANIEL_ALLOWED_HOST:'preview.test',DANIEL_ADMIN_PASSWORD:'test-password-only',DANIEL_SESSION_SECRET:'test-encryption-key-longer-than-32-characters'};
test.beforeEach(async t=>{t.mock.timers.enable({apis:['Date'],now});f=await createTestDatabase({strictContract:DRAFT_CONTRACT,pacing:true});sql=f.sql;[kb]=await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;});
test.afterEach(async()=>{if(f)await f.close();});
async function prospect(){serial++;const p=await createProspect(sql,{name:'Fictional Test Events '+serial,segment:'recurring event venue',website:'https://example.test',source_url:'https://example.test/contact',contact_name:'Test business team',email:'events'+serial+'@example.test'},'test');await sql`UPDATE daniel_sales.contacts SET research=${JSON.stringify({verified:true,recurring_buyer:true,verified_at:new Date().toISOString(),reviewer:{response_id:'fixture-qualification'}})}::jsonb WHERE id=${p.contact_id}`;return p;}
function draft(p,kind='intro',body='A reusable entrance banner can identify your event check-in. Would a reusable layout help?'){
 const m={contact_id:p.contact_id,kind,subject:'Reusable event entrance banner',body,thread_key:kind==='followup'?'fixture-'+p.contact_id:null,reply_to_id:kind==='followup'?'<parent-'+p.contact_id+'@test>':null,ai_metadata:{generation_contract:DRAFT_CONTRACT,knowledge_version:kb.version,requires_approval:false,model_requires_approval:false,model_classification:kind==='followup'?'followup':'routine_product',fact_ids:['products']}};
 if(kind==='intro')m.ai_metadata.research_review={approved:true,response_id:'fixture-content-review',content_hash:contentHash(m)};
 if(kind==='followup')m.ai_metadata.followup_review={approved:true,response_id:'fixture-content-review',content_hash:followupHash(m),knowledge_version:kb.version};
 return m;
}
async function queue(p,kind='intro'){
 const m=await saveDraft(sql,draft(p,kind),'test');await requestApproval(sql,m.id,'test');
 const [a]=await sql`SELECT id FROM daniel_sales.approvals WHERE message_id=${m.id}`;await decide(sql,a.id,'approved','Controlled fixture, no real mail','test');return m;
}
async function settings(){return (await sql`SELECT * FROM daniel_sales.settings WHERE id=1`)[0];}
async function setClock(t,value){t.mock.timers.setTime(+new Date(value));await f.setClock(value);}
async function prior(p){const m=await saveDraft(sql,{contact_id:p.contact_id,kind:'intro',subject:'Reusable event entrance banner',body:'Previous actual fixture invitation'},'test');await sql`UPDATE daniel_sales.messages SET status='simulated',thread_key=${'fixture-'+p.contact_id},rfc_message_id=${'<parent-'+p.contact_id+'@test>'},updated_at='2026-10-01' WHERE id=${m.id}`;return m;}

test('acceptance: migration is registered and exposes manual replies, independent bumps, 25/15 and 15-minute discovery',async()=>{
 assert.equal(MIGRATION_FILES.at(-1),'007_prospecting_only_ramp.sql');
 const s=await settings(),snapshot=controlsSnapshot(s);
 assert.equal(configurationReady(s),true);assert.equal(s.auto_reply,false);assert.equal(s.reply_mode,'manual_only');assert.equal(s.auto_followup,true);
 assert.equal(snapshot.introDailyLimit,25);assert.equal(snapshot.followupDailyLimit,15);assert.equal(snapshot.discoveryIntervalMinutes,15);assert.equal(snapshot.discoveryDailyLimit,48);
 assert.equal(automationEnabled(s,'followup'),true);assert.equal(automationEnabled(s,'reply'),false);assert.equal(sendKindAllowed({...s,auto_reply:true},'reply'),false);
 assert.equal(configurationReady({...s,reply_mode:undefined}),false);assert.equal(configurationReady({...s,auto_reply:true}),false);
 assert.equal(controlsSnapshot({auto_reply:false,auto_prospect:true}).introDailyLimit,null);
});
test('acceptance: database-owned caps cannot be overridden by caller limits or settings above the ramp ceilings',async t=>{
 await setClock(t,'2026-11-04T00:45:00Z');
 await sql`UPDATE daniel_sales.settings SET outreach_pacing_enabled=false WHERE id=1`;
 for(const [kind,cap] of [['intro',25],['followup',15]]){
  const p=await prospect(),m=await queue(p,kind);
  await sql`INSERT INTO daniel_sales.daily_limits(local_date,kind,sent_count) VALUES((now() AT TIME ZONE 'America/New_York')::date,${kind},${cap})`;
  assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${m.id},2000)`).length,0);
  await sql`UPDATE daniel_sales.daily_limits SET sent_count=${cap-1} WHERE kind=${kind}`;
  assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${m.id},2000)`).length,1);
 }
 await assert.rejects(sql`UPDATE daniel_sales.settings SET intro_daily_limit=2000 WHERE id=1`);
 await assert.rejects(sql`UPDATE daniel_sales.settings SET followup_daily_limit=2000 WHERE id=1`);
 assert.equal(dailyLimit({intro_daily_limit:2000},'intro'),25);assert.equal(dailyLimit({followup_daily_limit:2000},'followup'),15);
});
test('acceptance: all 25 introductions and 15 follow-ups fit a paced twelve-hour synthetic day without bursts',async t=>{
 await setClock(t,'2026-11-03T13:00:00Z');
 const pending={intro:[],followup:[]};
 for(const [kind,n] of [['intro',26],['followup',16]])for(let i=0;i<n;i++)pending[kind].push(await queue(await prospect(),kind));
 const counts={intro:0,followup:0},times=[];
 for(let slot=0;slot<48;slot++){
  const instant=new Date(Date.parse('2026-11-03T13:00:00Z')+slot*900000);
  await setClock(t,instant);
  for(const kind of ['intro','followup']){
   const m=pending[kind][counts[kind]];if(!m)continue;
   const [claimed]=await sql`SELECT * FROM daniel_sales.claim_message(${m.id},2000)`;
   if(!claimed)continue;
   await finish(sql,claimed,{id:'fixture-'+m.id,threadId:'fixture-'+m.id},true);
   counts[kind]++;times.push({kind,at:+instant});break;
  }
 }
 assert.deepEqual(counts,{intro:25,followup:15});assert.equal(times.length,40);
 for(let i=1;i<times.length;i++)assert.ok(times[i].at-times[i-1].at>=900000);
 const totals=await sql`SELECT kind,sent_count,reserved_count FROM daniel_sales.daily_limits ORDER BY kind`;
 assert.deepEqual(totals.map(x=>[x.kind,x.sent_count,x.reserved_count]),[['followup',15,0],['intro',25,0]]);
 assert.equal((await sql`SELECT count(*)::int AS n FROM daniel_sales.messages WHERE status='sent'`)[0].n,0);
 t.diagnostic(JSON.stringify({scenario:'synthetic paced capacity',intros:25,followups:15,realProviderCalls:0,minimumObservedGapMinutes:15}));
});
test('acceptance: missed slots do not accumulate into a burst and boundary slots retain a ten-minute minimum gap',async t=>{
 await setClock(t,'2026-11-03T18:14:00Z');
 const a=await queue(await prospect()),b=await queue(await prospect());
 const [claimed]=await sql`SELECT * FROM daniel_sales.claim_message(${a.id},25)`;assert.ok(claimed);await finish(sql,claimed,{threadId:'fixture-burst'},true);
 assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${b.id},25)`).length,0);
 await setClock(t,'2026-11-03T18:15:00Z');assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${b.id},25)`).length,0);
 await setClock(t,'2026-11-03T18:24:00Z');assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${b.id},25)`).length,1);
});
test('acceptance: database itself rejects weekends and times outside the Eastern window including controlled claims',async t=>{
 const m=await queue(await prospect());await sql`UPDATE daniel_sales.messages SET due_at='2026-10-01',approved_at='2026-10-01' WHERE id=${m.id}`;
 const [c]=await sql`SELECT email FROM daniel_sales.contacts WHERE id=${m.contact_id}`;
 for(const date of ['2026-11-03T12:59:59Z','2026-11-04T01:00:00Z','2026-11-07T17:00:00Z','2026-11-08T17:00:00Z']){
  await setClock(t,date);assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${m.id},25)`).length,0);
  assert.equal((await sql`SELECT * FROM daniel_sales.claim_test_message(${m.id},25,${c.email})`).length,0);
 }
 await setClock(t,'2026-11-09T13:00:00Z');assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${m.id},25)`).length,1);
});
test('acceptance: discovery provides 48 unique eligible slots instead of 12 hourly opportunities',async()=>{
 const s=await settings(),slots=new Set();
 for(let i=0;i<48;i++)slots.add(discoverySlot(s,new Date(Date.parse('2026-11-03T13:00:00Z')+i*900000)));
 assert.equal(slots.size,48);assert.equal(discoveryLimit(s),48);assert.equal(discoveryLimit({discovery_daily_limit:2000}),48);
 assert.equal(pacedAllowance(s,'intro',new Date('2026-11-03T13:00:00Z')),1);
 assert.equal(pacedAllowance(s,'intro',new Date('2026-11-04T00:45:00Z')),25);
 assert.equal(pacedAllowance(s,'followup',new Date('2026-11-04T00:45:00Z')),15);
});
test('acceptance: old approved reply remains unsendable even when the legacy reply flag is accidentally enabled',async()=>{
 const p=await prospect(),m=await queue(p,'reply');await sql`UPDATE daniel_sales.settings SET auto_reply=true WHERE id=1`;
 assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${m.id},2000)`).length,0);
 let sends=0;
 const live={DANIEL_AGENT_MODE:'live',DANIEL_CUTOVER_APPROVED:'true',CONTEXT:'production',DANIEL_SENDER_EMAIL:'info@bannersonthefly.com'};
 const result=await dispatch(sql,live,'fixture-token',{now,verifyIdentity:async()=>{},send:async()=>{sends++;throw Error('Forbidden reply');}});
 assert.equal(result.sent,0);assert.equal(sends,0);
 assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'queued');
});
test('acceptance: human response at the account cancels bumps and leaves a human task without any reply send',async()=>{
 const p=await prospect(),[c]=await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;await prior(p);
 const m=await queue(p,'followup');
 await sql`INSERT INTO daniel_sales.tasks(contact_id,opportunity_id,kind,due_at,dedupe_key) VALUES(${p.contact_id},${p.opportunity_id},'followup',now(),'stop-on-human')`;
 const incoming={id:'human-reply-fixture',threadId:'fixture-'+p.contact_id,internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[{name:'From',value:c.email},{name:'Message-ID',value:'<human-fixture@test>'}],body:{data:Buffer.from('Thank you. I forwarded your information to Marketing.').toString('base64url')}}};
 assert.equal((await ingest(sql,incoming)).created,true);
 assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'blocked');
 assert.equal((await sql`SELECT status FROM daniel_sales.tasks WHERE dedupe_key='stop-on-human'`)[0].status,'cancelled');
 assert.equal((await sql`SELECT count(*)::int AS n FROM daniel_sales.tasks WHERE contact_id=${p.contact_id} AND kind='reply' AND status='pending'`)[0].n,1);
 await sql`UPDATE daniel_sales.settings SET auto_prospect=false WHERE id=1`;
 await runWorker(preview,{sql,now,generateDraft:async()=>{throw Error('No reply should be drafted');}});
 assert.equal((await sql`SELECT count(*)::int AS n FROM daniel_sales.messages WHERE direction='outbound' AND kind='reply'`)[0].n,0);
});
test('acceptance: suppression appearing after review still blocks the atomic send claim',async()=>{
 const p=await prospect(),m=await queue(p),[c]=await sql`SELECT email FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
 await suppress(sql,c.email,'Owner opt-out fixture','test');
 assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${m.id},25)`).length,0);
 assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'blocked');
});
test('acceptance: rejected or malformed new drafts never create pending approvals',async()=>{
 const s=await settings(),p=await prospect();
 for(const patch of [{research_review:{approved:false,response_id:'fixture-rejected',content_hash:'not-matching'}},{fact_ids:[]},{fact_ids:['invented']},{knowledge_version:'stale'}]){
  const d=draft(p);d.ai_metadata={...d.ai_metadata,...patch};const m=await saveDraft(sql,d,'test');
  const result=await routeApproval(sql,m,s,{});assert.notEqual(result.status,'approved');
  assert.equal((await sql`SELECT count(*)::int AS n FROM daniel_sales.approvals WHERE message_id=${m.id}`)[0].n,0);
  assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'draft');
 }
});
test('acceptance: validated routine introduction auto-approves only after review, while actual financial exception stays pending',async()=>{
 const s=await settings(),normal=await prospect(),exception=await prospect();
 const m=await saveDraft(sql,draft(normal),'test');
 assert.equal((await routeApproval(sql,m,s,{})).status,'approved');
 const [routine]=await sql`SELECT status,approved_by FROM daniel_sales.messages WHERE id=${m.id}`;assert.equal(routine.status,'queued');assert.equal(routine.approved_by,'daniel-policy');
 const e=draft(exception,'intro','Our custom price is $40 for your event entrance banner.');e.ai_metadata.requires_approval=true;e.ai_metadata.model_requires_approval=true;
 e.ai_metadata.research_review.content_hash=contentHash(e);
 const held=await saveDraft(sql,e,'test');assert.equal((await routeApproval(sql,held,s,{})).status,'business_exception');
 assert.equal((await sql`SELECT request_type FROM daniel_sales.approvals WHERE message_id=${held.id} AND decision='pending'`)[0].request_type,'business_exception');
 assert.equal((await sql`SELECT count(*)::int AS n FROM daniel_sales.approvals WHERE decision='pending'`)[0].n,1);
 assert.equal(businessException({...draft(normal),body:'Would you like a quote for an entrance banner?'},kb),false);
 assert.equal(businessException({...draft(normal),body:'Our quote is ready.'},kb),true);
});
test('acceptance: migration replay and forward-looking approval checks do not release or delete legacy approvals',async()=>{
 const p=await prospect();const legacy=await saveDraft(sql,{contact_id:p.contact_id,kind:'intro',subject:'Legacy fixture',body:'Unreviewed old text'},'test');await requestApproval(sql,legacy.id,'test');
 const before=await sql`SELECT id,message_id,decision,created_at,proposal_json FROM daniel_sales.approvals WHERE message_id=${legacy.id}`;
 const source=await fs.readFile(new URL('../migrations/007_prospecting_only_ramp.sql',import.meta.url),'utf8');await sql.transaction(statements(source).map(s=>sql(s)));
 assert.equal((await routeApproval(sql,legacy,await settings(),{})).status,'legacy_hold');
 const after=await sql`SELECT id,message_id,decision,created_at,proposal_json FROM daniel_sales.approvals WHERE message_id=${legacy.id}`;
 assert.deepEqual(after,before);assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${legacy.id}`)[0].status,'pending_approval');
});
test('acceptance: authenticated API cannot turn replies on and exposes separately editable follow-ups',async()=>{
 const req=(path,data,cookie='')=>new Request('https://preview.test'+path,{method:data===undefined?'GET':'POST',headers:{origin:'https://preview.test',cookie,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
 const login=await handler(req('/api/daniel/login',{password:'test-password-only'}),{},{sql,env});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await handler(req('/api/daniel/settings',{auto_reply:true},cookie),{},{sql,env})).status,409);
 assert.equal((await handler(req('/api/daniel/settings',{intro_daily_limit:2000},cookie),{},{sql,env})).status,400);
 let r=await handler(req('/api/daniel/settings',{auto_followup:false},cookie),{},{sql,env});assert.equal(r.status,200);assert.equal((await r.json()).settings.auto_reply,false);
 r=await handler(req('/api/daniel/settings',{auto_followup:true},cookie),{},{sql,env});assert.equal(r.status,200);
 r=await handler(req('/api/daniel/controls',undefined,cookie),{},{sql,env});const data=await r.json();assert.equal(data.settings.auto_reply,false);assert.equal(data.settings.auto_followup,true);assert.equal(data.controls.introDailyLimit,25);assert.equal(data.controls.followupDailyLimit,15);
});
