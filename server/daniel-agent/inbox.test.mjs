import test from "node:test";
import assert from "node:assert/strict";
import { isRelatedInbound, nextReplyAction } from "./inbox.mjs";
test("unknown sender not considered qualified reply", () =>
  assert.equal(
    isRelatedInbound({ email: "stranger@example.com", providerId: "1" }, [
      { email: "buyer@example.com" },
    ]),
    false,
  ));
test("known sender qualifies", () =>
  assert.equal(
    isRelatedInbound({ email: "buyer@example.com", providerId: "1" }, [
      { email: "buyer@example.com" },
    ]),
    true,
  ));
test("optout requires identity check", () =>
  assert.equal(
    nextReplyAction("unsubscribe"),
    "suppress_after_identity_check",
  ));
test("quotes are not automatically accepted", () =>
  assert.equal(nextReplyAction("quote_request"), "gather_quote_requirements"));
