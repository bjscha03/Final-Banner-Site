import { checkDispatchConversation } from './dispatch-safety.mjs';
import { renderSalesEmail } from './email-design.mjs';
import { validTeamOffer } from './team-offer.mjs';
import { BUSINESS_ADDRESS, BOF_SENDER, verifySender } from "./identity.mjs";
import { canDispatch, isEndBuyer } from "./operations.mjs";
import { mode, gmailTestRecipients } from "./config.mjs";
import { sendGmail, listGmail, getGmail, header, gmailRequest } from "./gmail.mjs";
import { escapeHtml } from "./validation.mjs";
import { nextBusinessFollowup } from "./scheduling.mjs";
import { audit } from "./store.mjs";
export async function finish(sql, m, result, preview) {
  const status = preview ? "simulated" : "sent";
  await sql.transaction([
    sql`WITH finished AS (UPDATE daniel_sales.messages SET status=${status},provider_message_id=${result.id || null},thread_key=${result.threadId || m.thread_key},rfc_message_id=coalesce(${result.rfcMessageId || null},rfc_message_id),ai_metadata=ai_metadata || ${JSON.stringify(result.rfcMessageId ? {gmail_headers_verified:true} : {})}::jsonb,sent_at=${preview ? null : new Date().toISOString()}::timestamptz,lease_until=NULL,updated_at=now(),error=NULL WHERE id=${m.id} AND status IN ('sending','uncertain') RETURNING quota_date,quota_kind) UPDATE daniel_sales.daily_limits SET reserved_count=greatest(0,reserved_count-1),sent_count=sent_count+1 WHERE (local_date,kind) IN (SELECT quota_date,quota_kind FROM finished)`,
    sql`INSERT INTO daniel_sales.audit_events(entity_type,entity_id,event_type,actor,metadata_json) VALUES('message',${m.id},${status},'daniel-worker',${JSON.stringify({ provider_id: result.id || null })}::jsonb)`,
  ]);
  if (["intro", "followup"].includes(m.kind)) {
    const [stats] =
      await sql`SELECT count(*)::int AS n FROM daniel_sales.messages WHERE contact_id=${m.contact_id} AND kind='followup' AND status IN ('sent','simulated')`;
    if (stats.n < 2)
      await sql`INSERT INTO daniel_sales.tasks(contact_id,opportunity_id,kind,due_at,note,dedupe_key) SELECT ${m.contact_id},${m.opportunity_id},'followup',${nextBusinessFollowup(new Date())},'Prepare follow-up if still unanswered',${"followup:" + m.id} WHERE NOT EXISTS(SELECT 1 FROM daniel_sales.contacts p WHERE p.account_id=(SELECT account_id FROM daniel_sales.contacts WHERE id=${m.contact_id}) AND p.replied_at IS NOT NULL) ON CONFLICT(dedupe_key) DO NOTHING`;
    if (!preview)
      await sql`UPDATE daniel_sales.opportunities SET stage='contacted',next_action='Review response or scheduled follow-up',next_action_at=${nextBusinessFollowup(new Date())} WHERE id=${m.opportunity_id} AND stage IN ('researched','qualified','contacted')`;
  }
}
export async function dispatch(
  sql,
  env,
  token,
  { send = sendGmail, getMessage = getGmail, now = new Date(), gmailTest = false, verifyIdentity = verifySender, request = gmailRequest } = {},
) {
  const preview = mode(env) !== "live" && !gmailTest;
  if (gmailTest && !gmailTestRecipients(env).length) throw Error("Controlled Gmail testing is disabled or expired");
  if (!preview) await verifyIdentity(token, gmailRequest);
  let simulated = 0,
    sent = 0,
    blocked = 0,
    held = 0;
  const queued =
    await sql`SELECT * FROM daniel_sales.messages WHERE status='queued' AND due_at<=now() ORDER BY (kind='reply') DESC,due_at LIMIT 25`;
  for (const item of queued) {
    const [c] =
      await sql`SELECT c.*,a.segment,a.team_offer FROM daniel_sales.contacts c JOIN daniel_sales.accounts a ON a.id=c.account_id WHERE c.id=${item.contact_id}`;
    if (!c) continue;
    if (item.ai_metadata?.team_offer && (!validTeamOffer(item.ai_metadata.team_offer, env) || item.ai_metadata.team_offer.code !== c.team_offer?.code)) { held++; continue; }

    if (gmailTest && !gmailTestRecipients(env).includes(c.email.toLowerCase())) {
      held++;
      continue;
    }
    const [stats] =
      await sql`SELECT count(*) FILTER(WHERE kind='followup')::int AS followups,max(updated_at) AS last FROM daniel_sales.messages WHERE contact_id=${c.id} AND direction='outbound' AND status IN ('sent','simulated')`;
    const guard =
      item.kind === "reply"
        ? {
            ok:
              !c.suppressed_at &&
              isEndBuyer(c) &&
              !!c.verified_source_url &&
              !!item.thread_key && !!item.reply_to_id,
          }
        : canDispatch({
            contact: { ...c, replied: !!c.replied_at },
            account: c,
            kind: item.kind,
            now,
            followups: stats.followups,
            lastFollowupAt: stats.last,
          });
    if (!guard.ok) {
      if (
        [
          "suppressed",
          "reply_received",
          "followup_limit",
          "supplier_excluded",
          "invalid_email",
          "unverified_contact",
        ].includes(guard.reason)
      ) {
        await sql`UPDATE daniel_sales.messages SET status='blocked',error=${guard.reason},updated_at=now() WHERE id=${item.id} AND status='queued'`;
        blocked++;
      } else held++;
      continue;
    }
    const conversation = await checkDispatchConversation(sql, item, c, token, {preview, gmailTest, request});
    if (!conversation.ok) {
      if (conversation.retryable) {
        await sql`UPDATE daniel_sales.messages SET error=${conversation.reason},updated_at=now() WHERE id=${item.id} AND status='queued'`;
        held++;
      } else {
        await sql`UPDATE daniel_sales.messages SET status='blocked',error=${conversation.reason},updated_at=now() WHERE id=${item.id} AND status='queued'`;
        await audit(sql, 'daniel-worker', 'conversation_dispatch_blocked', 'message', item.id, {reason:conversation.reason,thread_id:item.thread_key});
        blocked++;
      }
      continue;
    }
    const recipient = conversation.recipient;
    if (gmailTest && !gmailTestRecipients(env).includes(recipient.toLowerCase())) { held++; continue; }
    const [m] =
      gmailTest ? await sql`SELECT * FROM daniel_sales.claim_test_message(${item.id}::uuid,${item.kind === "intro" ? 10 : 5},${c.email})` : await sql`SELECT * FROM daniel_sales.claim_message(${item.id}::uuid,${item.kind === "intro" ? 10 : 5})`;
    if (!m) {
      held++;
      continue;
    }
    try {
      // Final suppression and pause check narrows the provider-call race after claiming.
      const [valid] =
        await sql`SELECT c.id FROM daniel_sales.contacts c WHERE c.id=${c.id} AND c.suppressed_at IS NULL AND NOT EXISTS(SELECT 1 FROM daniel_sales.suppressions s WHERE s.email IN (lower(c.email),lower(${recipient}))) AND (${gmailTest} OR EXISTS(SELECT 1 FROM daniel_sales.settings WHERE id=1 AND paused=false)) AND NOT (${m.kind} IN ('intro','followup') AND EXISTS(SELECT 1 FROM daniel_sales.contacts p WHERE p.account_id=c.account_id AND p.replied_at IS NOT NULL))`;
      if (!valid) {
        await sql.transaction([
          sql`UPDATE daniel_sales.messages SET status='blocked',error='Paused, suppressed or replied before dispatch',updated_at=now() WHERE id=${m.id}`,
          sql`UPDATE daniel_sales.daily_limits SET reserved_count=greatest(0,reserved_count-1) WHERE local_date=${m.quota_date} AND kind=${m.quota_kind}`,
        ]);
        blocked++;
        continue;
      }
      if (preview) {
        await sql`INSERT INTO daniel_sales.test_deliveries(message_id,recipient,subject,body,thread_key) VALUES(${m.id},${recipient},${m.subject},${m.body},${m.thread_key || "test:" + m.id}) ON CONFLICT DO NOTHING`;
        await finish(
          sql,
          m,
          { threadId: m.thread_key || "test:" + m.id },
          true,
        );
        simulated++;
      } else {
        if (
          !token ||
          env.DANIEL_SENDER_EMAIL !== BOF_SENDER
        )
          throw Error("Live sender configuration incomplete");
        if (gmailTest) {
          if (!gmailTestRecipients(env).includes(recipient.toLowerCase())) throw Error("Test recipient permission expired");
          await sql`UPDATE daniel_sales.messages SET ai_metadata=ai_metadata || '{"gmail_test":true}'::jsonb WHERE id=${m.id}`;
        }
        const html = renderSalesEmail(m.body);
        const result = await send(token, {
          from: "Daniel | Banners On The Fly <" + env.DANIEL_SENDER_EMAIL + ">",
          to: recipient,
          replyTo: BOF_SENDER,
          subject: m.subject,
          html,
          threadId: m.thread_key,
          messageId: m.reply_to_id,
          references: m.reply_to_id,
          rfcMessageId: m.rfc_message_id,
        });
        // Gmail may replace the submitted RFC Message-ID. Retain its immutable
        // provider ID before reading canonical headers, so a read failure can
        // be reconciled without resending the already accepted message.
        await sql`UPDATE daniel_sales.messages SET provider_message_id=${result.id},thread_key=${result.threadId || m.thread_key} WHERE id=${m.id} AND status='sending'`;
        const delivered = await getMessage(token, result.id);
        result.rfcMessageId = header(delivered, "Message-ID");
        if (!result.rfcMessageId) throw Error("Gmail canonical message headers unavailable");
        await finish(sql, m, result, false);
        sent++;
      }
    } catch (e) {
      await sql`UPDATE daniel_sales.messages SET status='uncertain',error='Delivery outcome requires reconciliation; not retried automatically',updated_at=now() WHERE id=${m.id} AND status='sending'`;
      await audit(sql, "daniel-worker", "delivery_uncertain", "message", m.id, {
        code: e.status || "network_or_commit",
      });
    }
  }
  return { sent: gmailTest ? 0 : sent, gmailTestSent: gmailTest ? sent : 0, simulated, blocked, held };
}
export async function reconcile(sql, env, token, options = {}) {
  const getMessage = options.getMessage || getGmail;
  const listMessages = options.listMessages || listGmail;
  const pending =
    await sql`SELECT * FROM daniel_sales.messages WHERE status='uncertain' OR (status='sending' AND lease_until<now()) OR (status='sent' AND provider_message_id IS NOT NULL AND NOT coalesce((ai_metadata->>'gmail_headers_verified')='true',false)) LIMIT 25`;
  let recovered = 0;
  for (const m of pending) {
    const preview = mode(env) !== "live" && !m.ai_metadata?.gmail_test;
    if (preview) {
      const [d] =
        await sql`SELECT * FROM daniel_sales.test_deliveries WHERE message_id=${m.id}`;
      if (d) {
        await finish(sql, m, { threadId: d.thread_key }, true);
        recovered++;
      } else
        await sql`UPDATE daniel_sales.messages SET status='uncertain',error='Interrupted before test delivery; owner review required' WHERE id=${m.id}`;
    } else if (token) {
      const result = m.provider_message_id ? {messages:[{id:m.provider_message_id,threadId:m.thread_key}]} : await listMessages(
        token,
        "in:sent rfc822msgid:" + m.rfc_message_id.replace(/[<>]/g, ""),
      );
      if (result.messages?.length) {
        const delivered = await getMessage(token, result.messages[0].id);
        const canonical = header(delivered,"Message-ID");
        if (!canonical) continue;
        if (m.status === 'sent') {
          await sql`UPDATE daniel_sales.messages SET rfc_message_id=${canonical},ai_metadata=ai_metadata || '{"gmail_headers_verified":true}'::jsonb WHERE id=${m.id}`;
          recovered++;
          continue;
        }
        await finish(
          sql,
          m,
          { id: result.messages[0].id, threadId: result.messages[0].threadId, rfcMessageId:canonical },
          false,
        );
        recovered++;
      } else
        await sql`UPDATE daniel_sales.messages SET status='uncertain',error='No Gmail confirmation yet. Held to prevent duplicate sending.' WHERE id=${m.id}`;
    }
  }
  return { recovered };
}
