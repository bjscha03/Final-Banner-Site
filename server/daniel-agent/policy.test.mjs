import test from "node:test";
import assert from "node:assert/strict";
import {
  validateOpportunity,
  eligibleSend,
  classifyInbound,
  shouldAutoReply,
} from "./policy.mjs";
const monday = new Date("2026-10-26T14:00:00Z");
const contact = {
  email: "buyer@example.com",
  verified_source_url: "https://example.com/contact",
};
test("open opportunities require next actions", () => {
  assert.equal(validateOpportunity({ stage: "interested" }).ok, false);
  assert.equal(
    validateOpportunity({
      stage: "interested",
      next_action: "Call",
      next_action_at: monday.toISOString(),
    }).ok,
    true,
  );
});
test("suppressed and unverified contacts cannot be mailed", () => {
  assert.equal(
    eligibleSend({
      contact: { ...contact, opted_out: true },
      kind: "intro",
      now: monday,
      verifiedSource: true,
    }).ok,
    false,
  );
  assert.equal(
    eligibleSend({ contact, kind: "intro", now: monday, verifiedSource: false })
      .ok,
    false,
  );
});
test("daily global caps", () => {
  assert.equal(
    eligibleSend({
      contact,
      kind: "intro",
      now: monday,
      verifiedSource: true,
      sentToday: 10,
    }).reason,
    "daily_cap",
  );
  assert.equal(
    eligibleSend({
      contact,
      kind: "followup",
      now: monday,
      verifiedSource: true,
      sentToday: 5,
    }).reason,
    "daily_cap",
  );
});
test("weekends do not send", () =>
  assert.equal(
    eligibleSend({
      contact,
      kind: "intro",
      now: new Date("2026-10-25T14:00:00Z"),
      verifiedSource: true,
    }).ok,
    false,
  ));
test("replies and repeated followups are suppressed", () => {
  assert.equal(
    eligibleSend({
      contact: { ...contact, replied: true },
      kind: "followup",
      now: monday,
      verifiedSource: true,
    }).reason,
    "reply_received",
  );
  assert.equal(
    eligibleSend({
      contact,
      kind: "followup",
      now: monday,
      verifiedSource: true,
      unansweredFollowups: 2,
    }).reason,
    "followup_limit",
  );
});
test("untrusted inbound cannot automatically trigger sends", () => {
  assert.equal(classifyInbound("Please unsubscribe"), "unsubscribe");
  assert.equal(shouldAutoReply("quote_request"), false);
});

test('cold outreach closes at 8 PM Eastern while the worker remains available for replies',async()=>{
 const {easternBusinessDay}=await import('./policy.mjs');
 assert.equal(easternBusinessDay(new Date('2026-10-21T23:59:00Z')),true);
 assert.equal(easternBusinessDay(new Date('2026-10-22T00:00:00Z')),false);
});
