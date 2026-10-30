import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_DRAFT_ATTEMPTS,retryDecision,draftFailure,invalidFactIds,hasCompanyLocationCount,shouldAppendTeamOffer} from './draft-quality.mjs';
import {runWorker} from './worker.mjs';

test('draft retries stop at three rather than loop indefinitely',()=>{
 assert.equal(MAX_DRAFT_ATTEMPTS,3);
 assert.equal(retryDecision(0,new Error('AI service unavailable')).status,'pending');
 assert.equal(retryDecision(1,new Error('AI service unavailable')).status,'pending');
 assert.equal(retryDecision(2,new Error('AI service unavailable')).status,'needs_review');
 assert.equal(retryDecision(44,new Error('AI service unavailable')).status,'needs_review');
});
test('unsafe identity, existing human response and unverified offer hold immediately',()=>{
 for(const text of ['A verified human reply and its canonical conversation are required','Human response already received','Stored team offer cannot be verified'])assert.equal(retryDecision(0,new Error(text)).status,'needs_review');
});
test('failure notes use bounded categories rather than leaking provider payloads',()=>{
 const secret='confidential-provider-payload';
 assert.equal(draftFailure(new Error(secret)).code,'draft_or_review_failed');
 assert.ok(!JSON.stringify(draftFailure(new Error(secret))).includes(secret));
 assert.equal(draftFailure(new Error('AI returned invalid fact identifiers')).code,'invalid_fact_ids');
});
test('metadata must reference exact approved fact keys',()=>{
 assert.deepEqual(invalidFactIds(['company','independent_review_feedback','https://example.com'],{company:'BOF'}),['independent_review_feedback','https://example.com']);
 assert.deepEqual(invalidFactIds([],{company:'BOF'}),[]);
 assert.ok(invalidFactIds(null,{}).length);
});
test('location-count detector covers digit and written-word counts without matching turnaround',()=>{
 for(const text of ['seventeen restaurants and two breweries','21 restaurants','twenty-one stores','five offices','200 U.S. locations'])assert.equal(hasCompanyLocationCount(text),true,text);
 for(const text of ['24-hour vinyl-banner production','multi-location restaurants','one useful idea','15 oz vinyl'])assert.equal(hasCompanyLocationCount(text),false,text);
});
test('team offers belong in introductions or explicit requested replies, never automatic follow-ups',()=>{
 assert.equal(shouldAppendTeamOffer('intro',null),true);
 assert.equal(shouldAppendTeamOffer('followup',null),false);
 assert.equal(shouldAppendTeamOffer('reply','referral','Please send the code?'),false);
 assert.equal(shouldAppendTeamOffer('reply','conversation','Thank you for the information.'),false);
 assert.equal(shouldAppendTeamOffer('reply','conversation','How do we use the discount code?'),true);
});
function workerFixture(attemptCount){
 const writes=[];
 const task={id:'task-test',kind:'followup',contact_id:'contact-test',status:'pending',attempt_count:attemptCount};
 const sql=async(strings,...values)=>{
  const q=strings.join('?').replace(/\s+/g,' ').trim();
  if(/^(INSERT|UPDATE|DELETE|WITH)/.test(q))writes.push({q,values});
  if(q.startsWith('INSERT INTO daniel_sales.worker_locks'))return[{owner:'test'}];
  if(q.startsWith('INSERT INTO daniel_sales.runs'))return[{id:'run-test'}];
  if(q.startsWith('SELECT * FROM daniel_sales.settings'))return[{paused:false,auto_reply:true,auto_prospect:false}];
  if(q.startsWith('SELECT email,encrypted_refresh_token'))return[];
  if(q.startsWith("SELECT * FROM daniel_sales.tasks WHERE status='pending'"))return[task];
  if(q.startsWith('SELECT * FROM daniel_sales.contacts WHERE'))return[{id:'contact-test',email:'test@example.invalid',suppressed_at:null,replied_at:null}];
  if(q.startsWith('SELECT * FROM daniel_sales.messages'))return[];
  if(q.startsWith('SELECT count(*) FILTER'))return[{sent:0,gmailtestsent:0,simulated:0,received:0,uncertain:0}];
  if(q.startsWith('SELECT count(*)'))return[{count:0}];
  return[];
 };
 sql.transaction=async ops=>Promise.all(ops);
 return{sql,writes};
}
test('worker holds a legacy 44-attempt task without invoking drafting or sending',async()=>{
 const f=workerFixture(44);let called=0;
 const result=await runWorker({DANIEL_AGENT_MODE:'preview'},{sql:f.sql,generateDraft:async()=>{called++;throw Error('must not run');}});
 assert.equal(called,0);assert.equal(result.draftHolds,1);assert.equal(result.health,'needs_attention');assert.equal(result.sent,0);
 assert.ok(f.writes.some(x=>x.q.includes("status='needs_review'")));
 assert.ok(f.writes.some(x=>x.values.includes('draft_retry_exhausted')));
 assert.ok(!f.writes.some(x=>x.q.includes("status='completed' WHERE id=?")&&x.values.includes('task-test')));
});
test('worker persists a diagnostic and bounded retry for a first transient failure',async()=>{
 const f=workerFixture(0);
 const result=await runWorker({DANIEL_AGENT_MODE:'preview'},{sql:f.sql,generateDraft:async()=>{throw Error('AI service unavailable (502)');}});
 assert.equal(result.draftErrors,1);assert.equal(result.health,'needs_attention');
 assert.ok(f.writes.some(x=>x.q.includes('attempt_count=attempt_count+1,status=')&&x.values[0]==='pending'));
 assert.ok(f.writes.some(x=>x.values.includes('draft_attempt_failed')));
});
test('worker stops on the third failure and never marks unsuccessful preparation completed',async()=>{
 const f=workerFixture(2);
 const result=await runWorker({DANIEL_AGENT_MODE:'preview'},{sql:f.sql,generateDraft:async()=>{throw Error('AI returned invalid JSON');}});
 assert.equal(result.draftHolds,1);assert.equal(result.sent,0);
 assert.ok(f.writes.some(x=>x.q.includes('attempt_count=attempt_count+1,status=')&&x.values[0]==='needs_review'));
 assert.ok(!f.writes.some(x=>x.q.includes("SET status='completed'")));
});
