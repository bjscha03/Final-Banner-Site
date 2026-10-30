import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../migrate.mjs';
import { createProspect, saveDraft } from '../store.mjs';
import { ingest, reconcileThread, latestText } from '../mail-sync.mjs';
import { incomingRoute, automaticMessage, mailboxAddress, replyIntent, withoutSalesClosing, organizationAuthenticated } from '../conversation-safety.mjs';
import { checkDispatchConversation } from '../dispatch-safety.mjs';
function adapter(db) {
  function sql(strings,...values) {
    const text=typeof strings==='string'?strings:strings.reduce((a,s,i)=>a+(i?'$'+i:'')+s,'');
    if(typeof strings==='string')values=values[0]||[];
    return {q:{text,values},then(resolve,reject){return db.query(text,values).then(r=>r.rows).then(resolve,reject);}};
  }
  sql.transaction=queries=>db.transaction(async tx=>{const out=[];for(const q of queries)out.push((await tx.query(q.q.text,q.q.values)).rows);return out;});
  return sql;
}
const db=new PGlite(),sql=adapter(db);await migrate(sql);
await db.exec('CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(integer,integer) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$');
let sequence=0;
async function fixture() {
  const n=++sequence,domain=`prospect${n}.test`;
  const p=await createProspect(sql,{name:`Buyer ${n}`,segment:'restaurant franchisee',website:`https://${domain}`,source_url:`https://${domain}/contact`,contact_name:'Team',email:`info@${domain}`},'test');
  const out=await saveDraft(sql,{contact_id:p.contact_id,kind:'intro',subject:'Upcoming promotion',body:'A specific introduction.'},'test');
  const thread=`thread-${n}`,rfc=`<intro-${n}@bannersonthefly.com>`;
  await sql`UPDATE daniel_sales.messages SET status='sent',provider_message_id=${'out-'+n},thread_key=${thread},rfc_message_id=${rfc},sent_at=now()-interval '8 days' WHERE id=${out.id}`;
  await sql`INSERT INTO daniel_sales.tasks(contact_id,opportunity_id,kind,due_at,dedupe_key) VALUES(${p.contact_id},${p.opportunity_id},'followup',now(),${'future-'+n})`;
  const [contact]=await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  return {...p,n,domain,thread,rfc,contact,out};
}
function inbound(f,{id=`in-${f.n}`,from=`Reception <reception@${f.domain}>`,text='Thank you. I have forwarded your information to our Marketing department for consideration. Someone will respond if interested.',headers=[],time=Date.now()}={}) {
  return {id,threadId:f.thread,internalDate:String(time),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:from},{name:'To',value:'info@bannersonthefly.com'},{name:'Subject',value:'Re: Upcoming promotion'},{name:'Message-ID',value:`<${id}@${f.domain}>`},{name:'In-Reply-To',value:f.rfc},{name:'References',value:f.rfc},{name:'Authentication-Results',value:`mx.google.com; dmarc=pass header.from=${f.domain}; dkim=pass header.i=@${f.domain};`},...headers],body:{data:Buffer.from(text).toString('base64url')}}};
}
async function draft(f,kind='followup',parent=f.rfc) {
  const m=await saveDraft(sql,{contact_id:f.contact_id,kind,subject:'Re: Upcoming promotion',body:'An appropriate message.',thread_key:f.thread,reply_to_id:parent},'test');
  await sql`UPDATE daniel_sales.messages SET status='queued' WHERE id=${m.id}`;
  return {...m,thread_key:f.thread,reply_to_id:parent,kind};
}
test('incident 675: authenticated receptionist reply is linked to original corporate account and cancels follow-ups',async()=>{
  const f=await fixture(),m=await draft(f),msg=inbound(f);
  assert.equal((await ingest(sql,msg)).created,true);
  const [c]=await sql`SELECT * FROM daniel_sales.contacts WHERE id=${f.contact_id}`;
  assert.ok(c.replied_at);
  const [stored]=await sql`SELECT * FROM daniel_sales.messages WHERE provider_message_id=${msg.id}`;
  assert.equal(stored.contact_id,f.contact_id);assert.equal(stored.ai_metadata.sender_email,`reception@${f.domain}`);
  assert.equal(stored.ai_metadata.reply_recipient,`reception@${f.domain}`);assert.equal(stored.ai_metadata.conversation_intent,'referral');
  const [op]=await sql`SELECT * FROM daniel_sales.opportunities WHERE id=${f.opportunity_id}`;
  assert.equal(op.stage,'replied');assert.match(op.next_action,/await/);
  const [queued]=await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`;assert.equal(queued.status,'blocked');
  const tasks=await sql`SELECT * FROM daniel_sales.tasks WHERE contact_id=${f.contact_id}`;
  assert.equal(tasks.find(t=>t.kind==='followup').status,'cancelled');assert.equal(tasks.filter(t=>t.kind==='reply').length,1);
  assert.equal((await ingest(sql,msg)).duplicate,true);
  assert.equal((await sql`SELECT id FROM daniel_sales.tasks WHERE contact_id=${f.contact_id} AND kind='reply'`).length,1);
});
test('plus-tag automatic acknowledgments never become human replies or create reply loops',async()=>{
  const f=await fixture(),msg=inbound(f,{from:`Info <info+noreply@${f.domain}>`,text:'Thank you for emailing. We will respond within 72 hours.'});
  assert.equal(automaticMessage(msg),true);assert.equal((await ingest(sql,msg)).automatic,true);
  const [c]=await sql`SELECT replied_at FROM daniel_sales.contacts WHERE id=${f.contact_id}`;assert.equal(c.replied_at,null);
  const tasks=await sql`SELECT * FROM daniel_sales.tasks WHERE contact_id=${f.contact_id}`;
  assert.equal(tasks.length,1);assert.equal(tasks[0].status,'pending');
});
test('unrelated personal mail is not imported just because its subject is similar',async()=>{
  const f=await fixture(),msg=inbound(f,{from:'Stranger <stranger@unrelated.test>'});
  msg.threadId='unrelated-thread';msg.payload.headers=msg.payload.headers.filter(h=>!['References','In-Reply-To'].includes(h.name));
  assert.equal((await ingest(sql,msg)).ignored,true);
});
test('lookalike-domain participant is held, not silently ignored or automatically emailed',async()=>{
  const f=await fixture(),msg=inbound(f,{from:`Attacker <person@${f.domain}.evil.test>`});
  assert.equal((await ingest(sql,msg)).held,true);
  const [m]=await sql`SELECT ai_metadata FROM daniel_sales.messages WHERE provider_message_id=${msg.id}`;
  assert.equal(m.ai_metadata.requires_identity_review,true);assert.equal(m.ai_metadata.reply_recipient,null);
  assert.equal((await sql`SELECT id FROM daniel_sales.tasks WHERE contact_id=${f.contact_id} AND kind='reply'`).length,0);
});
test('Reply-To cannot redirect a routine reply to an unverified external address',async()=>{
  const f=await fixture(),msg=inbound(f,{headers:[{name:'Reply-To',value:'other@external.test'}]});
  assert.equal(incomingRoute(msg,f.contact).requires_identity_review,true);
});
test('authentication from an arbitrary server does not authenticate a new colleague',()=>{
  const m={payload:{headers:[{name:'Authentication-Results',value:'attacker.test; dmarc=pass header.from=prospect.test'}]}};
  assert.equal(organizationAuthenticated(m,'prospect.test'),false);
});
test('a missed provider reply is recovered during a fresh pre-dispatch check',async()=>{
  const f=await fixture(),m=await draft(f),msg=inbound(f);
  let reads=0;
  const check=await checkDispatchConversation(sql,m,f.contact,'token',{request:async(_t,path)=>{reads++;assert.match(path,/\/threads\//);return {id:f.thread,messages:[msg]};}});
  assert.equal(check.ok,false);assert.equal(check.reason,'human_reply_received');assert.equal(reads,1);
  assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'blocked');
});
test('failed Gmail conversation fetch is fail-closed without reserving a send',async()=>{
  const f=await fixture(),m=await draft(f);
  const check=await checkDispatchConversation(sql,m,f.contact,'token',{request:async()=>{throw Error('provider unavailable');}});
  assert.equal(check.ok,false);assert.equal(check.reason,'gmail_thread_check_failed');assert.equal(check.retryable,true);
  assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`)[0].status,'queued');
});
test('a reply generated before a newer human message cannot be sent',async()=>{
  const f=await fixture(),old=inbound(f,{id:`old-${f.n}`,text:'What materials do you offer?',time:Date.now()-10000});
  await ingest(sql,old);const m=await draft(f,'reply',`<old-${f.n}@${f.domain}>`);
  const newer=inbound(f,{id:`new-${f.n}`,text:'Please use the artwork I just sent.'});
  const check=await checkDispatchConversation(sql,m,f.contact,'token',{request:async()=>({id:f.thread,messages:[old,newer]})});
  assert.equal(check.reason,'outdated_reply_context');
});
test('a verified colleague receives the reply only at the provider-verified recipient',async()=>{
  const f=await fixture(),msg=inbound(f);await ingest(sql,msg);
  const m=await draft(f,'reply',`<in-${f.n}@${f.domain}>`);m.ai_metadata={reply_recipient:`reception@${f.domain}`};
  const check=await checkDispatchConversation(sql,m,f.contact,'token',{request:async()=>({id:f.thread,messages:[msg]})});
  assert.equal(check.ok,true);assert.equal(check.recipient,`reception@${f.domain}`);
  const bad=await checkDispatchConversation(sql,{...m,ai_metadata:{reply_recipient:'attacker@evil.test'}},f.contact,'token',{request:async()=>({id:f.thread,messages:[msg]})});
  assert.equal(bad.reason,'reply_recipient_changed');
});
test('one human message cannot receive two separate automatic replies',async()=>{
  const f=await fixture(),msg=inbound(f);await ingest(sql,msg);
  const first=await draft(f,'reply',`<in-${f.n}@${f.domain}>`);
  await sql`UPDATE daniel_sales.messages SET status='sent' WHERE id=${first.id}`;
  const second=await draft(f,'reply',`<in-${f.n}@${f.domain}>`);second.ai_metadata={reply_recipient:`reception@${f.domain}`};
  const check=await checkDispatchConversation(sql,second,f.contact,'token',{request:async()=>({id:f.thread,messages:[msg]})});
  assert.equal(check.reason,'reply_already_answered');
});
test('emergency pause is enforced by dispatch independently of worker cached state',async()=>{
  const f=await fixture(),m=await draft(f);
  await sql`UPDATE daniel_sales.settings SET paused=true WHERE id=1`;
  const check=await checkDispatchConversation(sql,m,f.contact,'token',{request:async()=>{throw Error('Must not read or send while paused');}});
  assert.equal(check.reason,'agent_paused');
  await sql`UPDATE daniel_sales.settings SET paused=false WHERE id=1`;
});
test('quoted commercial opt-out footer is excluded from customer intent',()=>{
  const text='Thanks. I forwarded this to Marketing.\n\nOn Thu, October 22 Daniel wrote:\nTo stop outreach, reply unsubscribe.';
  assert.doesNotMatch(latestText(text),/unsubscribe/);assert.equal(replyIntent(latestText(text)),'referral');
});
test('one renderer-owned signature, with no duplicate model closing',()=>{
  assert.equal(withoutSalesClosing('Thank you for passing this along.\n\nLooking forward to hearing from you,\nDaniel, Banners On The Fly Sales Assistant'),'Thank you for passing this along.');
  assert.equal(withoutSalesClosing('This is the answer.\n\nBest regards,\nDaniel'),'This is the answer.');
  assert.equal(withoutSalesClosing('The best material depends on placement.'),'The best material depends on placement.');
});
test('malformed or multiple From mailboxes are never accepted as one recipient',()=>{
  assert.equal(mailboxAddress('a@buyer.test, b@evil.test'),'');assert.equal(mailboxAddress('Buyer <a@buyer.test>\r\nBcc:other@evil.test'),'');
});
