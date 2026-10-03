"use strict";
// An absent migration must not break existing admin reporting. Invitations do
// not imply enrollment; the star is driven only by an activated membership.
async function enrichMembership(sql, records) {
  const emails = [
    ...new Set(
      records
        .map((r) =>
          String(r.reporting_customer_email || r.email || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  if (!emails.length) return records;
  let members = [],
    invited = [];
  try {
    members =
      await sql`SELECT lower(btrim(p.email)) AS email,m.joined_at FROM bof_members m JOIN profiles p ON p.id=m.user_id WHERE lower(btrim(p.email))=ANY(${emails}::text[])`;
    invited =
      await sql`SELECT normalized_email AS email,status FROM marketing_email_sends WHERE campaign_key='bof-referral-v1' AND normalized_email=ANY(${emails}::text[])`;
  } catch (error) {
    if (error.code !== "42P01") throw error;
  }
  const joined = new Map(members.map((m) => [m.email, m.joined_at])),
    sent = new Map(invited.map((i) => [i.email, i.status]));
  return records.map((r) => {
    const email = String(r.reporting_customer_email || r.email || "")
      .trim()
      .toLowerCase();
    return {
      ...r,
      bof_member: joined.has(email),
      bof_joined_at: joined.get(email) || null,
      bof_invitation_status: sent.get(email) || null,
    };
  });
}
module.exports = { enrichMembership };

async function enrichFinancials(sql, records) {
  const ids = records
    .map((r) => r.id)
    .filter((id) => /^[a-f0-9-]{36}$/i.test(String(id)));
  if (!ids.length) return records;
  let rows = [];
  try {
    rows =
      await sql`SELECT order_id,reward_cents,reward_eligible,wallet_cents,state FROM bof_order_benefits WHERE order_id=ANY(${ids}::uuid[])`;
  } catch (error) {
    if (error.code !== "42P01") throw error;
  }
  const byId = new Map(rows.map((r) => [r.order_id, r]));
  return records.map((record) => {
    const benefit = byId.get(record.id);
    if (!benefit) return record;
    return {
      ...record,
      bof_reward_reserve_cents:
        ["held", "paid"].includes(benefit.state) && benefit.reward_eligible
          ? Number(benefit.reward_cents)
          : 0,
      bof_reserve_released_cents: ["held", "paid"].includes(benefit.state)
        ? Number(benefit.wallet_cents)
        : 0,
      bof_profit_review: benefit.state === "reversed",
    };
  });
}
module.exports.enrichFinancials = enrichFinancials;
