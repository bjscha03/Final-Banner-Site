import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDraft } from './ai.mjs';

const contact = {id:'qa-contact',account_id:'qa-account',name:null,company:'Example Event Center',segment:'event venue',notes:'Official evidence: hosts community events.',email:'marketing@example.test',suppressed_at:null};
const knowledge = {version:'qa-v1',facts:{company:'Banners On The Fly',products:['vinyl banners'],vinyl_banner_production:'24-hour vinyl-banner production'}};
const valid = () => ({subject:'Event entrance banners',body:'Hello,\n\nFor your community events, a reusable vinyl entrance banner could help visitors find the check-in point. Would your events team be the right contact?',classification:'routine_product',requires_approval:false,reason:'Verified venue context and approved product fact.',fact_ids:['products']});
function harness(outputs, {thread=[], suppressed=false}={}) {
  const requests=[];
  const sql=async strings=>{
    const q=strings.join('?');
    if(q.includes('SELECT c.*')) return [{...contact,suppressed_at:suppressed?'2026-01-01T00:00:00Z':null}];
    if(q.includes('daniel_sales.knowledge')) return [knowledge];
    if(q.includes('daniel_sales.messages')) return thread;
    throw Error('Unexpected SQL in draft-only test: '+q);
  };
  const fetcher=async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    const output=outputs[Math.min(requests.length-1,outputs.length-1)];
    return {ok:true,json:async()=>({id:'qa-response-'+requests.length,model:'qa-model',choices:[{message:{content:JSON.stringify(output)}}]})};
  };
  const run=(kind='intro')=>generateDraft(sql,contact.id,kind,{OPENAI_API_KEY:'unit-test-placeholder'},fetcher);
  return {run,requests};
}

test('strict metadata: a valid grounded draft retains independent-review metadata',async()=>{
  const h=harness([valid()]);
  const d=await h.run();
  assert.equal(h.requests.length,1);
  assert.equal(d.ai_metadata.requires_approval,false);
  assert.equal(d.ai_metadata.model_requires_approval,false);
  assert.equal(d.ai_metadata.knowledge_version,'qa-v1');
  assert.deepEqual(d.ai_metadata.fact_ids,['products']);
});

test('strict metadata: strings, numbers and missing approval booleans are never coerced',async()=>{
  for(const flag of ['false','true',0,1,null,undefined]) {
    const h=harness([{...valid(),requires_approval:flag}]);
    await assert.rejects(h.run(),/invalid draft metadata/);
    assert.equal(h.requests.length,2);
  }
});

test('strict metadata: unknown business facts are regenerated, not silently removed',async()=>{
  const h=harness([{...valid(),fact_ids:['products','invented_fact']},valid()]);
  const d=await h.run();
  assert.equal(h.requests.length,2);
  assert.match(JSON.parse(h.requests[1].messages[1].content).independent_review_feedback,/approved business fact keys/);
  assert.deepEqual(d.ai_metadata.fact_ids,['products']);
});

test('strict metadata: repeated unknown fact keys fail closed after one regeneration',async()=>{
  for(const ids of [['https://example.test/about'],['independent_review_feedback'],[null],{},null,undefined]) {
    const h=harness([{...valid(),fact_ids:ids}]);
    await assert.rejects(h.run(),/fact identifiers/);
    assert.equal(h.requests.length,2);
  }
});

test('strict metadata: invalid model classification or reason cannot produce a saved draft',async()=>{
  for(const replacement of [{classification:'approved'},{classification:null},{reason:null},{reason:[]}]) {
    const h=harness([{...valid(),...replacement}]);
    await assert.rejects(h.run(),/invalid draft metadata/);
    assert.equal(h.requests.length,2);
  }
});

test('strict metadata: null and array JSON responses produce controlled validation errors',async()=>{
  for(const value of [null,[],42,'invalid']) {
    const h=harness([value]);
    await assert.rejects(h.run(),/invalid draft/);
    assert.equal(h.requests.length,1);
  }
});

test('strict metadata: explicit model-requested approval is never downgraded',async()=>{
  const h=harness([{...valid(),requires_approval:true}]);
  const d=await h.run();
  assert.equal(d.requires_approval,true);
  assert.equal(d.ai_metadata.model_requires_approval,true);
});

test('strict metadata: prohibited commitment still requires approval despite valid fields',async()=>{
  const h=harness([{...valid(),body:'We guarantee delivery tomorrow.'}]);
  const d=await h.run();
  assert.equal(d.requires_approval,true);
});

test('strict metadata: a referral acknowledgment can use no product facts but keeps its verified parent',async()=>{
  const inbound={direction:'inbound',classification:'needs_review',body:'I have forwarded your information to our Marketing department.',subject:'Event entrance banners',thread_key:'qa-thread',rfc_message_id:'<qa-inbound@example.test>',provider_message_id:'qa-inbound',ai_metadata:{conversation_intent:'referral',reply_recipient:'reception@example.test'}};
  const h=harness([{...valid(),body:'Thank you for forwarding our information to Marketing. We appreciate your help and will leave it with your team for consideration.',fact_ids:[]}],{thread:[inbound]});
  const d=await h.run('reply');
  assert.equal(d.reply_to_id,inbound.rfc_message_id);
  assert.equal(d.ai_metadata.reply_recipient,'reception@example.test');
  assert.deepEqual(d.ai_metadata.fact_ids,[]);
  assert.equal(d.ai_metadata.conversation_review,undefined);
});

test('strict metadata: suppression and a received human reply still stop inappropriate drafts before AI',async()=>{
  const suppressed=harness([valid()],{suppressed:true});
  await assert.rejects(suppressed.run(),/suppressed/);
  assert.equal(suppressed.requests.length,0);
  const replied=harness([valid()],{thread:[{direction:'inbound',classification:'needs_review',body:'Thanks, sent to marketing.',ai_metadata:{}}]});
  await assert.rejects(replied.run('followup'),/Human response already received/);
  assert.equal(replied.requests.length,0);
});
