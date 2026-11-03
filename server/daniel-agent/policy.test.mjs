import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOpportunity,eligibleSend,classifyInbound,shouldAutoReply,easternBusinessDay} from './policy.mjs';
const monday=new Date('2026-10-26T14:00:00Z');
const contact={email:'buyer@example.com',verified_source_url:'https://example.com/contact'};
test('open opportunities require next actions',()=>{
 assert.equal(validateOpportunity({stage:'interested'}).ok,false);
 assert.equal(validateOpportunity({stage:'interested',next_action:'Call',next_action_at:monday.toISOString()}).ok,true);
});
test('suppressed and unverified contacts cannot be mailed',()=>{
 assert.equal(eligibleSend({contact:{...contact,opted_out:true},kind:'intro',now:monday,verifiedSource:true}).ok,false);
 assert.equal(eligibleSend({contact,kind:'intro',now:monday,verifiedSource:false}).ok,false);
});
test('daily global caps are 25 introductions and 15 follow-ups, with lower settings respected',()=>{
 for(const [kind,cap] of [['intro',25],['followup',15]]) {
  const base={contact,kind,now:monday,verifiedSource:true};
  assert.equal(eligibleSend({...base,sentToday:cap-1}).ok,true);
  assert.equal(eligibleSend({...base,sentToday:cap}).reason,'daily_cap');
  assert.equal(eligibleSend({...base,sentToday:cap,limits:{intro_daily_limit:2000,followup_daily_limit:2000}}).reason,'daily_cap');
  assert.equal(eligibleSend({...base,sentToday:2,limits:{intro_daily_limit:2,followup_daily_limit:2}}).reason,'daily_cap');
 }
});
test('weekends do not send',()=>{
 assert.equal(eligibleSend({contact,kind:'intro',now:new Date('2026-10-25T14:00:00Z'),verifiedSource:true}).ok,false);
});
test('replies and repeated followups are suppressed',()=>{
 assert.equal(eligibleSend({contact:{...contact,replied:true},kind:'followup',now:monday,verifiedSource:true}).reason,'reply_received');
 assert.equal(eligibleSend({contact,kind:'followup',now:monday,verifiedSource:true,unansweredFollowups:2}).reason,'followup_limit');
});
test('untrusted inbound cannot automatically trigger sends',()=>{
 assert.equal(classifyInbound('Please unsubscribe'),'unsubscribe');
 assert.equal(shouldAutoReply('quote_request'),false);
});
test('cold outreach closes at 8 PM Eastern while inbox synchronization can continue',()=>{
 assert.equal(easternBusinessDay(new Date('2026-10-21T23:59:00Z')),true);
 assert.equal(easternBusinessDay(new Date('2026-10-22T00:00:00Z')),false);
 assert.equal(easternBusinessDay(new Date('2026-11-03T12:59:00Z')),false);
 assert.equal(easternBusinessDay(new Date('2026-11-03T13:00:00Z')),true);
 assert.equal(easternBusinessDay(new Date('2026-11-04T01:00:00Z')),false);
});
