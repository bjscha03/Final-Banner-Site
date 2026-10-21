import {database,claimTask,logEvent} from './db.mjs';
import {accessToken,listGmail,getGmail,header,bodyText} from './gmail.mjs';
import {classifyInbound} from './policy.mjs';
export async function runWorker(env=process.env){
 if(env.DANIEL_AGENT_MODE!=='shadow')return {status:'disabled',reason:'Only shadow mode is authorized until end-to-end tests and cutover'};
 const sql=database(env),token=await accessToken(env);
 const list=await listGmail(token,'in:anywhere newer_than:2d -in:trash',75);
 let scanned=0,created=0,duplicates=0;
 for(const item of list.messages||[]){
   const msg=await getGmail(token,item.id);scanned++;
   const from=header(msg,'From'),to=header(msg,'To'),subject=header(msg,'Subject');
   const isBof=/info@bannersonthefly\.com/i.test(to+' '+subject);
   if(!isBof)continue;
   const classification=classifyInbound(bodyText(msg));
   const rows=await sql`INSERT INTO daniel_sales.messages(provider_message_id,idempotency_key,direction,thread_key,classification,status,body) VALUES(${item.id},${'gmail:'+item.id},'inbound',${msg.threadId},${classification},'received',${bodyText(msg)}) ON CONFLICT(provider_message_id) DO NOTHING RETURNING id`;
   if(!rows.length){duplicates++;continue}created++;
   await logEvent(sql,'message',rows[0].id,'inbound_ingested',{from,subject,classification});
   if(classification==='unsubscribe'||classification==='decline'){
     const email=from.match(/<([^>]+)>/)?.[1]||from;
     await sql`UPDATE daniel_sales.contacts SET suppressed_at=now(),suppression_reason=${classification} WHERE lower(email)=lower(${email}) AND suppressed_at IS NULL`;
   }
 }
 const due=await sql`SELECT id FROM daniel_sales.tasks WHERE status='pending' AND due_at<=now() ORDER BY due_at LIMIT 50`;
 return {status:'shadow',scanned,created,duplicates,dueTasks:due.length,outboundSends:0};
}
