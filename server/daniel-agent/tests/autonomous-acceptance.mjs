// Real deployed acceptance. Run only with explicit owner authorization and the
// expiring exact-address Gmail test window. No live mode or pause changes.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { database } from '../db.mjs';
const base='https://deploy-preview-655--bannersonthefly.netlify.app';
const old=JSON.parse(await fs.readFile('/tmp/daniel-real-gmail-state.json','utf8'));
const file='/tmp/daniel-autonomous-evidence.json';
const evidence=JSON.parse(await fs.readFile(file,'utf8').catch(()=>'{}'));
const stage=process.argv[2];
async function save(){await fs.writeFile(file,JSON.stringify(evidence,null,2),{mode:0o600});}
async function api(path,body,expected=200){const r=await fetch(base+'/api/daniel/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:old.cookie,origin:base,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const j=await r.json();assert.equal(r.status,expected,JSON.stringify(j));return j;}
const d=await api('data');assert.equal(d.settings.paused,true);assert.equal(d.settings.auto_reply,false);assert.equal(d.settings.auto_prospect,false);assert.equal(d.config.liveEmailEnabled,false);
if(stage==='intro'){
 const research=d.researchRuns.find(r=>r.status==='completed'&&d.contacts.find(c=>c.id===r.evidence.contact_id)?.research?.qa===true);assert.ok(research,'No completed autonomous discovery');
 const m=d.messages.find(m=>m.id===research.evidence.message_id);assert.equal(m.status,'sent');assert.equal(m.approved_by,'daniel-policy');assert.equal(m.ai_metadata.research_review.approved,true);assert.equal(m.ai_metadata.gmail_test,true);
 const contact=d.contacts.find(c=>c.id===m.contact_id);assert.equal(contact.email,process.env.DANIEL_QA_ADDRESS);assert.notEqual(contact.email,research.evidence.email);
 const headers=await api('test/gmail/evidence?id='+m.id);assert.match(headers.headers.From,/info@bannersonthefly.com/);assert.ok(headers.headers.To.includes(contact.email));
 const task=d.tasks.find(t=>t.contact_id===contact.id&&t.kind==='followup'&&t.status==='pending');assert.ok(task);assert.ok(Date.parse(task.due_at)>Date.now()+5*86400000);
 Object.assign(evidence,{research,intro:m,contact,headers,task});await save();console.log('PASS independent research, real official-page evidence, original introduction, automatic policy approval, actual Gmail acceptance, owner-only recipient, five-business-day schedule');
}else if(stage==='accelerate'){
 assert.ok(evidence.intro);const sql=database();const [c]=await sql`SELECT email,research FROM daniel_sales.contacts WHERE id=${evidence.contact.id}`;assert.equal(c.email,process.env.DANIEL_QA_ADDRESS);assert.equal(c.research.qa,true);
 await sql`UPDATE daniel_sales.messages SET updated_at=now()-interval '8 days' WHERE id=${evidence.intro.id} AND ai_metadata->>'gmail_test'='true'`;
 await sql`UPDATE daniel_sales.tasks SET due_at=now()-interval '1 minute',note='Owner-controlled QA: accelerated five-business-day wait' WHERE id=${evidence.task.id}`;
 console.log('PASS accelerated only the isolated QA follow-up fixture');
}else if(stage==='followup'){
 const messages=d.messages.filter(m=>m.contact_id===evidence.contact.id&&m.status==='sent');assert.equal(messages.length,2);const m=messages.find(m=>m.kind==='followup');assert.ok(m);const h=await api('test/gmail/evidence?id='+m.id);assert.equal(h.threadId,evidence.headers.threadId);assert.equal(h.headers['In-Reply-To'],evidence.headers.headers['Message-ID']);evidence.followup=m;evidence.followupHeaders=h;await save();console.log('PASS due AI follow-up delivered in the same Gmail thread');
}else if(stage==='reply'){
 const messages=d.messages.filter(m=>m.contact_id===evidence.contact.id);const incoming=messages.filter(m=>m.direction==='inbound');assert.equal(incoming.length,1);
 const sent=messages.filter(m=>m.status==='sent');assert.equal(sent.length,3);const m=sent.find(m=>m.kind==='reply');assert.ok(m);assert.equal(m.approved_by,'daniel-policy');
 const h=await api('test/gmail/evidence?id='+m.id);assert.equal(h.threadId,evidence.headers.threadId);assert.equal(h.headers['In-Reply-To'],incoming[0].rfc_message_id);
 assert.equal(d.tasks.filter(t=>t.contact_id===evidence.contact.id&&t.kind==='followup'&&t.status==='pending').length,0);
 evidence.reply=m;evidence.inbound=incoming[0];evidence.replyHeaders=h;await save();console.log('PASS intelligent automatic reply, actual inbound reception, threading, no duplicate send and follow-up cancellation');
}else if(stage==='pending'){
 const m=await api('draft',{contact_id:evidence.contact.id,kind:'reply',subject:evidence.intro.subject,body:'Controlled test future message: unsubscribe must block delivery.',due_at:new Date(Date.now()+86400000).toISOString()});await api('approval/request',{id:m.id});const a=(await api('data')).approvals.find(a=>a.message_id===m.id&&a.decision==='pending');await api('approval/decide',{id:a.id,decision:'approved',note:'Owner-controlled cancellation acceptance fixture only'});evidence.pending=m;await save();console.log('PASS future controlled cancellation fixture queued');
}else if(stage==='unsubscribe'){
 assert.ok(d.contacts.find(c=>c.id===evidence.contact.id).suppressed_at);assert.equal(d.messages.find(m=>m.id===evidence.pending.id).status,'blocked');assert.equal(d.messages.filter(m=>m.contact_id===evidence.contact.id&&m.status==='sent').length,3);assert.equal(d.tasks.filter(t=>t.contact_id===evidence.contact.id&&t.status==='pending').length,0);await api('draft',{contact_id:evidence.contact.id,subject:'Must block',body:'Must not send'},409);evidence.unsubscribed=true;await save();console.log('PASS actual unsubscribe, future-message block, no repeat sends and immediate suppression');
}else if(stage==='report'){
 const r=d.reportDeliveries.find(r=>r.report_key.startsWith('qa:'));assert.equal(r.status,'sent');assert.equal(r.recipient,process.env.DANIEL_QA_ADDRESS);assert.ok(r.provider_message_id);evidence.report=r;await save();console.log('PASS actual Brad report accepted by Gmail',JSON.stringify(r));
}else if(stage==='duplicate'){
 const job=JSON.parse(await fs.readFile('/tmp/daniel-autonomous-job.json','utf8'));const run=d.runs.find(r=>r.id===job.runId);assert.equal(run.status,'completed');assert.equal(run.summary.gmailTestSent,0);assert.equal(run.summary.inbox.created,0);assert.equal(run.summary.reportEmail.status,'already_sent');assert.equal(run.summary.reportEmail.id,evidence.report.provider_message_id);assert.equal(d.messages.filter(m=>m.contact_id===evidence.contact.id&&m.status==='sent').length,3);evidence.duplicateCheck=true;await save();console.log('PASS repeat run sends no outreach, imports no duplicates and does not resend the daily report');
}else if(stage==='locked'){
 assert.equal(d.config.gmailTestEnabled,false);await api('test/gmail/run',{},403);await api('test/gmail/evidence',undefined,403);assert.equal((await fetch(base+'/api/daniel/data')).status,401);assert.ok(d.contacts.find(c=>c.id===evidence.contact.id).suppressed_at);evidence.finalLocks=true;await save();console.log('PASS final paused state, all automation switches off, live and test sending disabled, anonymous access rejected');
}else throw Error('Unknown stage');
process.exit(0);
