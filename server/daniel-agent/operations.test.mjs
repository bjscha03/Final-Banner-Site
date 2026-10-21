import test from "node:test";
import assert from "node:assert/strict";
import {
  canDispatch,
  approvalNeeded,
  normalizeEmail,
  isEndBuyer,
} from "./operations.mjs";
const now = new Date("2026-10-26T14:00:00Z");
const contact = {
  email: "ops@example.com",
  verified_source_url: "https://example.com/contact",
};
test("supplier exclusions", () =>
  assert.equal(
    canDispatch({
      contact,
      account: { segment: "sign shop" },
      kind: "intro",
      now,
    }).reason,
    "supplier_excluded",
  ));
test("verified end buyer", () =>
  assert.equal(
    canDispatch({
      contact,
      account: { segment: "restaurant franchisee" },
      kind: "intro",
      now,
    }).ok,
    true,
  ));
test("daily quota", () =>
  assert.equal(
    canDispatch({
      contact,
      account: { segment: "franchisee" },
      kind: "intro",
      now,
      alreadySent: 10,
    }).reason,
    "daily_cap",
  ));
test("quote exceptions escalate", () =>
  assert.equal(approvalNeeded("Can we have net 30 credit terms?"), true));
test("invalid addresses rejected", () =>
  assert.equal(normalizeEmail("bad-address"), null));
