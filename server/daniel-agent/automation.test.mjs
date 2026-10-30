import test from 'node:test';
import assert from 'node:assert/strict';
import { routineEligible } from './automation.mjs';
import { replyHash } from './reply-review.mjs';
const kb={version:'bof-v1',facts:{company:'Banners On The Fly',products:['vinyl banners']}};
const reviewed=m=>({...m,ai_metadata:{...m.ai_metadata,conversation_review:{approved:true,acknowledgment_only:false,response_id:'review-fixture',inbound_rfc:m.reply_to_id,content_hash:replyHash(m)}}});
const message=reviewed({kind:'reply',subject:'Your banner question',body:'We offer vinyl banners. Which dimensions do you need?',reply_to_id:'<customer@test>',ai_metadata:{knowledge_version:'bof-v1',requires_approval:false,fact_ids:['products'],classification:'needs_review',model_classification:'routine_product',reply_recipient:'buyer@example.test'}});
test('only grounded routine replies and follow-ups qualify for automation',()=>{
 assert.equal(routineEligible(message,kb),true);
 assert.equal(routineEligible({...message,kind:'followup',ai_metadata:{...message.ai_metadata,model_classification:'followup'}},kb),true);
 for(const kind of ['intro','other'])assert.equal(routineEligible({...message,kind},kb),false);
 for(const change of [{requires_approval:true},{fact_ids:['invented']},{fact_ids:[]},{knowledge_version:'old'},{classification:'quote_request'},{model_classification:'needs_review'},{conversation_review:null}])assert.equal(routineEligible({...message,ai_metadata:{...message.ai_metadata,...change}},kb),false);
});
test('financial, scheduling and sensitive content cannot pass routine policy even after content review',()=>{
 for(const body of ['The price is $40','We can offer a discount','Our quote is ready','I guarantee arrival','Your invoice is ready','Let us schedule a call','We accept net 30','Please send credentials','Let us use another supplier'])assert.equal(routineEligible(reviewed({...message,body}),kb),false,body);
});
test('changing a reviewed reply body, recipient or parent invalidates automatic approval',()=>{
 assert.equal(routineEligible({...message,body:'A different unreviewed response'},kb),false);
 assert.equal(routineEligible({...message,reply_to_id:'<newer-customer@test>'},kb),false);
 assert.equal(routineEligible({...message,ai_metadata:{...message.ai_metadata,reply_recipient:'other@example.test'}},kb),false);
});
test('a verified referral acknowledgment needs no invented product fact or new sales pitch',()=>{
 let m=reviewed({...message,body:'Thank you for forwarding our information to Marketing. I appreciate your help.',ai_metadata:{...message.ai_metadata,fact_ids:[]}});
 m.ai_metadata.conversation_review.acknowledgment_only=true;
 assert.equal(routineEligible(m,kb),true);
 m.ai_metadata.conversation_review.approved=false;assert.equal(routineEligible(m,kb),false);
});
