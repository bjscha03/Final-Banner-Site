import test from "node:test";
import assert from "node:assert/strict";
import { routineEligible } from "./automation.mjs";
const kb = {
  version: "bof-v1",
  facts: { company: "Banners On The Fly", products: ["vinyl banners"] },
};
const message = {
  kind: "reply",
  subject: "Your banner question",
  body: "We offer vinyl banners. Which dimensions do you need?",
  ai_metadata: {
    knowledge_version: "bof-v1",
    requires_approval: false,
    fact_ids: ["products"],
    classification: "needs_review",
    model_classification: "routine_product",
  },
};
test("only grounded routine replies and follow-ups qualify for automation", () => {
  assert.equal(routineEligible(message, kb), true);
  assert.equal(
    routineEligible(
      {
        ...message,
        kind: "followup",
        ai_metadata: {
          ...message.ai_metadata,
          model_classification: "followup",
        },
      },
      kb,
    ),
    true,
  );
  for (const kind of ["intro", "other"])
    assert.equal(routineEligible({ ...message, kind }, kb), false);
  for (const change of [
    { requires_approval: true },
    { fact_ids: ["invented"] },
    { fact_ids: [] },
    { knowledge_version: "old" },
    { classification: "quote_request" },
    { model_classification: "needs_review" },
  ])
    assert.equal(
      routineEligible(
        { ...message, ai_metadata: { ...message.ai_metadata, ...change } },
        kb,
      ),
      false,
    );
});
test("financial, scheduling and sensitive content cannot pass routine policy", () => {
  for (const body of [
    "The price is $40",
    "We can offer a discount",
    "Our quote is ready",
    "I guarantee arrival",
    "Your invoice is ready",
    "Let us schedule a call",
    "We accept net 30",
    "Please send credentials",
    "Let us use another supplier",
  ])
    assert.equal(routineEligible({ ...message, body }, kb), false, body);
});
