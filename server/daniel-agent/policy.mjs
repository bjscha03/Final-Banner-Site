// Fail-closed pure policy; shared by future worker and tests.
const stages = new Set([
  "researched",
  "qualified",
  "contacted",
  "replied",
  "interested",
  "quote_requested",
  "quote_pending_approval",
  "quoted",
  "negotiation",
  "won",
  "lost",
  "nurture",
  "do_not_contact",
]);
const closed = new Set(["won", "lost", "do_not_contact"]);
export function validateOpportunity(o) {
  if (!stages.has(o.stage)) return { ok: false, reason: "invalid_stage" };
  if (
    !closed.has(o.stage) &&
    (!o.next_action ||
      !o.next_action_at ||
      !Number.isFinite(Date.parse(o.next_action_at)))
  )
    return { ok: false, reason: "missing_next_action" };
  return { ok: true };
}
export function easternDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function easternBusinessDay(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value,
    hour = Number(parts.find((p) => p.type === "hour")?.value);
  return day !== "Sat" && day !== "Sun" && hour >= 8 && hour <= 20;
}
export function eligibleSend({
  contact,
  kind,
  now = new Date(),
  sentToday = 0,
  unansweredFollowups = 0,
  lastFollowupAt,
  verifiedSource,
  providerAllowed = true,
}) {
  if (!providerAllowed) return { ok: false, reason: "provider_blocked" };
  if (
    !contact ||
    contact.suppressed_at ||
    contact.opted_out ||
    contact.bounced ||
    contact.declined
  )
    return { ok: false, reason: "suppressed" };
  if (!contact.email || !verifiedSource || !contact.verified_source_url)
    return { ok: false, reason: "unverified_contact" };
  if (!easternBusinessDay(now))
    return { ok: false, reason: "outside_business_hours" };
  if (kind !== "intro" && kind !== "followup")
    return { ok: false, reason: "invalid_kind" };
  if (sentToday >= (kind === "intro" ? 10 : 5))
    return { ok: false, reason: "daily_cap" };
  if (kind === "followup") {
    if (contact.replied) return { ok: false, reason: "reply_received" };
    if (unansweredFollowups >= 2)
      return { ok: false, reason: "followup_limit" };
    if (lastFollowupAt) {
      const date = new Date(lastFollowupAt);
      if (!Number.isFinite(date.getTime()))
        return { ok: false, reason: "invalid_followup_date" };
      let businessDays = 0;
      const d = new Date(date);
      while (d < now) {
        d.setUTCDate(d.getUTCDate() + 1);
        const wd = d.getUTCDay();
        if (wd !== 0 && wd !== 6 && d <= now) businessDays++;
      }
      if (businessDays < 5) return { ok: false, reason: "followup_too_soon" };
    }
  }
  return { ok: true };
}
export function classifyInbound(text = "") {
  const s = text.toLowerCase();
  if (/unsubscribe|remove me|stop (emailing|contacting)|do not contact/.test(s))
    return "unsubscribe";
  if (/not interested|no thanks|please don't contact/.test(s)) return "decline";
  if (/refund|lawsuit|legal notice|chargeback|dispute/.test(s))
    return "escalate";
  if (/quote|pricing|how much|estimate/.test(s)) return "quote_request";
  if (/meeting|schedule a call|book a call/.test(s)) return "meeting_request";
  return "needs_review"; // Never auto-send based solely on keyword matching.
}
export function shouldAutoReply(classification) {
  return false; // Require authenticated, verified knowledge-base and human-tested engine before activation.
}
