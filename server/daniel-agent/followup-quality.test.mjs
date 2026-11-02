import test from 'node:test';
import assert from 'node:assert/strict';
import { followupQualityIssues,FOLLOWUP_EDITORIAL_BRIEF } from './followup-quality.mjs';
import { reviewFollowup } from './followup-review.mjs';
import { generateReviewedFollowup } from './reviewed-followup.mjs';
import { DRAFT_CONTRACT,followupHash,recoveryEligibility,currentFollowupReview } from './recovery-policy.mjs';

const kb={version:'qa-kb',facts:{products:['vinyl banners']}};
const rejectedBodies=[
 'Hi Operations team,\n\nJust following up to see if you have any upcoming promotional events or community activities where new banners or yard signs might be helpful. We are ready to support with fast24-hour vinyl banner production and qualifying free next-day air shipping.\n\nWould it be useful to discuss how we can streamline your signage orders?',
 'Hi Operations team,\n\nJust checking in to see if you had a chance to consider how your team currently manages signage production and updates across your locations? Understanding your process could help us tailor our support to fit your needs best.\n\nLooking forward to your thoughts!',
 'Hi Operations team,\n\nJust checking in to see if you have a preferred process or vendor for your promotional signage. We would be happy to support your campaigns with quick-turn vinyl banners or yard signs. Would it be helpful to share some sample materials or discuss how we can streamline your signage orders?'
];
const repeatedLocationBodies=[
 'Considering Align Communities’ multiple Central Florida locations, yard signs could be a practical way to highlight available units right at each leasing office or community entrance. Would using yard signs for this purpose be helpful for your teams?',
 'Considering Lunds & Byerlys’ multiple locations, yard signs could be a practical way to highlight seasonal specials at each store entrance. Would using yard signs for this purpose be helpful for your teams?'
];
function draft(body='A vinyl banner beside the event entrance could make the check-in point visible before visitors reach the door. Would that placement be useful for your recurring events?') {
 return {kind:'followup',contact_id:'qa-contact',thread_key:'qa-thread',reply_to_id:'<qa-parent@test>',subject:'Re: Event banners',body,ai_metadata:{generation_contract:DRAFT_CONTRACT,knowledge_version:kb.version,requires_approval:false,model_requires_approval:false,model_classification:'followup',fact_ids:['products']}};
}
const history=[{direction:'outbound',rfc_message_id:'<qa-parent@test>',subject:'Event banners',body:'Your venue hosts recurring community events. We print vinyl banners.'}];
const sql=async strings=>strings.join('?').includes('knowledge')?[kb]:history;
const response=(value,id='qa-response')=>Response.json({id,model:'qa-review-model',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

for(const [index,body] of rejectedBodies.entries())test('editorial regression: rejected live-pattern draft '+(index+1)+' cannot pass merely because an AI approves',()=>{
 const m=draft(body);assert.ok(followupQualityIssues(body).length>=3);
 m.ai_metadata.followup_review={approved:true,response_id:'mock-model-approved',content_hash:followupHash(m),knowledge_version:kb.version};
 const decision=recoveryEligibility(m,{paused:false,cold_outreach_paused:false,required_draft_contract:DRAFT_CONTRACT},kb);
 assert.equal(decision.ok,false);assert.equal(decision.reason,'followup_editorial_veto');
});
test('editorial regression: repeated multiple-location yard-sign template is held even after model approval',()=>{
 for(const body of repeatedLocationBodies){
  const issues=followupQualityIssues(body);assert.ok(issues.some(issue=>/repeated/i.test(issue)));
  const m=draft(body);m.ai_metadata.followup_review={approved:true,response_id:'mock-model-approved',content_hash:followupHash(m),knowledge_version:kb.version};
  const decision=recoveryEligibility(m,{paused:false,cold_outreach_paused:false,required_draft_contract:DRAFT_CONTRACT},kb);
  assert.equal(decision.ok,false);assert.equal(decision.reason,'followup_editorial_veto');
 }
});
test('editorial veto: unsupported samples and repetitive process surveys never call a model',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return response({approved:true,reason:'Would otherwise rubber-stamp'});};
 for(const body of rejectedBodies){const review=await reviewFollowup(sql,draft(body),kb,{OPENAI_API_KEY:'qa'},fetcher);assert.equal(review.approved,false);assert.equal(review.deterministic,true);assert.equal(review.response_id,undefined);}
 assert.equal(calls,0);
});
test('editorial veto: a concise supported hypothetical use is not rejected for mentioning a product',()=>{
 assert.deepEqual(followupQualityIssues(draft().body),[]);
 assert.match(FOLLOWUP_EDITORIAL_BRIEF,/THIS company/);
 assert.match(FOLLOWUP_EDITORIAL_BRIEF,/not a check-in template/);
 assert.ok(followupQualityIssues('Would this help? Should we call?').length);
 assert.ok(followupQualityIssues('Use our25% discount code again.').length);
});
test('editorial revision: deterministic rejection provides feedback and still needs a real independent review',async()=>{
 let generations=0,providerCalls=0;const feedback=[];
 const generator=async(_sql,_id,_kind,_env,_fetcher,_attempt,f)=>{feedback.push(f);return draft(generations++===0?rejectedBodies[0]:undefined);};
 const reviewer=(s,m,k,e)=>reviewFollowup(s,m,k,e,async(url,init)=>{providerCalls++;assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(init.body);assert.equal(payload.model,'qa-reasoning-model');assert.equal(payload.text.format.type,'json_schema');assert.equal(payload.text.format.strict,true);assert.equal(JSON.parse(payload.input).conversation[0].body,history[0].body);return response({approved:true,reason:'Specific entrance placement tied to the recorded recurring events.'});});
 const result=await generateReviewedFollowup(sql,'qa-contact',{OPENAI_API_KEY:'qa',DANIEL_REVIEW_MODEL:'qa-reasoning-model'},{generator,reviewer});
 assert.equal(generations,2);assert.equal(providerCalls,1);assert.equal(currentFollowupReview(result),true);assert.match(feedback[1],/generic Operations team/);assert.equal(result.ai_metadata.followup_review.review_model,'qa-review-model');
});
test('editorial revision: three deterministic failures remain held without a fake provider approval',async()=>{
 let generations=0,providerCalls=0;
 const result=await generateReviewedFollowup(sql,'qa-contact',{OPENAI_API_KEY:'qa'},{generator:async()=>{generations++;return draft(rejectedBodies[2]);},reviewer:(s,m,k,e)=>reviewFollowup(s,m,k,e,async()=>{providerCalls++;throw Error('Must not call provider');})});
 assert.equal(generations,3);assert.equal(providerCalls,0);assert.equal(result.requires_approval,true);assert.equal(result.ai_metadata.followup_review.approved,false);assert.equal(result.ai_metadata.followup_review.response_id,undefined);
});
test('reasoned review: refusal, incomplete output and missing provider identity never establish approval',async()=>{
 for(const value of [Response.json({id:'refused',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]}),response({approved:true,reason:'No provider identifier'},null),new Response(null,{status:503})]){
  const m=draft(),review=await reviewFollowup(sql,m,kb,{OPENAI_API_KEY:'qa'},async()=>value);
  assert.equal(currentFollowupReview({...m,ai_metadata:{...m.ai_metadata,followup_review:review}}),false);
 }
});
