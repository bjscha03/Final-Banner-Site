import test from 'node:test';
import assert from 'node:assert/strict';
import {offerText,approvedOfferText} from './team-offer.mjs';
import {routineEligible} from './automation.mjs';
import {renderSalesEmail,signature} from './email-design.mjs';
import promo from '../../netlify/functions/_shared/daniel-team-promotion.cjs';
const env={DANIEL_PROMO_SIGNING_SECRET:'test-only-team-offer-key-at-least-32-characters'};
test('only the exact approved offer can bypass discount escalation',()=>{
 const code=promo.createTeamCode('Paristown',env),offer={code};
 const kb={version:'v2',facts:{company:'Banners On The Fly'}};
 const m={kind:'followup',subject:'A banner idea for Paristown',body:'A thought for your next event.\n\n'+offerText(code),ai_metadata:{team_offer:offer,requires_approval:false,knowledge_version:'v2',fact_ids:['company'],model_classification:'followup'}};
 assert.equal(routineEligible(m,kb,env),true);
 assert.equal(routineEligible({...m,body:m.body+' We can give you 50% off.'},kb,env),false);
 assert.equal(routineEligible({...m,body:m.body.replace('25%','35%')},kb,env),false);
 assert.equal(routineEligible(m,kb,{}),false);
 assert.match(approvedOfferText(m.body,offer,{}),/25%/);
});
test('branded signatures render escaped email-safe HTML with the real logo and correct address',()=>{
 const html=renderSalesEmail('Hi team,\n\n<script>alert(1)</script>');
 assert.match(html,/<table role="presentation"/);assert.match(html,/<img[^>]+header-logo.png/);
 assert.match(html,/width="240" height="68"/);assert.match(html,/PO Box 368/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/reply unsubscribe/);
 assert.match(signature('Brad','Team Manager'),/>Brad<\/strong>/);
});
