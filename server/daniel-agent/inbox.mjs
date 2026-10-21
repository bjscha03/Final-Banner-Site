import {header,bodyText} from './gmail.mjs';
export function parseInbound(message){
 const from=header(message,'From'),to=header(message,'To'),subject=header(message,'Subject');
 const sender=from.match(/<([^<>]+)>/)?.[1]||from;
 const email=sender.trim().toLowerCase();
 return {providerId:message.id,threadId:message.threadId,email,subject,to,text:bodyText(message)};
}
export function isRelatedInbound(item,knownContacts=[]){
 if(!item?.email||!item.providerId)return false;
 return knownContacts.some(c=>String(c.email||'').toLowerCase()===item.email);
}
export function nextReplyAction(classification){
 switch(classification){
 case 'unsubscribe':return 'suppress_after_identity_check';
 case 'decline':return 'suppress_after_identity_check';
 case 'quote_request':return 'gather_quote_requirements';
 case 'meeting_request':return 'review_calendar_availability';
 case 'escalate':return 'owner_approval';
 default:return 'review_full_thread';
 }
}
