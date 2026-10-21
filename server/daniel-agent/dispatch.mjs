import { canDispatch, isEndBuyer } from "./operations.mjs";
import { easternBusinessDay } from "./policy.mjs";
import { mode } from "./config.mjs";
import { sendGmail, listGmail } from "./gmail.mjs";
import { escapeHtml } from "./validation.mjs";
import { nextBusinessFollowup } from "./scheduling.mjs";
import { audit } from "./store.mjs";
export async function finish(sql, m, result, preview) {
  const status = preview ? "simulated" : "sent";
  await sql.transaction([
    sql`WITH finished AS (UPDATE daniel_sales.messages SET status=${status},provider_message_id=${result.id || null},thread_key=${result.threadId || m.thread_key},sent_at=${preview ? null : new Date().toISOString()}::timestamptz,lease_until=NULL,updated_at=now(),error=NULL WHERE id=${m.id} AND status IN ('sending','uncertain') RETURNING quota_date,quota_kind) UPDATE daniel_sales.daily_limits SET reserved_count=greatest(0,reserved_count-1),sent_count=sent_count+1 WHERE (local_date,kind) IN (SELECT quota_date,quota_kind FROM finished)`,
    sql`INSERT INTO daniel_sales.audit_events(entity_type,entity_id,event_type,actor,metadata_json) VALUES('message',${m.id},${status},'daniel-worker',${JSON.stringify({ provider_id: result.id || null })}::jsonb)`,
  ]);
  if (["intro", "followup"].includes(m.kind)) {
    const [stats] =
      await sql`SELECT count(*)::int AS n FROM daniel_sales.messages WHERE contact_id=${m.contact_id} AND kind='followup' AND status IN ('sent','simulated')`;
    if (stats.n < 2)
      await sql`INSERT INTO daniel_sales.tasks(contact_id,opportunity_id,kind,due_at,note,dedupe_key) VALUES(${m.contact_id},${m.opportunity_id},'followup',${nextBusinessFollowup(new Date())},'Prepare follow-up if still unanswered',${"followup:" + m.id}) ON CONFLICT(dedupe_key) DO NOTHING`;
    if (!preview)
      await sql`UPDATE daniel_sales.opportunities SET stage='contacted',next_action='Review response or scheduled follow-up',next_action_at=${nextBusinessFollowup(new Date())} WHERE id=${m.opportunity_id} AND stage IN ('researched','qualified','contacted')`;
  }
}
export async function dispatch(
  sql,
  env,
  token,
  { send = sendGmail, now = new Date() } = {},
) {
  const preview = mode(env) !== "live";
  let simulated = 0,
    sent = 0,
    blocked = 0,
    held = 0;
  const queued =
    await sql`SELECT * FROM daniel_sales.messages WHERE status='queued' AND due_at<=now() ORDER BY due_at LIMIT 25`;
  for (const item of queued) {
    const [c] =
      await sql`SELECT c.*,a.segment FROM daniel_sales.contacts c JOIN daniel_sales.accounts a ON a.id=c.account_id WHERE c.id=${item.contact_id}`;
    if (!c) continue;
    const [stats] =
      await sql`SELECT count(*) FILTER(WHERE kind='followup')::int AS followups,max(updated_at) AS last FROM daniel_sales.messages WHERE contact_id=${c.id} AND direction='outbound' AND status IN ('sent','simulated')`;
    const guard =
      item.kind === "reply"
        ? {
            ok:
              !c.suppressed_at &&
              isEndBuyer(c) &&
              !!c.verified_source_url &&
              easternBusinessDay(now),
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
    const [m] =
      await sql`SELECT * FROM daniel_sales.claim_message(${item.id}::uuid,${item.kind === "intro" ? 10 : 5})`;
    if (!m) {
      held++;
      continue;
    }
    try {
      // Final suppression check narrows the provider-call race after claiming.
      const [valid] =
        await sql`SELECT c.id FROM daniel_sales.contacts c WHERE c.id=${c.id} AND c.suppressed_at IS NULL AND NOT EXISTS(SELECT 1 FROM daniel_sales.suppressions s WHERE s.email=lower(c.email)) AND NOT (c.replied_at IS NOT NULL AND ${m.kind} IN ('intro','followup'))`;
      if (!valid) {
        await sql.transaction([
          sql`UPDATE daniel_sales.messages SET status='blocked',error='Suppressed before dispatch',updated_at=now() WHERE id=${m.id}`,
          sql`UPDATE daniel_sales.daily_limits SET reserved_count=greatest(0,reserved_count-1) WHERE local_date=${m.quota_date} AND kind=${m.quota_kind}`,
        ]);
        blocked++;
        continue;
      }
      if (preview) {
        await sql`INSERT INTO daniel_sales.test_deliveries(message_id,recipient,subject,body,thread_key) VALUES(${m.id},${c.email},${m.subject},${m.body},${m.thread_key || "test:" + m.id}) ON CONFLICT DO NOTHING`;
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
          !env.DANIEL_SENDER_EMAIL ||
          !env.OUTBOUND_PHYSICAL_ADDRESS
        )
          throw Error("Live sender configuration incomplete");
        const html =
          "<p>" +
          escapeHtml(m.body).replace(/\n/g, "<br>") +
          '</p><p>Best,<br><strong>Daniel</strong><br>Sales Assistant | <a href="https://bannersonthefly.com">Banners On The Fly</a></p><p>' +
          escapeHtml(env.OUTBOUND_PHYSICAL_ADDRESS) +
          "<br>Promotional business email. To stop outreach, reply unsubscribe.</p>";
        const result = await send(token, {
          from: "Daniel | Banners On The Fly <" + env.DANIEL_SENDER_EMAIL + ">",
          to: c.email,
          subject: m.subject,
          html,
          threadId: m.thread_key,
          messageId: m.reply_to_id,
          references: m.reply_to_id,
          rfcMessageId: m.rfc_message_id,
        });
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
  return { sent, simulated, blocked, held };
}
export async function reconcile(sql, env, token) {
  const preview = mode(env) !== "live";
  const pending =
    await sql`SELECT * FROM daniel_sales.messages WHERE status='uncertain' OR (status='sending' AND lease_until<now()) LIMIT 25`;
  let recovered = 0;
  for (const m of pending) {
    if (preview) {
      const [d] =
        await sql`SELECT * FROM daniel_sales.test_deliveries WHERE message_id=${m.id}`;
      if (d) {
        await finish(sql, m, { threadId: d.thread_key }, true);
        recovered++;
      } else
        await sql`UPDATE daniel_sales.messages SET status='uncertain',error='Interrupted before test delivery; owner review required' WHERE id=${m.id}`;
    } else if (token) {
      const result = await listGmail(
        token,
        "in:sent rfc822msgid:" + m.rfc_message_id.replace(/[<>]/g, ""),
      );
      if (result.messages?.length) {
        await finish(
          sql,
          m,
          { id: result.messages[0].id, threadId: result.messages[0].threadId },
          false,
        );
        recovered++;
      } else
        await sql`UPDATE daniel_sales.messages SET status='uncertain',error='No Gmail confirmation yet. Held to prevent duplicate sending.' WHERE id=${m.id}`;
    }
  }
  return { recovered };
}
