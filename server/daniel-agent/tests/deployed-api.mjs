import assert from "node:assert/strict";
const base = process.env.DANIEL_TEST_BASE || "http://localhost:4175";
if (base === "http://localhost:4175") {
  await import("../dev.mjs");
}
let cookie = "";
const tag = Date.now();
let passed = 0;
async function call(path, data, expected = 200) {
  const r = await fetch(base + "/api/daniel/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { origin: base, cookie, "content-type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const j = await r.json();
  assert.equal(r.status, expected, JSON.stringify(j));
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return j;
}
async function run() {
  let r = await call("run", {});
  if (r.status !== "queued") return r;
  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const d = await call("data");
    const job = d.runs.find((x) => x.id === r.runId);
    if (job && !["queued", "running"].includes(job.status))
      return { ...job.summary, status: job.status };
  }
  throw Error("Background run timed out");
}
async function check(name, fn) {
  await fn();
  console.log("PASS", name);
  passed++;
}
await check("anonymous data denied", () => call("data", undefined, 401));
await check("authenticated login", () =>
  call("login", { password: process.env.ADMIN_PASSWORD }),
);
let p, m;
await check("create prospect", async () => {
  p = await call("prospect", {
    name: "API QA Franchise " + tag,
    segment: "restaurant franchisee",
    website: "https://example.com",
    source_url: "https://example.com/contact",
    contact_name: "QA Buyer",
    email: "api-" + tag + "@example.test",
  });
  assert.ok(p.id);
});
await check("create draft", async () => {
  m = await call("draft", {
    contact_id: p.contact_id,
    subject: "QA signage inquiry",
    body: "Would your team like to discuss recurring signage?",
    kind: "intro",
  });
  assert.equal(m.status, "draft");
});
await check("owner approval", async () => {
  await call("approval/request", { id: m.id });
  const d = await call("data");
  const a = d.approvals.find(
    (a) => a.message_id === m.id && a.decision === "pending",
  );
  await call("approval/decide", {
    id: a.id,
    decision: "approved",
    note: "Preview integration test",
  });
  await call("approval/decide", { id: a.id, decision: "approved" }, 409);
});
await check("concurrent worker executions do not duplicate sends", async () => {
  await Promise.all([run(), run()]);
  const d = await call("data");
  assert.equal(d.messages.find((x) => x.id === m.id).status, "simulated");
  assert.equal(d.deliveries.filter((x) => x.message_id === m.id).length, 1);
  assert.equal(d.messages.find((x) => x.id === m.id).sent_at, null);
  assert.equal(d.config.liveEmailEnabled, false);
});
if (process.env.DANIEL_TEST_AI === "true")
  await check("real AI generates grounded customer reply", async () => {
    await call("test/inbound", {
      email: "api-" + tag + "@example.test",
      event_id: "quote-" + tag,
      subject: "Banner quote",
      body: "Can you quote ten vinyl banners for our locations?",
    });
    const draft = await call("draft/ai", {
      contact_id: p.contact_id,
      kind: "reply",
    });
    assert.equal(draft.status, "draft");
    assert.ok(draft.body.length > 30);
    assert.equal(draft.ai_metadata.knowledge_version, "bof-v1");
    assert.equal(draft.ai_metadata.requires_approval, true);
  });
await check("reply event replay and suppression", async () => {
  const input = {
    email: "api-" + tag + "@example.test",
    event_id: "qa-" + tag,
    subject: "Re: QA",
    body: "Please unsubscribe",
  };
  assert.equal((await call("test/inbound", input)).created, true);
  assert.equal((await call("test/inbound", input)).duplicate, true);
  const d = await call("data");
  assert.ok(d.contacts.find((c) => c.id === p.contact_id).suppressed_at);
  assert.equal(
    d.tasks.filter(
      (t) => t.contact_id === p.contact_id && t.status === "pending",
    ).length,
    0,
  );
});
await check("cannot draft to suppressed contact", () =>
  call("draft", { contact_id: p.contact_id, subject: "No", body: "No" }, 409),
);
await check("daily report distinguishes preview", async () => {
  const r = await call("report", {});
  assert.ok(r.simulated >= 1);
  assert.equal(r.sent, 0);
});
await check("scheduled meeting and calendar download", async () => {
  const start = new Date(Date.now() + (tag % 1000000) + 86400000);
  const x = await call("meeting", {
    opportunity_id: p.opportunity_id,
    title: "QA meeting",
    starts_at: start.toISOString(),
    ends_at: new Date(+start + 1800000).toISOString(),
  });
  const res = await fetch(base + "/api/daniel/meeting?id=" + x.id, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /BEGIN:VEVENT/);
  await call("meeting/cancel", { id: x.id });
});
await check("settings pause and resume", async () => {
  await call("settings", { paused: true });
  assert.equal((await run()).status, "paused");
  await call("settings", { paused: false });
});
await check("logout invalidates session", async () => {
  await call("logout", {});
  await call("data", undefined, 401);
});
console.log("PASSED", passed, "API workflow checks against", base);

process.exit(0);
