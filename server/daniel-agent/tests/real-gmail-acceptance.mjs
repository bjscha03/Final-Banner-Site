// Explicit, staged acceptance harness. Requires the server's short-lived owner
// allowlist. Never enables production mode or reads/sends prospect mail.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { database } from '../db.mjs';
const base='https://deploy-preview-655--bannersonthefly.netlify.app';
const statePath='/tmp/daniel-real-gmail-state.json';
const stage=process.argv[2];
const testAddress=process.env.DANIEL_QA_ADDRESS;
assert.ok(testAddress, 'Provide the connected owner test inbox address');
let s=JSON.parse(await fs.readFile(statePath,'utf8').catch(()=>'{}'));
async function persist(){await fs.writeFile(statePath,JSON.stringify(s,null,2),{mode:0o600});}
async function api(path,input,expected=200){
 const r=await fetch(base+'/api/daniel/'+path,{method:input===undefined?'GET':'POST',headers:{origin:base,cookie:s.cookie||'','content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});
 const j=await r.json();assert.equal(r.status,expected,JSON.stringify(j));
 if(r.headers.get('set-cookie'))s.cookie=r.headers.get('set-cookie').split(';')[0];
 return j;
}
async function data(){return api('data');}
async function approve(m){await api('approval/request',{id:m.id});const d=await data();const a=d.approvals.find(x=>x.message_id===m.id&&x.decision==='pending');assert.ok(a);await api('approval/decide',{id:a.id,decision:'approved',note:'Owner-authorized controlled Gmail acceptance test'});}
async function run(){const job=await api('test/gmail/run',{});assert.equal(job.status,'queued');for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,1000));const d=await data(),r=d.runs.find(x=>x.id===job.runId);if(r&&!['queued','running'].includes(r.status)){console.log('RUN',JSON.stringify(r.summary));assert.ok(['completed','busy'].includes(r.status));return r;}}throw Error('Test job timed out');}
async function evidence(m){const e=await api('test/gmail/evidence?id='+m.id);assert.match(e.headers.From,/info@bannersonthefly\.com/);assert.ok(e.headers.To.includes(testAddress));return e;}
if(stage==='setup'){
 await api('login',{password:process.env.ADMIN_PASSWORD});
 const d=await data();assert.equal(d.config.liveEmailEnabled,false);assert.equal(d.config.gmailTestEnabled,true);
 s.identity=await api('test/gmail/evidence');assert.equal(s.identity.sender,'info@bannersonthefly.com');assert.equal(s.identity.verificationStatus,'accepted');
 s.tag=Date.now();s.subject='[Daniel QA '+s.tag+'] Controlled mailbox verification';
 s.p=await api('prospect',{name:'Owner-controlled Gmail acceptance test',segment:'corporate team',website:'https://bannersonthefly.com',source_url:'https://bannersonthefly.com',contact_name:'Brandon QA',email:testAddress,notes:'Owner-controlled test inbox, not a sales prospect.'});
 s.other=await api('prospect',{name:'QA non-allowlisted safety fixture '+s.tag,segment:'corporate team',website:'https://example.com',source_url:'https://example.com',contact_name:'Safety fixture',email:'gmail-guard-'+s.tag+'@example.test'});
 s.intro=await api('draft',{contact_id:s.p.contact_id,kind:'intro',subject:s.subject,body:'Controlled Daniel acceptance test for the owner. This verifies the BOF sender and scheduling. No purchase or action is requested. We offer vinyl banners, mesh banners, yard signs and car magnets.'});await approve(s.intro);
 s.guard=await api('draft',{contact_id:s.other.contact_id,kind:'intro',subject:'Do not send: allowlist safety fixture',body:'This address must not receive real Gmail delivery.'});await approve(s.guard);
 await persist();console.log('PASS setup and verified sender',JSON.stringify(s.identity));
}else if(stage==='intro'){
 await Promise.all([run(),run()]);const d=await data();const m=d.messages.find(x=>x.id===s.intro.id);assert.equal(m.status,'sent');assert.equal(m.ai_metadata.gmail_test,true);assert.equal(d.messages.find(x=>x.id===s.guard.id).status,'queued');s.introEvidence=await evidence(m);await run();const again=await data();assert.equal(again.messages.filter(x=>x.contact_id===s.p.contact_id&&x.status==='sent').length,1);s.followupTask=again.tasks.find(t=>t.contact_id===s.p.contact_id&&t.kind==='followup'&&t.status==='pending');assert.ok(s.followupTask);assert.ok(Date.parse(s.followupTask.due_at)>Date.now()+5*86400000);await persist();console.log('PASS actual send, concurrent duplicate guard, recipient restriction, five-business-day schedule',JSON.stringify(s.introEvidence));
}else if(stage==='schedule'){
 const sql=database();const [c]=await sql`SELECT email FROM daniel_sales.contacts WHERE id=${s.p.contact_id}`;assert.equal(c.email,testAddress);
 // Accelerate only these isolated test-fixture timestamps; production policy is unchanged.
 await sql`UPDATE daniel_sales.messages SET updated_at=now()-interval '8 days' WHERE id=${s.intro.id} AND ai_metadata->>'gmail_test'='true'`;
 s.dueAt=new Date(Date.now()+60000).toISOString();
 await sql`UPDATE daniel_sales.tasks SET due_at=${s.dueAt},note='Controlled QA: accelerated fixture clock, production interval remains five business days' WHERE id=${s.followupTask.id} AND contact_id=${s.p.contact_id}`;
 await api('settings',{auto_reply:true});await run();const d=await data();assert.equal(d.tasks.find(x=>x.id===s.followupTask.id).status,'pending');await persist();console.log('PASS scheduled follow-up does not execute early; due',s.dueAt);
}else if(stage==='followup'){
 assert.ok(Date.now()>=Date.parse(s.dueAt),'Wait for actual fixture due time');await run();const d=await data();const m=d.messages.find(x=>x.contact_id===s.p.contact_id&&x.kind==='followup');assert.ok(m);assert.equal(m.status,'sent',JSON.stringify({status:m.status,metadata:m.ai_metadata}));s.followup=m;s.followupEvidence=await evidence(m);assert.equal(s.followupEvidence.threadId,s.introEvidence.threadId);assert.equal(s.followupEvidence.headers['In-Reply-To'],s.introEvidence.headers['Message-ID']);await persist();console.log('PASS real scheduled AI follow-up and Gmail threading',JSON.stringify(s.followupEvidence));
}else if(stage==='reply'){
 await run();const d=await data();const received=d.messages.filter(x=>x.contact_id===s.p.contact_id&&x.direction==='inbound');assert.equal(received.length,1);const m=d.messages.find(x=>x.contact_id===s.p.contact_id&&x.kind==='reply'&&x.direction==='outbound');assert.ok(m);assert.equal(m.status,'sent',JSON.stringify(m.ai_metadata));s.reply=m;s.inbound=received[0];s.replyEvidence=await evidence(m);assert.equal(s.replyEvidence.threadId,s.introEvidence.threadId);assert.equal(s.replyEvidence.headers['In-Reply-To'],s.inbound.rfc_message_id);await run();const d2=await data();assert.equal(d2.messages.filter(x=>x.contact_id===s.p.contact_id&&x.direction==='inbound').length,1);assert.equal(d2.messages.filter(x=>x.contact_id===s.p.contact_id&&x.status==='sent').length,3);assert.equal(d2.tasks.filter(x=>x.contact_id===s.p.contact_id&&x.kind==='followup'&&x.status==='pending').length,0);
 s.pending=await api('draft',{contact_id:s.p.contact_id,kind:'reply',subject:s.subject,body:'Future test message that unsubscribe must cancel.',due_at:new Date(Date.now()+3600000).toISOString()});await approve(s.pending);await persist();console.log('PASS receive, automatic real AI reply, thread continuity, duplicate inbound/reply protection and follow-up cancellation',JSON.stringify(s.replyEvidence));
}else if(stage==='unsubscribe'){
 await run();const d=await data();assert.ok(d.contacts.find(x=>x.id===s.p.contact_id).suppressed_at);assert.equal(d.messages.find(x=>x.id===s.pending.id).status,'blocked');assert.equal(d.tasks.filter(x=>x.contact_id===s.p.contact_id&&x.status==='pending').length,0);assert.equal(d.messages.filter(x=>x.contact_id===s.p.contact_id&&x.status==='sent').length,3);await api('draft',{contact_id:s.p.contact_id,subject:'Blocked',body:'Must never send'},409);await run();await api('settings',{auto_reply:false});await api('suppress',{email:'gmail-guard-'+s.tag+'@example.test',reason:'Controlled Gmail QA complete'});s.report=await api('report',{});assert.equal(s.report.sent,0);assert.equal(s.report.gmailtestsent,3);await persist();console.log('PASS real unsubscribe, queued cancellation, no duplicate sends, suppression and separate reporting',JSON.stringify(s.report));
 }else if(stage==='sync'){
 // Limit initial acceptance reconciliation to this real conversation. This is
 // fixture setup only; production reconciliation retains its normal CRM scope.
 const sql=database();
 const [box]=await sql`SELECT history_id,sync_start_history FROM daniel_sales.mailbox WHERE id=1`;
 if(!box.history_id&&!box.sync_start_history){
  const history=process.env.DANIEL_QA_HISTORY_ID;
  assert.match(history||'',/^[0-9]+$/,'Supply the actual Gmail test-message history ID');
  const query='from:'+testAddress+' subject:"Daniel QA '+s.tag+'" newer_than:1d -in:drafts';
  await sql`UPDATE daniel_sales.mailbox SET sync_start_history=${history},initial_query=${JSON.stringify({queries:[query],index:0})},page_token=NULL WHERE id=1 AND history_id IS NULL`;
 }
 let r;for(let i=0;i<30;i++){r=await api('sync',{});console.log('SYNC',JSON.stringify(r));if(r.complete)break;}assert.equal(r.complete,true);const d=await data();assert.equal(d.mailbox.last_error,null);assert.ok(d.mailbox.history_id);assert.equal(d.config.liveEmailEnabled,false);let incremental;for(let i=0;i<30;i++){incremental=await api('sync',{});console.log('INCREMENTAL',JSON.stringify(incremental));if(incremental.complete)break;}assert.equal(incremental.complete,true);console.log('PASS deployed scoped initial and incremental Gmail history sync');
 }else if(stage==='cleanup'){
 await api('settings',{paused:true,auto_reply:false});
 const d=await data();assert.equal(d.config.liveEmailEnabled,false);assert.equal(d.settings.paused,true);assert.equal(d.settings.auto_reply,false);
 assert.ok(d.contacts.find(x=>x.id===s.p.contact_id).suppressed_at);assert.ok(d.contacts.find(x=>x.id===s.other.contact_id).suppressed_at);
 console.log('PASS dedicated agent paused, routine replies disabled, both acceptance contacts suppressed');
}else if(stage==='locked'){
 const d=await data();assert.equal(d.config.liveEmailEnabled,false);assert.equal(d.config.gmailTestEnabled,false);assert.equal(d.settings.paused,true);assert.equal(d.settings.auto_reply,false);
 await api('test/gmail/run',{},403);await api('test/gmail/evidence',undefined,403);
 const r=await fetch(base+'/api/daniel/data');assert.equal(r.status,401);
 const page=await fetch(base+'/daniel');const html=await page.text();assert.ok(!html.includes(testAddress));
 console.log('PASS final deployed live/test sending locks, paused agent, disabled routine mode and anonymous CRM protection');
}else if(stage==='status'){
 const d=await data();console.log(JSON.stringify({config:d.config,mailbox:d.mailbox,messages:d.messages.filter(x=>x.contact_id===s.p?.contact_id).map(x=>({id:x.id,kind:x.kind,status:x.status,subject:x.subject,error:x.error,thread:x.thread_key,providerId:x.provider_message_id})),runs:d.runs.slice(0,3),settings:d.settings},null,2));
}else throw Error('Unknown acceptance stage');
