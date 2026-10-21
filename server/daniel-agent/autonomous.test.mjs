import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicIPv4, validateEvidence } from './discovery.mjs';
import { introductionEligible } from './automation.mjs';
import { BUSINESS_ADDRESS, BOF_SENDER, verifySender } from './identity.mjs';
import { renderSignature } from './operations.mjs';
import { renderReport, reportDue } from './report-email.mjs';
const candidate={company:'Example Corporate',website:'https://example.com',email:'marketing@example.com',segment:'regional restaurant chain',recurring_buyer:true,opportunity:'Seasonal promotional banners across restaurants',contact_url:'https://example.com/contact',facts:[{url:'https://example.com/about',quote:'We operate twenty restaurants across the United States.'},{url:'https://example.com/contact',quote:'Contact our corporate marketing team for business inquiries.'}]};
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
test('Daniel runtime sources cannot reintroduce the incorrect PO box',async()=>{
 const fs=await import('node:fs/promises');
 async function check(dir){for(const f of await fs.readdir(dir,{withFileTypes:true})){const u=new URL(f.name+(f.isDirectory()?'/':''),dir);if(f.isDirectory())await check(u);else if(/\.(mjs|sql)$/.test(f.name)&&!f.name.endsWith('.test.mjs'))assert.ok(!(await fs.readFile(u,'utf8')).includes('PO Box '+(370-1)),u.pathname);}}
 await check(new URL('./',import.meta.url));
});
test('real search prose is converted without inventing evidence, and absent web search is rejected',async()=>{
 const {modelJSON}=await import('./discovery.mjs');let requests=[];
 const fetcher=async(_url,opts)=>{const b=JSON.parse(opts.body);requests.push(b);return Response.json(requests.length===1?{id:'search',model:'gpt-4.1',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Based on the results, no suitable published business contact was verified.'}]}]}:{id:'extract',output:[{type:'message',content:[{type:'output_text',text:'{"none":true}'}]}]});};
 const r=await modelJSON({OPENAI_API_KEY:'test'},'Return JSON candidate or none',{}, {search:true,fetcher});assert.equal(r.value.none,true);assert.equal(requests.length,2);assert.equal(requests[1].text.format.type,'json_object');
 await assert.rejects(modelJSON({OPENAI_API_KEY:'test'},'Return JSON',{}, {search:true,fetcher:async()=>Response.json({output:[]})}),/No completed independent/);
});
test('official page extraction preserves published mailto contacts without importing scripts',async()=>{
 const {extractPage}=await import('./discovery.mjs');
 const p=extractPage({url:'https://example.com/',content:'<script>secret script content</script><a href="mailto:marketing@example.com?subject=Hello">Email our team</a><p>We manage 40 locations &amp; recurring events.</p><a href="/contact">Contact</a>'});
 assert.ok(p.text.includes('marketing@example.com'));assert.ok(p.text.includes('40 locations & recurring events'));assert.ok(!p.text.includes('secret script content'));assert.ok(p.links.includes('https://example.com/contact'));
});
test('an alternative company email domain is accepted only with exact official contact-page evidence',()=>{
 const c={...candidate,email:'main@company-group.com'};
 const fetched=[pages[0],{...pages[1],text:pages[1].text+' main@company-group.com'}];
 assert.equal(validateEvidence(c,fetched).verified,true);
 assert.throws(()=>validateEvidence({...c,email:'main@guessed-group.com'},fetched));
 assert.throws(()=>validateEvidence({...c,contact_url:'https://example.com/not-fetched'},fetched));
});

test('structured reviews explicitly request JSON in the Responses input',async()=>{
 const {modelJSON}=await import('./discovery.mjs');
 await modelJSON({OPENAI_API_KEY:'test'},'Review source evidence',{website:'https://example.com'}, {fetcher:async(_url,opts)=>{const request=JSON.parse(opts.body);assert.match(request.input,/json/i);assert.equal(request.text.format.type,'json_object');return Response.json({output:[{type:'message',content:[{type:'output_text',text:'{"approved":true}'}]}]});}});
});

test('published contact matching rejects addresses that only contain the candidate as a substring',()=>{
 for(const deceptive of ['notmarketing@example.com','marketing@example.com.attacker.test'])assert.throws(()=>validateEvidence(candidate,[pages[0],{...pages[1],text:candidate.facts[1].quote+' '+deceptive}]));
});

test('qualification requires a signage opportunity rather than unrelated business consulting',()=>{
 assert.throws(()=>validateEvidence({...candidate,opportunity:'Expand franchise brands and streamline operations'},pages));
});
test('independent rejection causes automatic revision with feedback, never automatic override',async()=>{
 const {reviewedIntroduction}=await import('./discovery.mjs');let drafts=0,reviews=0;const feedback=[];
 const sql=async()=>[{facts:{products:['vinyl banners']}}];
 const draft=async(_sql,_id,_kind,_env,_fetch,_attempt,reason)=>{feedback.push(reason);return {subject:'Company opening banners',body:++drafts===1?'We install your signs.':'Do your restaurant teams coordinate opening banners centrally?',ai_metadata:{requires_approval:false}};};
 const research=async()=>({responseId:'review-'+(++reviews),value:{approved:reviews===2,reason:reviews===1?'Remove unsupported installation services':'Grounded and appropriate'}});
 const d=await reviewedIntroduction(sql,{},'contact',{verified:true},{runId:'test-run',draft,research});assert.equal(drafts,2);assert.equal(feedback[1],'Remove unsupported installation services');assert.equal(d.ai_metadata.research_review.approved,true);assert.equal(d.ai_metadata.autonomous_revision_count,2);
 const held=await reviewedIntroduction(sql,{},'contact',{verified:true},{runId:'test-run',draft,research:async()=>({responseId:'reject',value:{approved:false,reason:'Unsupported claim'}})});assert.equal(held.ai_metadata.research_review.approved,false);assert.equal(held.ai_metadata.autonomous_revision_count,3);
});
test('published vinyl-banner shipping threshold is routine but other prices remain protected',async()=>{
 const {routinePolicyText}=await import('./policy.mjs');const {routineEligible}=await import('./automation.mjs');
 const facts={vinyl_banner_shipping:'Free Next-Day Air shipping in the U.S. for qualifying orders of $20 or more'};
 const body='Our vinyl banners qualify for free next-day air shipping in the U.S. on orders of $20 or more, with 24-hour production.';
 assert.ok(!routinePolicyText(body,facts).includes('$'));assert.ok(routinePolicyText(body,{}).includes('$20'));assert.ok(routinePolicyText('A banner costs $20.',facts).includes('$20'));assert.ok(routinePolicyText(body+' Your custom price is $50.',facts).includes('$50'));
 const m={kind:'reply',subject:'Products',body,ai_metadata:{requires_approval:false,knowledge_version:'v1',fact_ids:['vinyl_banner_shipping'],classification:'needs_review',model_classification:'routine_product'}};
 assert.equal(routineEligible(m,{version:'v1',facts}),true);assert.equal(routineEligible({...m,body:body+' I can offer a 30% discount.'},{version:'v1',facts}),false);
});
