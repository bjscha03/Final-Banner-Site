import { checkDispatchConversation } from './dispatch-safety.mjs';
import { renderSalesEmail } from './email-design.mjs';
import { validTeamOffer } from './team-offer.mjs';
import { recoveryEligibility } from './recovery-policy.mjs';
import { dailyLimit, sendKindAllowed } from './outreach-controls.mjs';
import { BOF_SENDER, verifySender } from "./identity.mjs";
import { canDispatch } from "./operations.mjs";
import { mode, gmailTestRecipients } from "./config.mjs";
import { sendGmail, listGmail, getGmail, header, gmailRequest } from "./gmail.mjs";
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
  const [storedSettings]=await sql`SELECT * FROM daniel_sales.settings WHERE id=1`;
  const settings=storedSettings || {paused:true};
  if(settings.paused) return {sent:0,gmailTestSent:0,simulated:0,blocked:0,held:0,paused:true};
  const [knowledge]=settings.required_draft_contract ? await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1` : [];
  if (!preview) await verifyIdentity(token, gmailRequest);
  let simulated = 0,
    sent = 0,
    blocked = 0,
    held = 0;
  // Prospect replies are manual-only, including previously approved replies.
  // Preserve their records; never select them for autonomous delivery.
  // Legacy draft bodies remain excluded during isolated recovery.
  const queued =
    await sql`SELECT * FROM daniel_sales.messages WHERE status='queued' AND due_at<=now() AND kind IN ('intro','followup') AND NOT ${settings.cold_outreach_paused===true} AND (${settings.required_draft_contract || null}::text IS NULL OR ai_metadata->>'generation_contract'=${settings.required_draft_contract || null}) ORDER BY due_at,id LIMIT 25`;
  for (const item of queued) {
    if(!sendKindAllowed(settings,item.kind)) {held++;continue;}
    const recovery=recoveryEligibility(item,settings,knowledge);
    if(!recovery.ok) {held++;continue;}
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
    const guard = canDispatch({
      contact: { ...c, replied: !!c.replied_at },
      account: c,
      kind: item.kind,
      now,
      followups: stats.followups,
      lastFollowupAt: stats.last,
      limits:settings,
    });
    if (!guard.ok) {
      if (["suppressed","reply_received","followup_limit","supplier_excluded","invalid_email","unverified_contact"].includes(guard.reason)) {
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
    // The database owns the atomic limits and pacing. This argument agrees
    // with the same capped controls; it cannot override database enforcement.
    const cap=dailyLimit(settings,item.kind);
    const [m] = gmailTest
      ? await sql`SELECT * FROM daniel_sales.claim_test_message(${item.id}::uuid,${cap},${c.email})`
      : await sql`SELECT * FROM daniel_sales.claim_message(${item.id}::uuid,${cap})`;
    if (!m) {
      held++;
      continue;
    }
    try {
      // Re-read controls and validate the actual claimed bytes immediately
      // before delivery. Neither manual approval nor controlled testing can
      // authorize a prospect reply from Daniel.
      const [freshSettings]=await sql`SELECT * FROM daniel_sales.settings WHERE id=1`;
      const currentSettings=freshSettings || {paused:true};
      const claimedRecovery=recoveryEligibility(m,currentSettings,knowledge);
      const [valid] =
        await sql`SELECT c.id FROM daniel_sales.contacts c WHERE c.id=${c.id} AND c.suppressed_at IS NULL AND NOT EXISTS(SELECT 1 FROM daniel_sales.suppressions x WHERE x.email IN (lower(c.email),lower(${recipient}))) AND ${m.kind} IN ('intro','followup') AND EXISTS(SELECT 1 FROM daniel_sales.settings s WHERE s.id=1 AND s.paused=false AND s.cold_outreach_paused=false AND s.auto_reply=false AND s.reply_mode='manual_only' AND ((${m.kind}='intro' AND s.auto_prospect=true) OR (${m.kind}='followup' AND s.auto_followup=true)) AND (s.required_draft_contract IS NULL OR (s.required_draft_contract=${m.ai_metadata?.generation_contract || null} AND ${m.ai_metadata?.knowledge_version || null}=(SELECT version FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1)))) AND NOT EXISTS(SELECT 1 FROM daniel_sales.contacts p WHERE p.account_id=c.account_id AND p.replied_at IS NOT NULL) AND extract(isodow FROM clock_timestamp() AT TIME ZONE 'America/New_York')<=5 AND (clock_timestamp() AT TIME ZONE 'America/New_York')::time>=time '08:00' AND (clock_timestamp() AT TIME ZONE 'America/New_York')::time<time '20:00'`;
      if (m.kind==='reply' || m.kind!==item.kind || !sendKindAllowed(currentSettings,m.kind) || currentSettings.auto_reply!==false || !valid || !claimedRecovery.ok) {
        await sql.transaction([
          sql`UPDATE daniel_sales.messages SET status='blocked',error='Manual-only reply policy, outbound controls, window, suppression or conversation changed before dispatch',lease_until=NULL,updated_at=now() WHERE id=${m.id} AND status='sending'`,
          sql`UPDATE daniel_sales.daily_limits SET reserved_count=greatest(0,reserved_count-1) WHERE local_date=${m.quota_date} AND kind=${m.quota_kind}`,
        ]);
        blocked++;
        continue;
      }
      if (preview) {
        await sql`INSERT INTO daniel_sales.test_deliveries(message_id,recipient,subject,body,thread_key) VALUES(${m.id},${recipient},${m.subject},${m.body},${m.thread_key || "test:" + m.id}) ON CONFLICT DO NOTHING`;
        await finish(sql,m,{threadId:m.thread_key || "test:" + m.id},true);
        simulated++;
      } else {
        if (!token || env.DANIEL_SENDER_EMAIL !== BOF_SENDER) throw Error("Live sender configuration incomplete");
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
        // Record Gmail acceptance before canonical-header reconciliation so
        // uncertain outcomes cannot cause an automatic duplicate resend.
        await sql`UPDATE daniel_sales.messages SET provider_message_id=${result.id},thread_key=${result.threadId || m.thread_key} WHERE id=${m.id} AND status='sending'`;
        const delivered = await getMessage(token, result.id);
        result.rfcMessageId = header(delivered, "Message-ID");
        if (!result.rfcMessageId) throw Error("Gmail canonical message headers unavailable");
        await finish(sql, m, result, false);
        sent++;
      }
    } catch (e) {
      await sql`UPDATE daniel_sales.messages SET status='uncertain',error='Delivery outcome requires reconciliation; not retried automatically',updated_at=now() WHERE id=${m.id} AND status='sending'`;
      await audit(sql, "daniel-worker", "delivery_uncertain", "message", m.id, {code:e.status || "network_or_commit"});
    }
  }
  return {sent:gmailTest?0:sent,gmailTestSent:gmailTest?sent:0,simulated,blocked,held,coldOutreachPaused:settings.cold_outreach_paused===true};
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
      const [d] = await sql`SELECT * FROM daniel_sales.test_deliveries WHERE message_id=${m.id}`;
      if (d) {
        await finish(sql, m, {threadId:d.thread_key}, true);
        recovered++;
      } else await sql`UPDATE daniel_sales.messages SET status='uncertain',error='Interrupted before test delivery; owner review required' WHERE id=${m.id}`;
    } else if (token) {
      const result = m.provider_message_id ? {messages:[{id:m.provider_message_id,threadId:m.thread_key}]} : await listMessages(token,"in:sent rfc822msgid:" + m.rfc_message_id.replace(/[<>]/g, ""));
      if (result.messages?.length) {
        const delivered = await getMessage(token, result.messages[0].id);
        const canonical = header(delivered,"Message-ID");
        if (!canonical) continue;
        if (m.status === 'sent') {
          await sql`UPDATE daniel_sales.messages SET rfc_message_id=${canonical},ai_metadata=ai_metadata || '{"gmail_headers_verified":true}'::jsonb WHERE id=${m.id}`;
          recovered++;
          continue;
        }
        await finish(sql,m,{id:result.messages[0].id,threadId:result.messages[0].threadId,rfcMessageId:canonical},false);
        recovered++;
      } else await sql`UPDATE daniel_sales.messages SET status='uncertain',error='No Gmail confirmation yet. Held to prevent duplicate sending.' WHERE id=${m.id}`;
    }
  }
  return { recovered };
}
