import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicIPv4, validateEvidence } from './discovery.mjs';
import { introductionEligible } from './automation.mjs';
import { BUSINESS_ADDRESS, BOF_SENDER, verifySender } from './identity.mjs';
import { renderSignature } from './operations.mjs';
import { renderReport, reportDue } from './report-email.mjs';
const candidate={company:'Example Corporate',website:'https://example.com',email:'marketing@example.com',segment:'regional restaurant chain',recurring_buyer:true,opportunity:'Seasonal promotions across restaurants',facts:[{url:'https://example.com/about',quote:'We operate twenty restaurants across the United States.'},{url:'https://example.com/contact',quote:'Contact our corporate marketing team for business inquiries.'}]};
const pages=[{url:'https://example.com/about',text:candidate.facts[0].quote},{url:'https://example.com/contact',text:candidate.facts[1].quote+' marketing@example.com'}];
test('research fails closed on invented evidence, email, unsuitable inbox or supplier',()=>{
 assert.equal(validateEvidence(candidate,pages).verified,true);
 for(const change of [{email:'marketing@other.com'},{email:'privacy@example.com'},{segment:'printing supplier'},{facts:[{url:pages[0].url,quote:'A fabricated chain with thousands of offices worldwide.'},candidate.facts[1]]}])assert.throws(()=>validateEvidence({...candidate,...change},pages));
 assert.throws(()=>validateEvidence(candidate,[pages[0],{...pages[1],text:'Email not published'}]));
});
test('research retrieval blocks private, link-local and metadata network addresses',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.1.2','192.168.1.1','169.254.169.254','100.100.100.200','0.0.0.0','::1','224.0.0.1'])assert.equal(publicIPv4(ip),false,ip);
 assert.equal(publicIPv4('93.184.216.34'),true);
});
test('autonomous intro requires fresh evidence and an independent review bound to exact content',()=>{
 const kb={version:'v1',facts:{products:['vinyl banners']}};
 const m={kind:'intro',subject:'Seasonal signs at your twenty restaurants',body:'Would a consistent vinyl banner design help your restaurant teams?',ai_metadata:{requires_approval:false,knowledge_version:'v1',fact_ids:['products'],research_review:{approved:true}}};
 m.ai_metadata.research_review.content_hash=createHash('sha256').update(m.subject+'\n'+m.body).digest('hex');
 const r={verified:true,verified_at:new Date().toISOString(),recurring_buyer:true,reviewer:{response_id:'independent-review'}};
 assert.ok(introductionEligible(m,kb,r));
 assert.equal(introductionEligible({...m,body:'Our contract includes a 50% discount'},kb,r),false);
 assert.equal(introductionEligible(m,kb,{...r,verified_at:'2020-01-01'}),false);
 assert.equal(introductionEligible(m,kb,{...r,verified:false}),false);
 assert.equal(introductionEligible({...m,ai_metadata:{...m.ai_metadata,requires_approval:true}},kb,r),false);
});
test('every rendered commercial signature and daily report uses the verified address',()=>{
 assert.equal(BUSINESS_ADDRESS,'PO Box 368, Crestwood, KY 40014');
 for(const html of [renderSignature(),renderReport({date:'2026-10-21',pendingApprovals:0,uncertain:0},{accounts:[]})]){assert.ok(html.includes(BUSINESS_ADDRESS));assert.ok(!html.includes('PO Box '+String(370-1)));}
});
test('daily email respects Eastern 8 PM, weekdays and daylight saving',()=>{
 assert.equal(reportDue(new Date('2026-10-22T00:00:00Z')),true);
 assert.equal(reportDue(new Date('2026-10-21T23:59:00Z')),false);
 assert.equal(reportDue(new Date('2026-12-02T01:00:00Z')),true);
 assert.equal(reportDue(new Date('2026-10-25T00:00:00Z')),false);
});
test('sender verification rejects missing and unverified aliases',async()=>{
 await assert.rejects(verifySender('token',async()=>({sendAs:[]})));
 await assert.rejects(verifySender('token',async()=>({sendAs:[{sendAsEmail:BOF_SENDER,verificationStatus:'pending'}]})));
 await verifySender('token',async()=>({sendAs:[{sendAsEmail:BOF_SENDER,verificationStatus:'accepted'}]}));
});
