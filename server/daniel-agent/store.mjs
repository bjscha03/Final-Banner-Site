import { randomUUID } from "node:crypto";
import * as v from "./validation.mjs";
export async function audit(sql, actor, event, type, id, data = {}) {
  await sql`INSERT INTO daniel_sales.audit_events(entity_type,entity_id,event_type,actor,metadata_json) VALUES(${type},${String(id)},${event},${actor},${JSON.stringify(data)}::jsonb)`;
}
export async function createProspect(sql, input, actor) {
  const p = v.prospect(input),
    aid = randomUUID(),
    cid = randomUUID(),
    oid = randomUUID();
  await sql.transaction([
    sql`INSERT INTO daniel_sales.accounts(id,name,website,segment,location_count,source_url,notes) VALUES(${aid},${p.name},${p.website},${p.segment},${p.location_count},${p.source_url},${p.notes})`,
    sql`INSERT INTO daniel_sales.contacts(id,account_id,name,role,email,verified_source_url) VALUES(${cid},${aid},${p.contact_name},${p.role},${p.email},${p.source_url})`,
    sql`INSERT INTO daniel_sales.opportunities(id,account_id,next_action,next_action_at) VALUES(${oid},${aid},${p.next_action},${p.next_action_at})`,
    sql`INSERT INTO daniel_sales.audit_events(entity_type,entity_id,event_type,actor,metadata_json) VALUES('account',${aid},'prospect_created',${actor},${JSON.stringify({ source: p.source_url })}::jsonb)`,
  ]);
  return { id: aid, contact_id: cid, opportunity_id: oid };
}
export async function suppress(sql, address, reason, actor) {
  const email = v.email(address);
  reason = v.text(reason, "Reason", 1000);
  await sql.transaction([
    sql`INSERT INTO daniel_sales.suppressions(email,reason,actor) VALUES(${email},${reason},${actor}) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason,actor=excluded.actor`,
    sql`UPDATE daniel_sales.contacts SET suppressed_at=now(),suppression_reason=${reason} WHERE lower(email)=${email}`,
    sql`UPDATE daniel_sales.messages SET status='blocked',error=${reason},updated_at=now() WHERE contact_id IN (SELECT id FROM daniel_sales.contacts WHERE lower(email)=${email}) AND direction='outbound' AND status IN ('draft','pending_approval','queued')`,
    sql`UPDATE daniel_sales.tasks SET status='cancelled',note=${reason} WHERE contact_id IN (SELECT id FROM daniel_sales.contacts WHERE lower(email)=${email}) AND status='pending'`,
    sql`UPDATE daniel_sales.approvals SET decision='rejected',decided_by=${actor},decided_at=now(),decision_note=${reason} WHERE decision='pending' AND message_id IN (SELECT m.id FROM daniel_sales.messages m JOIN daniel_sales.contacts c ON c.id=m.contact_id WHERE lower(c.email)=${email})`,
    sql`UPDATE daniel_sales.opportunities SET stage='do_not_contact',next_action='Suppressed',next_action_at=NULL WHERE account_id IN (SELECT account_id FROM daniel_sales.contacts WHERE lower(email)=${email})`,
    sql`INSERT INTO daniel_sales.audit_events(entity_type,entity_id,event_type,actor,metadata_json) VALUES('contact',${email},'suppressed',${actor},${JSON.stringify({ reason })}::jsonb)`,
  ]);
  return { ok: true };
}
export async function saveDraft(sql, input, actor) {
  const contactId = v.uuid(input.contact_id),
    body = v.text(input.body, "Message", 12000),
    subject = v.text(input.subject, "Subject", 250),
    kind = input.kind || "intro";
  if (!["intro", "followup", "reply"].includes(kind))
    v.fail("Invalid message kind");
  const [c] =
    await sql`SELECT c.*,a.segment FROM daniel_sales.contacts c JOIN daniel_sales.accounts a ON a.id=c.account_id WHERE c.id=${contactId}`;
  if (!c) v.fail("Contact not found", 404);
  if (c.suppressed_at) v.fail("Contact is suppressed", 409);
  const [o] =
    await sql`SELECT id FROM daniel_sales.opportunities WHERE account_id=${c.account_id} ORDER BY created_at DESC LIMIT 1`;
  const id = randomUUID(),
    key = input.idempotency_key || "draft:" + id;
  const [m] =
    await sql`INSERT INTO daniel_sales.messages(id,contact_id,opportunity_id,direction,status,kind,subject,body,idempotency_key,thread_key,reply_to_id,ai_metadata,due_at,rfc_message_id) VALUES(${id},${contactId},${o?.id || null},'outbound','draft',${kind},${subject},${body},${key},${input.thread_key || null},${input.reply_to_id || null},${JSON.stringify(input.ai_metadata || {})}::jsonb,${v.date(input.due_at || new Date().toISOString())},${`<daniel.${id}@bannersonthefly.com>`}) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING *`;
  await audit(sql, actor, "draft_created", "message", m.id);
  return m;
}
export async function requestApproval(sql, id, actor) {
  v.uuid(id);
  const [m] =
    await sql`UPDATE daniel_sales.messages SET status='pending_approval',approved_by=NULL,approved_at=NULL,updated_at=now() WHERE id=${id} AND status IN ('draft','pending_approval') AND direction='outbound' RETURNING *`;
  if (!m) v.fail("Only drafts can be submitted", 409);
  await sql`INSERT INTO daniel_sales.approvals(message_id,opportunity_id,request_type,proposal_json) VALUES(${m.id},${m.opportunity_id},${m.ai_metadata?.requires_approval ? "business_exception" : "outbound_message"},${JSON.stringify({ subject: m.subject, body: m.body, kind: m.kind })}::jsonb) ON CONFLICT(message_id) WHERE decision='pending' DO NOTHING`;
  await audit(sql, actor, "approval_requested", "message", id);
  return { ok: true };
}
export async function decide(sql, id, decision, note, actor) {
  v.uuid(id);
  if (!["approved", "rejected"].includes(decision)) v.fail("Invalid decision");
  const rows =
    await sql`WITH a AS (UPDATE daniel_sales.approvals SET decision=${decision},decided_by=${actor},decided_at=now(),decision_note=${String(note || "").slice(0, 2000)} WHERE id=${id} AND decision='pending' AND EXISTS(SELECT 1 FROM daniel_sales.messages m WHERE m.id=message_id AND m.status='pending_approval') RETURNING message_id), changed AS (UPDATE daniel_sales.messages SET status=${decision === "approved" ? "queued" : "draft"},approved_at=${decision === "approved" ? new Date().toISOString() : null}::timestamptz,approved_by=${decision === "approved" ? actor : null},updated_at=now() WHERE id IN (SELECT message_id FROM a) AND status='pending_approval' RETURNING id) INSERT INTO daniel_sales.audit_events(entity_type,entity_id,event_type,actor,metadata_json) SELECT 'approval',${id},${decision},${actor},${JSON.stringify({ note })}::jsonb FROM changed RETURNING id`;
  if (!rows.length)
    v.fail("Approval already decided or message no longer eligible", 409);
  return { ok: true };
}
export async function data(sql) {
  const [
    accounts,
    contacts,
    opportunities,
    messages,
    tasks,
    approvals,
    suppressions,
    events,
    meetings,
    reports,
    runs,
    settings,
    mailbox,
    deliveries,
    limits,
    researchRuns,
    reportDeliveries,
  ] = await Promise.all([
    sql`SELECT * FROM daniel_sales.accounts ORDER BY created_at DESC LIMIT 500`,
    sql`SELECT * FROM daniel_sales.contacts ORDER BY created_at DESC LIMIT 500`,
    sql`SELECT * FROM daniel_sales.opportunities ORDER BY next_action_at NULLS LAST LIMIT 500`,
    sql`SELECT * FROM daniel_sales.messages ORDER BY created_at DESC LIMIT 300`,
    sql`SELECT * FROM daniel_sales.tasks ORDER BY due_at DESC LIMIT 300`,
    sql`SELECT * FROM daniel_sales.approvals ORDER BY created_at DESC LIMIT 300`,
    sql`SELECT * FROM daniel_sales.suppressions ORDER BY created_at DESC LIMIT 500`,
    sql`SELECT * FROM daniel_sales.audit_events ORDER BY id DESC LIMIT 200`,
    sql`SELECT * FROM daniel_sales.meetings ORDER BY starts_at DESC LIMIT 100`,
    sql`SELECT local_date::text AS local_date,data,generated_at FROM daniel_sales.daily_reports ORDER BY local_date DESC LIMIT 30`,
    sql`SELECT * FROM daniel_sales.runs ORDER BY started_at DESC LIMIT 30`,
    sql`SELECT * FROM daniel_sales.settings WHERE id=1`,
    sql`SELECT email,history_id,last_sync_at,last_error FROM daniel_sales.mailbox WHERE id=1`,
    sql`SELECT * FROM daniel_sales.test_deliveries ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT local_date::text AS local_date,kind,reserved_count,sent_count FROM daniel_sales.daily_limits WHERE local_date >= current_date-7`,
    sql`SELECT * FROM daniel_sales.discovery_runs ORDER BY started_at DESC LIMIT 30`,
    sql`SELECT report_key,local_date::text AS local_date,recipient,status,provider_message_id,sent_at,error FROM daniel_sales.report_outbox ORDER BY created_at DESC LIMIT 30`,
  ]);
  return {
    accounts,
    contacts,
    opportunities,
    messages,
    tasks,
    approvals,
    suppressions,
    events,
    meetings,
    reports,
    runs,
    settings: settings[0],
    mailbox: mailbox[0] || null,
    deliveries,
    limits,
    researchRuns,
    reportDeliveries,
  };
}
