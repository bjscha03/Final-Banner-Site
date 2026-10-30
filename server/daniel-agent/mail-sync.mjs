import { randomUUID } from "node:crypto";
import { gmailRequest, getGmail, listGmail, header, bodyText } from "./gmail.mjs";
import { classifyInbound } from "./policy.mjs";
import { suppress, audit } from "./store.mjs";
import { gmailTestRecipients } from "./config.mjs";
import { BOF_SENDER } from './identity.mjs';
import { mailboxAddress, automaticMessage, replyIntent, incomingRoute, resolveConversationContact, holdAccountFollowups } from './conversation-safety.mjs';

// Acceptance tests read only the expiring owner allowlist and never advance
// the regular history cursor.
export async function syncControlledInbox(sql, token, env) {
  const recipients = gmailTestRecipients(env);
  if (!recipients.length) throw Error("Controlled Gmail testing is disabled or expired");
  let count = 0, created = 0, duplicates = 0;
  for (const email of recipients) {
    let pageToken;
    for (let page = 0; page < 10; page++) {
      const listing = await listGmail(token, `from:${email} subject:"Daniel QA" newer_than:1d -in:drafts`, 15, pageToken);
      for (const item of listing.messages || []) {
        const message = await getGmail(token, item.id);
        if (senderAddress(header(message, "From")) !== email || !header(message, "Subject").includes("Daniel QA")) continue;
        const r = await ingest(sql, message, "gmail-acceptance-test");
        count++;
        if (r.created) created++;
        if (r.duplicate) duplicates++;
      }
      pageToken = listing.nextPageToken;
      if (!pageToken) break;
    }
    if (pageToken) return { count, created, duplicates, complete: false };
  }
  return { count, created, duplicates, complete: true };
}
export function senderAddress(s) { return mailboxAddress(s); }
export function latestText(s) {
  return String(s || '').split(/\n\s*(?:On .{3,300}wrote:|From:|_{5,}|>{1,})/i)[0].trim();
}
export async function ingest(sql, message, actor = "gmail-sync") {
  if (!message?.id || message.labelIds?.includes("DRAFT")) return { ignored: true };
  const [known] = await sql`SELECT direction FROM daniel_sales.messages WHERE provider_message_id=${message.id}`;
  if (known) return known.direction === "outbound" ? { ignored: true } : { duplicate: true };
  const email = senderAddress(header(message, "From")), text = latestText(bodyText(message));
  if (!email || email === BOF_SENDER) return { ignored: true };
  // Preserve existing verified DSN handling. A subject or body claim alone is
  // not enough to suppress a recipient as a hard bounce.
  if (/^(mailer-daemon|postmaster)@/i.test(email)) {
    const fragments = [];
    function walk(part) {
      if (part?.body?.data) fragments.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
      for (const child of part?.parts || []) walk(child);
    }
    walk(message.payload);
    const dsn = fragments.join("\n");
    const recipient = dsn.match(/Final-Recipient:\s*rfc822;\s*([^\s<>]+)/i)?.[1]?.toLowerCase();
    if (recipient && /Status:\s*5\.\d+\.\d+/i.test(dsn)) {
      const [outbound] = await sql`SELECT m.id FROM daniel_sales.messages m JOIN daniel_sales.contacts c ON c.id=m.contact_id WHERE lower(c.email)=${recipient} AND m.thread_key=${message.threadId} AND m.direction='outbound' AND m.status IN ('sent','simulated') LIMIT 1`;
      if (outbound) { await suppress(sql, recipient, "Hard bounce confirmed in outbound thread", actor); return { bounced: true }; }
    }
    return { ignored: true };
  }
  const resolved = await resolveConversationContact(sql, message);
  if (!resolved) return { ignored: true }; // Unrelated personal mail is not stored.
  if (resolved.ambiguous) {
    for (const accountId of resolved.accountIds) await holdAccountFollowups(sql, accountId, 'Ambiguous inbound conversation; manual identity review required');
    await audit(sql, actor, 'ambiguous_inbound_held', 'gmail_message', message.id, {account_ids:resolved.accountIds,thread_id:message.threadId});
    return { held: true, reason: 'ambiguous_account' };
  }
  const c = resolved.contact;
  const peers = await sql`SELECT email FROM daniel_sales.contacts WHERE account_id=${c.account_id}`;
  const route = incomingRoute(message, c, peers);
  const automatic = automaticMessage(message), intent = replyIntent(text);
  const classified = classifyInbound(text);
  const cls = automatic ? 'automated' : intent === 'referral' && !['unsubscribe','decline','escalate'].includes(classified) ? 'needs_review' : classified;
  const id = randomUUID(), thread = message.threadId;
  const timestamp = Number(message.internalDate);
  const receivedAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : new Date().toISOString();
  const metadata = {...route,conversation_match:resolved.match,conversation_intent:intent,provider_received_at:receivedAt};
  const insert = sql`INSERT INTO daniel_sales.messages(id,contact_id,direction,status,provider_message_id,idempotency_key,body,subject,thread_key,rfc_message_id,classification,kind,ai_metadata,created_at) VALUES(${id},${c.id},'inbound','received',${message.id},${"gmail:" + message.id},${text},${header(message, "Subject")},${thread},${header(message, "Message-ID")},${cls},'reply',${JSON.stringify(metadata)}::jsonb,${receivedAt}::timestamptz) ON CONFLICT(provider_message_id) DO NOTHING RETURNING id`;
  // Automatic acknowledgments are stored but never treated as a human answer,
  // never answered, and never allowed to trigger an unsubscribe loop.
  if (automatic) {
    const rows = await insert;
    if (!rows.length) return {duplicate:true};
    await audit(sql, actor, 'automatic_acknowledgment_received', 'message', id, {sender:email,thread_id:thread});
    return {created:true,automatic:true};
  }
  const nextAction = route.requires_identity_review ? 'Review sender identity before replying; cold follow-ups stopped' : intent === 'referral' ? 'Acknowledge referral once, then await the referred team; do not restart cold outreach' : intent === 'deferred' ? 'Read requested timing and schedule a contextual next action' : 'Review customer reply';
  const result = await sql.transaction([
    insert,
    sql`UPDATE daniel_sales.contacts SET replied_at=greatest(coalesce(replied_at,${receivedAt}::timestamptz),${receivedAt}::timestamptz) WHERE account_id=${c.account_id}`,
    sql`UPDATE daniel_sales.messages SET status='blocked',error='Human response received in account conversation',updated_at=now() WHERE contact_id IN (SELECT id FROM daniel_sales.contacts WHERE account_id=${c.account_id}) AND kind IN ('intro','followup') AND status IN ('draft','pending_approval','queued')`,
    sql`UPDATE daniel_sales.tasks SET status='cancelled',note='Human response received in account conversation' WHERE contact_id IN (SELECT id FROM daniel_sales.contacts WHERE account_id=${c.account_id}) AND kind='followup' AND status='pending'`,
    sql`UPDATE daniel_sales.opportunities SET stage=CASE WHEN stage IN ('won','lost','do_not_contact') THEN stage ELSE ${cls === 'quote_request' ? 'quote_requested' : intent !== 'referral' && /\b(i am interested|i'm interested|we are interested|we're interested|sounds good|tell me more)\b/i.test(text) && cls === 'needs_review' ? 'interested' : 'replied'} END,next_action=${nextAction},next_action_at=now() WHERE account_id=${c.account_id} AND stage NOT IN ('won','lost','do_not_contact')`
  ]);
  if (!result[0].length) return {duplicate:true};
  if (route.requires_identity_review || !text) {
    await audit(sql, actor, 'inbound_requires_identity_review', 'message', id, metadata);
    return {created:true,held:true};
  }
  if (['unsubscribe','decline'].includes(cls)) {
    for (const peer of peers) await suppress(sql, peer.email, 'Inbound ' + cls + ' in verified account conversation', actor);
    if (!peers.some(p => p.email.toLowerCase() === email)) await suppress(sql, email, 'Inbound ' + cls, actor);
  } else {
    await sql`INSERT INTO daniel_sales.tasks(contact_id,opportunity_id,kind,due_at,note,dedupe_key) SELECT ${c.id},id,'reply',now(),${intent === 'referral' ? 'Acknowledge referral without a sales pitch; then wait' : cls},${'reply:' + message.id} FROM daniel_sales.opportunities WHERE account_id=${c.account_id} LIMIT 1 ON CONFLICT(dedupe_key) DO NOTHING`;
  }
  await audit(sql, actor, 'inbound_received', 'message', id, {classification:cls,...metadata});
  return {created:true};
}

// A provider thread refresh is the final source of truth before follow-ups and
// replies. It also recovers replies previously ignored by exact-address logic.
export async function reconcileThread(sql, token, threadId, request = gmailRequest) {
  if (!token || !threadId) throw Error('A current Gmail conversation is required');
  const thread = await request(token, '/threads/' + encodeURIComponent(threadId) + '?format=full');
  if (thread.id !== threadId || !Array.isArray(thread.messages) || thread.messages.length > 500) throw Error('Gmail conversation could not be verified completely');
  let created=0, held=false;
  for (const message of [...thread.messages].sort((a,b) => Number(a.internalDate || 0)-Number(b.internalDate || 0))) {
    const result = await ingest(sql, {...message,threadId}, 'pre-dispatch-thread-check');
    if (result.created) created++;
    if (result.held) held=true;
  }
  const human = await sql`SELECT * FROM daniel_sales.messages WHERE thread_key=${threadId} AND direction='inbound' AND classification IS DISTINCT FROM 'automated' ORDER BY created_at DESC,id DESC LIMIT 1`;
  return {created,held,latestHuman:human[0] || null};
}

export async function syncMailbox(sql, token, providers = {}) {
  const request = providers.request || gmailRequest, getMessage = providers.getMessage || getGmail, listMessages = providers.listMessages || listGmail;
  let [box] = await sql`SELECT * FROM daniel_sales.mailbox WHERE id=1`;
  if (!box?.email) throw Error('Gmail is not connected');
  let count=0,created=0,duplicates=0,complete=false;
  if (!box.history_id && !box.sync_start_history) {
    const p = await request(token, '/profile');
    const after = 'after:' + Math.floor((Date.now()-30*86400000)/1000);
    const contacts = await sql`SELECT lower(email) AS email FROM daniel_sales.contacts ORDER BY id`;
    const queries=[];
    for (let i=0;i<contacts.length;i+=50) {
      const senders=contacts.slice(i,i+50).map(c => 'from:"'+c.email.replace(/["\\]/g,'')+'"').join(' ');
      queries.push(`${after} -in:drafts {${senders}}`);
    }
    // Include responses by colleagues, not only the originally contacted From.
    // ingest still discards all mail unrelated to recorded sales conversations.
    queries.push(`in:anywhere ${after} -in:drafts {to:"${BOF_SENDER}" cc:"${BOF_SENDER}"}`);
    queries.push(`${after} {from:mailer-daemon from:postmaster}`);
    const q=JSON.stringify({queries,index:0});
    await sql`UPDATE daniel_sales.mailbox SET sync_start_history=${p.historyId},initial_query=${q},page_token=NULL WHERE id=1`;
    box={...box,sync_start_history:p.historyId,initial_query:q,page_token:null};
  }
  for (let page=0;page<1;page++) {
    const initial=box.initial_query?.startsWith('{') ? JSON.parse(box.initial_query) : null;
    let listing;
    try {
      listing=box.history_id ? await request(token,'/history?'+new URLSearchParams({startHistoryId:box.history_id,historyTypes:'messageAdded',maxResults:'15',...(box.page_token?{pageToken:box.page_token}:{})})) : await listMessages(token,initial?initial.queries[initial.index]:box.initial_query,15,box.page_token);
    } catch(e) {
      if(e.status===404 && box.history_id) {
        await sql`UPDATE daniel_sales.mailbox SET history_id=NULL,page_token=NULL,sync_start_history=NULL,last_error='History expired; 30-day reconciliation on next sync' WHERE id=1`;
        return {reset:true,count,created,duplicates};
      }
      throw e;
    }
    const ids=box.history_id ? [...new Set((listing.history||[]).flatMap(h=>(h.messagesAdded||[]).map(x=>x.message.id)))] : [...new Set((listing.messages||[]).map(x=>x.id))];
    for(const id of ids) {
      let message;
      try {message=await getMessage(token,id);} catch(e){if(e.status===404)continue;throw e;}
      const r=await ingest(sql,message);count++;
      if(r.created)created++;if(r.duplicate)duplicates++;
    }
    if(listing.nextPageToken) {
      await sql`UPDATE daniel_sales.mailbox SET page_token=${listing.nextPageToken},last_sync_at=now(),last_error=NULL WHERE id=1`;
      box.page_token=listing.nextPageToken;
    } else if(!box.history_id && initial && initial.index+1<initial.queries.length) {
      initial.index++;
      await sql`UPDATE daniel_sales.mailbox SET initial_query=${JSON.stringify(initial)},page_token=NULL,last_sync_at=now(),last_error=NULL WHERE id=1`;
      break;
    } else {
      await sql`UPDATE daniel_sales.mailbox SET history_id=${listing.historyId||box.sync_start_history},page_token=NULL,sync_start_history=NULL,initial_query=NULL,last_sync_at=now(),last_error=NULL WHERE id=1`;
      complete=true;break;
    }
  }
  return {count,created,duplicates,complete};
}
