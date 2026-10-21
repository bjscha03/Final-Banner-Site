import { routinePolicyText } from './policy.mjs';
import { createHash } from "node:crypto";
import { approvalNeeded } from "./operations.mjs";
import { requestApproval, decide } from "./store.mjs";

// This only authorizes routine, grounded drafts. Dispatch independently enforces
// cutover, suppression, quotas, sender identity, business hours and follow-up limits.
export function routineEligible(message, knowledge) {
  const meta = message.ai_metadata;
  if (
    !["reply", "followup"].includes(message.kind) ||
    !meta ||
    meta.requires_approval !== false
  )
    return false;
  if (
    meta.knowledge_version !== knowledge.version ||
    !Array.isArray(meta.fact_ids) ||
    !meta.fact_ids.length ||
    !meta.fact_ids.every((k) => Object.hasOwn(knowledge.facts, k))
  )
    return false;
  if (
    message.kind === "reply" &&
    (meta.classification !== "needs_review" ||
      meta.model_classification !== "routine_product")
  )
    return false;
  if (message.kind === "followup" && meta.model_classification !== "followup")
    return false;
  const body = routinePolicyText(message.subject + "\n" + message.body, knowledge.facts);
  if (
    approvalNeeded(body) ||
    /\$|\d\s*%|\b(price|pricing|quote|refund|complaint|payment|invoice|contract|guarantee|discount|meeting|appointment|schedule a call|net\s*\d|credit|password|credentials|supplier)\b/i.test(
      body,
    )
  )
    return false;
  return true;
}

export function introductionEligible(message, knowledge, research, now = new Date()) {
  const meta = message.ai_metadata || {};
  const hash = createHash('sha256').update(message.subject + '\n' + message.body).digest('hex');
  return message.kind === 'intro' && research?.verified === true && research.recurring_buyer === true &&
    +now - Date.parse(research.verified_at) >= 0 && +now - Date.parse(research.verified_at) < 7*86400000 &&
    research.reviewer?.response_id && meta.research_review?.approved === true &&
    meta.research_review?.content_hash === hash &&
    routineEligible({...message,kind:'followup',ai_metadata:{...meta,model_classification:'followup'}},knowledge);
}

export async function routeApproval(sql, message, settings) {
  if (!["draft", "pending_approval"].includes(message.status)) return;
  await requestApproval(sql, message.id, "daniel-worker");
  if (!(message.kind === "intro" ? settings.auto_prospect : settings.auto_reply)) return;
  const [knowledge] =
    await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;
  if (message.kind === 'intro') {
    const [contact] = await sql`SELECT research,suppressed_at FROM daniel_sales.contacts WHERE id=${message.contact_id}`;
    if (contact?.suppressed_at || !introductionEligible(message,knowledge,contact?.research)) return;
  } else if (!routineEligible(message, knowledge)) return;
  const [approval] =
    await sql`SELECT id FROM daniel_sales.approvals WHERE message_id=${message.id} AND decision='pending'`;
  if (approval)
    await decide(
      sql,
      approval.id,
      "approved",
      "Routine automation enabled; grounded non-exception draft passed policy. Dispatch mode and limits remain enforced.",
      "daniel-policy",
    );
}
