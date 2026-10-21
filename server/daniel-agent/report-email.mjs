import { createHash } from 'node:crypto';
import { easternDate } from './policy.mjs';
import { report } from './reporting.mjs';
import { mode, gmailTestRecipients } from './config.mjs';
import { sendGmail, gmailRequest, listGmail } from './gmail.mjs';
import { BOF_SENDER, REPORT_RECIPIENT, BUSINESS_ADDRESS, verifySender } from './identity.mjs';
import { escapeHtml as esc } from './validation.mjs';
export function reportDue(now) {
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 return !['Sat','Sun'].includes(p.find(x=>x.type==='weekday').value) && Number(p.find(x=>x.type==='hour').value)>=20;
}
export function renderReport(data, details, preview=false) {
 const labels={newProspects:'New qualified prospects',introductions:'Initial emails accepted by Gmail',followups:'Follow-ups accepted by Gmail',repliesSent:'Replies sent',received:'Incoming replies',interested:'Interested accounts',quoteRequests:'Quote requests',openOpportunities:'Open sales opportunities'};
 return '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:680px;margin:24px auto;background:white;padding:32px;border-top:6px solid #2563eb"><p style="color:#2563eb;font-weight:bold">BANNERS ON THE FLY</p><h1 style="font-size:26px">Daniel’s daily sales report</h1><p>'+esc(data.date)+' · Eastern time'+(preview?' · Controlled acceptance test':'')+'</p><table style="width:100%;border-collapse:collapse">'+Object.entries(labels).map(([k,label])=>'<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0">'+label+'</td><td style="text-align:right;font-weight:bold;border-bottom:1px solid #e2e8f0">'+Number(details[k]||0)+'</td></tr>').join('')+'</table><h2 style="font-size:18px">Accounts and next steps</h2>'+ (details.accounts.length?'<ul>'+details.accounts.map(a=>'<li>'+esc(a.name)+' — '+esc(a.stage)+'; '+esc(a.next_action||'No action pending')+'</li>').join('')+'</ul>':'<p>No open account activity recorded.</p>')+'<p>Pending approvals: '+Number(data.pendingApprovals)+' · Uncertain deliveries held for review: '+Number(data.uncertain)+'</p><p style="font-size:12px;color:#64748b">Sent means Gmail accepted the message; delivery, interest and revenue are not inferred. Test sends are excluded from production sales counts.</p><p>Best,<br><strong>Brad</strong><br>Team Manager · Banners On The Fly</p><p style="font-size:11px;color:#64748b">'+BUSINESS_ADDRESS+'</p></div></body></html>';
}
export async function emailDailyReport(sql,env,token,{now=new Date(),gmailTest=false,send=sendGmail,verifyIdentity=verifySender,list=listGmail}={}) {
 if(gmailTest){if(!gmailTestRecipients(env,now).includes(REPORT_RECIPIENT))throw Error('Report test recipient not authorized');}
 else if(mode(env)!=='live'||!reportDue(now))return {status:'not_due'};
 const day=easternDate(now), key=(gmailTest?'qa:':'daily:')+day;
 const data=await report(sql,day);
 const [metrics]=await sql`SELECT count(*) FILTER(WHERE kind='intro' AND direction='outbound' AND status='sent')::int AS introductions,count(*) FILTER(WHERE kind='followup' AND direction='outbound' AND status='sent')::int AS followups,count(*) FILTER(WHERE kind='reply' AND direction='outbound' AND status='sent')::int AS "repliesSent",count(*) FILTER(WHERE direction='inbound')::int AS received FROM daniel_sales.messages m JOIN daniel_sales.contacts c ON c.id=m.contact_id WHERE (coalesce(m.sent_at,m.created_at) AT TIME ZONE 'America/New_York')::date=${day}::date AND coalesce((c.research->>'qa')::boolean,false)=${gmailTest} AND m.status<>'simulated' AND (m.direction='inbound' OR coalesce((m.ai_metadata->>'gmail_test')::boolean,false)=${gmailTest})`;
 const [prospects]=await sql`SELECT count(*)::int AS n FROM daniel_sales.contacts WHERE (created_at AT TIME ZONE 'America/New_York')::date=${day}::date AND research->>'verified'='true' AND coalesce((research->>'qa')::boolean,false)=${gmailTest}`;
 const accounts=await sql`SELECT DISTINCT o.id,a.name,o.stage,o.next_action,o.next_action_at FROM daniel_sales.opportunities o JOIN daniel_sales.accounts a ON a.id=o.account_id JOIN daniel_sales.contacts c ON c.account_id=a.id WHERE coalesce((c.research->>'qa')::boolean,false)=${gmailTest} AND o.stage NOT IN ('won','lost','do_not_contact') ORDER BY o.next_action_at LIMIT 100`;
 const [totals]=await sql`SELECT count(*) FILTER(WHERE o.stage='interested')::int AS interested,count(*) FILTER(WHERE o.stage IN ('quote_requested','quote_pending_approval'))::int AS "quoteRequests",count(*)::int AS "openOpportunities" FROM daniel_sales.opportunities o WHERE o.stage NOT IN ('won','lost','do_not_contact') AND EXISTS(SELECT 1 FROM daniel_sales.contacts c WHERE c.account_id=o.account_id AND coalesce((c.research->>'qa')::boolean,false)=${gmailTest})`;
 const details={...metrics,...totals,newProspects:prospects.n,accounts};
 const subject=(gmailTest?'[Daniel QA] ':'')+'BOF daily sales report — '+day;
 const html=renderReport(data,details,gmailTest), rfc='<daniel-report.'+createHash('sha256').update(key).digest('hex').slice(0,24)+'@bannersonthefly.com>';
 await sql`INSERT INTO daniel_sales.report_outbox(report_key,local_date,recipient,subject,html,rfc_message_id) VALUES(${key},${day},${REPORT_RECIPIENT},${subject},${html},${rfc}) ON CONFLICT DO NOTHING`;
 const [previous]=await sql`SELECT * FROM daniel_sales.report_outbox WHERE report_key=${key}`;
 if(previous.status==='sent')return {status:'already_sent',id:previous.provider_message_id};
 if(previous.status!=='queued'){
   const found=previous.provider_message_id?{messages:[{id:previous.provider_message_id}]}:await list(token,'in:sent rfc822msgid:'+rfc.replace(/[<>]/g,''));
   if(found.messages?.length){await sql`UPDATE daniel_sales.report_outbox SET status='sent',provider_message_id=${found.messages[0].id},sent_at=coalesce(sent_at,now()),error=NULL WHERE report_key=${key}`;return {status:'reconciled',id:found.messages[0].id};}
   return {status:'uncertain_held'};
 }
 await verifyIdentity(token,gmailRequest);
 const [claim]=await sql`UPDATE daniel_sales.report_outbox SET status='sending' WHERE report_key=${key} AND status='queued' RETURNING *`;
 if(!claim)return {status:'busy'};
 try {
   if(gmailTest&&!gmailTestRecipients(env).includes(REPORT_RECIPIENT))throw Error('Report test window expired');
   const delivered=await send(token,{from:'Brad | Banners On The Fly <'+BOF_SENDER+'>',to:REPORT_RECIPIENT,replyTo:BOF_SENDER,subject:claim.subject,html:claim.html,rfcMessageId:rfc});
   await sql`UPDATE daniel_sales.report_outbox SET status='sent',provider_message_id=${delivered.id},sent_at=now(),error=NULL WHERE report_key=${key}`;
   return {status:'sent',id:delivered.id};
 }catch(e){await sql`UPDATE daniel_sales.report_outbox SET status='uncertain',error='Outcome requires reconciliation; never automatically resend' WHERE report_key=${key} AND status='sending'`;throw e;}
}
