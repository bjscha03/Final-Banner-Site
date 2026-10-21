import { randomUUID } from "node:crypto";
import {
  gmailRequest,
  getGmail,
  listGmail,
  header,
  bodyText,
} from "./gmail.mjs";
import { classifyInbound } from "./policy.mjs";
import { suppress, audit } from "./store.mjs";
import { gmailTestRecipients } from "./config.mjs";
// Acceptance tests read real messages only from the expiring owner allowlist.
// They do not advance the regular mailbox history cursor or import other mail.
export async function syncControlledInbox(sql, token, env) {
  const recipients = gmailTestRecipients(env);
  if (!recipients.length) throw Error("Controlled Gmail testing is disabled or expired");
  let count = 0, created = 0, duplicates = 0;
  for (const email of recipients) {
    let pageToken;
    for (let page = 0; page < 10; page++) {
      const listing = await listGmail(token, `from:${email} subject:"Daniel QA" newer_than:1d -in:sent -in:drafts`, 15, pageToken);
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
export function senderAddress(s) {
  return (String(s || "").match(/<([^<>]+)>/)?.[1] || String(s || ""))
    .trim()
    .toLowerCase();
}
export function latestText(s) {
  return s.split(/\n(?:On .{3,200}wrote:|From:|_{5,}|>{1,})/i)[0].trim();
}
export async function ingest(sql, message, actor = "gmail-sync") {
  if (message.labelIds?.includes("SENT") || message.labelIds?.includes("DRAFT"))
    return { ignored: true };
  const email = senderAddress(header(message, "From")),
    text = latestText(bodyText(message));
  // A hard-bounce DSN must match a known outbound thread and an explicit recipient.
  if (/^(mailer-daemon|postmaster)@/i.test(email)) {
    const fragments = [];
    function walk(part) {
      if (part?.body?.data)
        fragments.push(
          Buffer.from(part.body.data, "base64url").toString("utf8"),
        );
      for (const child of part?.parts || []) walk(child);
    }
    walk(message.payload);
    const dsn = fragments.join("\n");
    const recipient = dsn
      .match(/Final-Recipient:\s*rfc822;\s*([^\s<>]+)/i)?.[1]
      ?.toLowerCase();
    if (recipient && /Status:\s*5\.\d+\.\d+/i.test(dsn)) {
      const [outbound] =
        await sql`SELECT m.id FROM daniel_sales.messages m JOIN daniel_sales.contacts c ON c.id=m.contact_id WHERE lower(c.email)=${recipient} AND m.thread_key=${message.threadId} AND m.direction='outbound' AND m.status IN ('sent','simulated') LIMIT 1`;
      if (outbound) {
        await suppress(
          sql,
          recipient,
          "Hard bounce confirmed in outbound thread",
          actor,
        );
        return { bounced: true };
      }
    }
    return { ignored: true };
  }
  const [c] =
    await sql`SELECT * FROM daniel_sales.contacts WHERE lower(email)=${email}`;
  if (!c) return { ignored: true }; // Never import unrelated personal inbox contents.
  const cls = classifyInbound(text),
    id = randomUUID(),
    thread = message.threadId;
  const result = await sql.transaction([
    sql`INSERT INTO daniel_sales.messages(id,contact_id,direction,status,provider_message_id,idempotency_key,body,subject,thread_key,rfc_message_id,classification,kind) VALUES(${id},${c.id},'inbound','received',${message.id},${"gmail:" + message.id},${text},${header(message, "Subject")},${thread},${header(message, "Message-ID")},${cls},'reply') ON CONFLICT(provider_message_id) DO NOTHING RETURNING id`,
    sql`UPDATE daniel_sales.contacts SET replied_at=now() WHERE id=${c.id}`,
    sql`UPDATE daniel_sales.messages SET status='blocked',error='Reply received; review conversation',updated_at=now() WHERE contact_id=${c.id} AND kind IN ('intro','followup') AND status IN ('draft','pending_approval','queued')`,
    sql`UPDATE daniel_sales.tasks SET status='cancelled',note='Reply received' WHERE contact_id=${c.id} AND kind='followup' AND status='pending'`,
    sql`UPDATE daniel_sales.opportunities SET stage=CASE WHEN stage IN ('won','lost','do_not_contact') THEN stage ELSE 'replied' END,next_action='Review customer reply',next_action_at=now() WHERE account_id=${c.account_id} AND stage NOT IN ('won','lost','do_not_contact')`,
  ]);
  if (!result[0].length) return { duplicate: true };
  if (["unsubscribe", "decline"].includes(cls))
    await suppress(sql, email, "Inbound " + cls, actor);
  else
    await sql`INSERT INTO daniel_sales.tasks(contact_id,opportunity_id,kind,due_at,note,dedupe_key) SELECT ${c.id},id,'reply',now(),${cls},${"reply:" + message.id} FROM daniel_sales.opportunities WHERE account_id=${c.account_id} LIMIT 1 ON CONFLICT(dedupe_key) DO NOTHING`;
  await audit(sql, actor, "inbound_received", "message", id, {
    classification: cls,
  });
  return { created: true };
}
export async function syncMailbox(sql, token, providers = {}) {
  const request = providers.request || gmailRequest,
    getMessage = providers.getMessage || getGmail,
    listMessages = providers.listMessages || listGmail;
  let [box] = await sql`SELECT * FROM daniel_sales.mailbox WHERE id=1`;
  if (!box?.email) throw Error("Gmail is not connected");
  let count = 0,
    created = 0,
    duplicates = 0,
    complete = false;
  if (!box.history_id && !box.sync_start_history) {
    const p = await request(token, "/profile");
    const after = "after:" + Math.floor((Date.now() - 30 * 86400000) / 1000);
    const contacts = await sql`SELECT lower(email) AS email FROM daniel_sales.contacts ORDER BY id`;
    const queries = [];
    for (let i = 0; i < contacts.length; i += 50) {
      const senders = contacts.slice(i, i + 50).map(c => 'from:"' + c.email.replace(/["\\]/g, '') + '"').join(' ');
      queries.push(`${after} -in:sent -in:drafts {${senders}}`);
    }
    queries.push(`${after} {from:mailer-daemon from:postmaster}`);
    const q = JSON.stringify({ queries, index: 0 });
    await sql`UPDATE daniel_sales.mailbox SET sync_start_history=${p.historyId},initial_query=${q},page_token=NULL WHERE id=1`;
    box = {
      ...box,
      sync_start_history: p.historyId,
      initial_query: q,
      page_token: null,
    };
  }
  for (let page = 0; page < 1; page++) {
    const initial = box.initial_query?.startsWith('{') ? JSON.parse(box.initial_query) : null;
    let listing;
    try {
      listing = box.history_id
        ? await request(
            token,
            "/history?" +
              new URLSearchParams({
                startHistoryId: box.history_id,
                historyTypes: "messageAdded",
                maxResults: "15",
                ...(box.page_token ? { pageToken: box.page_token } : {}),
              }),
          )
        : await listMessages(token, initial ? initial.queries[initial.index] : box.initial_query, 15, box.page_token);
    } catch (e) {
      if (e.status === 404 && box.history_id) {
        await sql`UPDATE daniel_sales.mailbox SET history_id=NULL,page_token=NULL,sync_start_history=NULL,last_error='History expired; 30-day reconciliation on next sync' WHERE id=1`;
        return { reset: true, count, created, duplicates };
      }
      throw e;
    }
    const ids = box.history_id
      ? [
          ...new Set(
            (listing.history || []).flatMap((h) =>
              (h.messagesAdded || []).map((x) => x.message.id),
            ),
          ),
        ]
      : [...new Set((listing.messages || []).map((x) => x.id))];
    for (const id of ids) {
      let message;
      try {
        message = await getMessage(token, id);
      } catch (e) {
        if (e.status === 404) continue;
        throw e;
      }
      const r = await ingest(sql, message);
      count++;
      if (r.created) created++;
      if (r.duplicate) duplicates++;
    }
    if (listing.nextPageToken) {
      await sql`UPDATE daniel_sales.mailbox SET page_token=${listing.nextPageToken},last_sync_at=now(),last_error=NULL WHERE id=1`;
      box.page_token = listing.nextPageToken;
    } else if (!box.history_id && initial && initial.index + 1 < initial.queries.length) {
      initial.index++;
      await sql`UPDATE daniel_sales.mailbox SET initial_query=${JSON.stringify(initial)},page_token=NULL,last_sync_at=now(),last_error=NULL WHERE id=1`;
      break;
    } else {
      await sql`UPDATE daniel_sales.mailbox SET history_id=${listing.historyId || box.sync_start_history},page_token=NULL,sync_start_history=NULL,initial_query=NULL,last_sync_at=now(),last_error=NULL WHERE id=1`;
      complete = true;
      break;
    }
  }
  return { count, created, duplicates, complete };
}
