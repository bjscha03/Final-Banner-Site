import {easternBusinessDay,eligibleSend} from './policy.mjs';
const SAFE_STAGES=new Set(['researched','qualified','contacted','replied','interested','quote_requested','quote_pending_approval','quoted','negotiation','won','lost','nurture','do_not_contact']);
export function normalizeEmail(s){const v=String(s||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:null}
export function isEndBuyer(account){return !!account && !/\b(printer|print supplier|sign shop|print broker|wholesale production|supplier|vendor)\b/i.test(String(account.segment||''))}
export function approvalNeeded(message){return /\b(discount|net\s*30|credit terms|contract|guarantee|exclusive|refund|custom price)\b/i.test(message)}
export function canDispatch({contact,account,kind,now,alreadySent=0,followups=0,lastFollowupAt,providerAllowed=true}){
 if(!isEndBuyer(account))return {ok:false,reason:'supplier_excluded'};
 if(!normalizeEmail(contact?.email))return {ok:false,reason:'invalid_email'};
 return eligibleSend({contact,kind,now,sentToday:alreadySent,unansweredFollowups:followups,lastFollowupAt,verifiedSource:!!contact.verified_source_url,providerAllowed});
}
export function classifyStage(stage){return SAFE_STAGES.has(stage)?stage:'researched'}
export function renderSignature(name='Daniel'){return '<p>Best,<br><strong>'+name+'</strong><br>Sales Assistant | <a href="https://bannersonthefly.com">Banners On The Fly</a></p><p style="font-size:11px;color:#64748b">Promotional business introduction from Banners On The Fly.<br>PO Box 369, Crestwood, KY 40014<br>To stop outreach from us, reply unsubscribe.</p>'}
export function makeIntro({company,observation}){return 'Hi, I noticed '+observation+'. I am reaching out from Banners On The Fly because we help teams order promotional banners with fast production and nationwide delivery. Would you be the right person to ask about signage for '+company+', or is there someone on your operations or marketing team I should contact?'}
