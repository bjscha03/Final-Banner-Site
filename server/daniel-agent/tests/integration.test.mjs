import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../migrate.mjs";
import {
  createProspect,
  saveDraft,
  requestApproval,
  decide,
  suppress,
} from "../store.mjs";
import { dispatch, reconcile } from "../dispatch.mjs";
import { ingest, syncMailbox } from "../mail-sync.mjs";
import { handler } from "../api.mjs";
import { seal, unseal } from "../auth.mjs";
import { scheduleMeeting, ics } from "../scheduling.mjs";
import { generateDraft } from "../ai.mjs";
import { mode } from "../config.mjs";
import { enqueueRun } from "../jobs.mjs";
import { runWorker } from "../worker.mjs";
function adapter(db) {
  function sql(strings, ...values) {
    let text;
    if (typeof strings === "string") {
      text = strings;
      values = values[0] || [];
    } else {
      text = strings.reduce((a, s, i) => a + (i ? "$" + i : "") + s, "");
    }
    const q = { text, values };
    return {
      q,
      then(resolve, reject) {
        return db
          .query(text, values)
          .then((r) => r.rows)
          .then(resolve, reject);
      },
    };
  }
  sql.transaction = async (queries) =>
    db.transaction(async (tx) => {
      const out = [];
      for (const p of queries)
        out.push((await tx.query(p.q.text, p.q.values)).rows);
      return out;
    });
  return sql;
}
const db = new PGlite(),
  sql = adapter(db);
await migrate(sql);
// PGlite has a single session and no concurrency; real Neon race checks run separately.
await db.exec(
  "CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(integer,integer) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$",
);
const env = {
  DANIEL_ALLOWED_HOST: "preview.test",
  DANIEL_AGENT_MODE: "preview",
  DANIEL_ADMIN_PASSWORD: "test-password-only",
  DANIEL_SESSION_SECRET: "test-encryption-key-longer-than-32-characters",
};
let n = 0;
async function prospect() {
  n++;
  return createProspect(
    sql,
    {
      name: "Test Franchise " + n,
      segment: "restaurant franchisee",
      website: "https://example.com",
      source_url: "https://example.com/contact",
      contact_name: "Test Buyer",
      email: "buyer" + n + "@example.test",
    },
    "test",
  );
}
async function queued(p, kind = "intro") {
  const m = await saveDraft(
    sql,
    {
      contact_id: p.contact_id,
      kind,
      subject: "Signage",
      body: "Can we help with upcoming signage?",
    },
    "test",
  );
  await requestApproval(sql, m.id, "test");
  const [a] =
    await sql`SELECT id FROM daniel_sales.approvals WHERE message_id=${m.id}`;
  await decide(sql, a.id, "approved", "Reviewed", "test");
  return m;
}
const now = new Date("2026-10-21T16:00:00Z");
test("server-side auth, CSRF, host guard, logout and failed login", async () => {
  const req = (path, method = "GET", data = {}, cookie = "") =>
    new Request("https://preview.test" + path, {
      method,
      headers: {
        origin: "https://preview.test",
        cookie,
        "content-type": "application/json",
      },
      ...(method === "POST" ? { body: JSON.stringify(data) } : {}),
    });
  let r = await handler(req("/api/daniel/data"), {}, { sql, env });
  assert.equal(r.status, 401);
  r = await handler(
    new Request("https://live.test/api/daniel/data"),
    {},
    { sql, env },
  );
  assert.equal(r.status, 404);
  r = await handler(
    new Request("https://preview.test/api/daniel/login", {
      method: "POST",
      body: "{}",
    }),
    {},
    { sql, env },
  );
  assert.equal(r.status, 403);
  r = await handler(
    req("/api/daniel/login", "POST", { password: "wrong" }),
    {},
    { sql, env },
  );
  assert.equal(r.status, 401);
  r = await handler(
    req("/api/daniel/login", "POST", { password: "test-password-only" }),
    {},
    { sql, env },
  );
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(
    (
      await handler(
        req("/api/daniel/data", "GET", {}, cookie),
        {},
        { sql, env },
      )
    ).status,
    200,
  );
  await handler(
    req("/api/daniel/logout", "POST", {}, cookie),
    {},
    { sql, env },
  );
  assert.equal(
    (
      await handler(
        req("/api/daniel/data", "GET", {}, cookie),
        {},
        { sql, env },
      )
    ).status,
    401,
  );
});
test("prospect creation is atomic and rejects duplicate email and suppliers", async () => {
  const p = await prospect();
  const [c] =
    await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  await assert.rejects(() =>
    createProspect(
      sql,
      {
        name: "Supplier",
        segment: "sign shop",
        website: "https://example.com",
        source_url: "https://example.com",
        contact_name: "Vendor",
        email: "v@example.test",
      },
      "test",
    ),
  );
  const [before] =
    await sql`SELECT count(*)::int AS n FROM daniel_sales.accounts`;
  await assert.rejects(() =>
    createProspect(
      sql,
      {
        name: "Duplicate",
        segment: "retail chain",
        website: "https://example.com",
        source_url: "https://example.com",
        contact_name: "Buyer",
        email: c.email,
      },
      "test",
    ),
  );
  const [after] =
    await sql`SELECT count(*)::int AS n FROM daniel_sales.accounts`;
  assert.equal(before.n, after.n);
});
test("approval -> test outbox -> one follow-up; repeated execution cannot duplicate", async () => {
  const p = await prospect(),
    m = await queued(p);
  const result = await dispatch(sql, env, null, { now });
  assert.equal(result.simulated, 1);
  await dispatch(sql, env, null, { now });
  const d =
    await sql`SELECT * FROM daniel_sales.test_deliveries WHERE message_id=${m.id}`;
  assert.equal(d.length, 1);
  const [message] =
    await sql`SELECT * FROM daniel_sales.messages WHERE id=${m.id}`;
  assert.equal(message.status, "simulated");
  assert.equal(message.sent_at, null);
  const tasks =
    await sql`SELECT * FROM daniel_sales.tasks WHERE contact_id=${p.contact_id}`;
  assert.equal(tasks.length, 1);
  assert.ok(new Date(tasks[0].due_at) > new Date());
});
test("global suppression blocks approved messages, cancels followups and prevents new drafts", async () => {
  const p = await prospect(),
    m = await queued(p);
  const [c] =
    await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  await suppress(sql, c.email, "Opt out", "test");
  await dispatch(sql, env, null, { now });
  const [a] =
    await sql`SELECT status FROM daniel_sales.messages WHERE id=${m.id}`;
  assert.equal(a.status, "blocked");
  await assert.rejects(() =>
    saveDraft(
      sql,
      { contact_id: p.contact_id, subject: "No", body: "No" },
      "test",
    ),
  );
});
test("reply ingest deduplicates, cancels followups and immediately suppresses unsubscribe", async () => {
  const p = await prospect();
  await queued(p);
  const [c] =
    await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  const message = {
    id: "gmail-test-1",
    threadId: "thread-1",
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "From", value: c.email }],
      body: { data: Buffer.from("Please unsubscribe").toString("base64url") },
    },
  };
  assert.equal((await ingest(sql, message)).created, true);
  assert.equal((await ingest(sql, message)).duplicate, true);
  const [updated] =
    await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  assert.ok(updated.suppressed_at);
  const rows =
    await sql`SELECT * FROM daniel_sales.messages WHERE provider_message_id='gmail-test-1'`;
  assert.equal(rows.length, 1);
});
test("unknown inbox mail is not stored; outgoing messages do not become replies", async () => {
  assert.equal(
    (
      await ingest(sql, {
        id: "unknown",
        payload: { headers: [{ name: "From", value: "unknown@example.test" }] },
      })
    ).ignored,
    true,
  );
  assert.equal(
    (await ingest(sql, { id: "outgoing", labelIds: ["SENT"] })).ignored,
    true,
  );
});
test("daily quota remains atomic and blocks reservation above cap", async () => {
  const p = await prospect(),
    m = await queued(p);
  const [d] =
    await sql`SELECT (now() AT TIME ZONE 'America/New_York')::date AS day`;
  await sql`INSERT INTO daniel_sales.daily_limits(local_date,kind,sent_count) VALUES(${d.day},'intro',10) ON CONFLICT(local_date,kind) DO UPDATE SET sent_count=10`;
  assert.equal(
    (await sql`SELECT * FROM daniel_sales.claim_message(${m.id}::uuid,10)`)
      .length,
    0,
  );
  await sql`UPDATE daniel_sales.daily_limits SET sent_count=0 WHERE kind='intro'`;
});
test("ambiguous provider failure is held and not retried", async () => {
  const p = await prospect(),
    m = await queued(p);
  let calls = 0;
  const live = {
    ...env,
    DANIEL_AGENT_MODE: "live",
    DANIEL_CUTOVER_APPROVED: "true",
    CONTEXT: "production",
    DANIEL_SENDER_EMAIL: "info@bannersonthefly.com",
    OUTBOUND_PHYSICAL_ADDRESS: "Test address",
  };
  await dispatch(sql, live, "token", {
    now,
    verifyIdentity: async () => {},
    send: async () => {
      calls++;
      throw Error("network timeout");
    },
  });
  const [x] = await sql`SELECT * FROM daniel_sales.messages WHERE id=${m.id}`;
  assert.equal(x.status, "uncertain");
  const before = calls;
  await dispatch(sql, live, "token", {
    now,
    verifyIdentity: async () => {},
    send: async () => {
      calls++;
      throw Error("Should not happen");
    },
  });
  assert.equal(calls, before);
});
test("preview cannot enable live sends through a mode value alone", () => {
  assert.equal(mode({ ...env, DANIEL_AGENT_MODE: "live" }), "preview");
  assert.equal(
    mode({
      ...env,
      DANIEL_AGENT_MODE: "live",
      DANIEL_CUTOVER_APPROVED: "true",
      CONTEXT: "deploy-preview",
    }),
    "preview",
  );
});
test("encrypted OAuth tokens reject tampering and wrong keys", () => {
  const data = seal("private-refresh-token", env.DANIEL_SESSION_SECRET);
  assert.ok(!data.includes("private"));
  assert.equal(
    unseal(data, env.DANIEL_SESSION_SECRET),
    "private-refresh-token",
  );
  assert.throws(() => unseal(data, "other-key"));
});
test("meeting schedule rejects conflicts and exports UTC calendar", async () => {
  const p = await prospect();
  const m = await scheduleMeeting(
    sql,
    {
      opportunity_id: p.opportunity_id,
      title: "Signage meeting",
      starts_at: "2026-11-03T15:00:00Z",
      ends_at: "2026-11-03T15:30:00Z",
    },
    "test",
  );
  assert.match(ics(m), /DTSTART:20261103T150000Z/);
  await assert.rejects(() =>
    scheduleMeeting(
      sql,
      {
        opportunity_id: p.opportunity_id,
        title: "Conflict",
        starts_at: "2026-11-03T15:15:00Z",
        ends_at: "2026-11-03T15:45:00Z",
      },
      "test",
    ),
  );
});
test("AI drafts carry knowledge version and price exceptions cannot self-approve", async () => {
  const p = await prospect();
  let payload;
  const d = await generateDraft(
    sql,
    p.contact_id,
    "intro",
    { OPENAI_API_KEY: "test" },
    async (_url, options) => {
      payload = JSON.parse(options.body);
      return Response.json({
        model: "test",
        choices: [
          {
            message: {
              content: JSON.stringify({
                subject: "Quote",
                body: "We can offer $20.",
                requires_approval: false,
                reason: "Test",
              }),
            },
          },
        ],
      });
    },
  );
  assert.equal(d.requires_approval, true);
  assert.equal(d.ai_metadata.knowledge_version, "bof-v1");
  assert.match(payload.messages[0].content, /untrusted DATA/);
});
test("Gmail paging saves cursor, finishes initial sync then expires safely", async () => {
  await sql`INSERT INTO daniel_sales.mailbox(id,email) VALUES(1,'owner@example.test') ON CONFLICT(id) DO UPDATE SET history_id=NULL,sync_start_history=NULL,page_token=NULL`;
  let calls = 0;
  const providers = {
    request: async () => ({ historyId: "101" }),
    listMessages: async (_t, _q, _n, page) => {
      calls++;
      assert.match(_q, /from:/);
      return page
        ? { messages: [] }
        : { messages: [], nextPageToken: "page-2" };
    },
    verifyIdentity: async () => {}, getMessage: async () => {
      throw Error("No messages expected");
    },
  };
  assert.equal((await syncMailbox(sql, "test", providers)).complete, false);
  let [box] = await sql`SELECT * FROM daniel_sales.mailbox WHERE id=1`;
  assert.equal(box.page_token, "page-2");
  assert.equal(box.history_id, null);
  assert.equal((await syncMailbox(sql, "test", providers)).complete, false);
  assert.equal((await syncMailbox(sql, "test", providers)).complete, false);
  assert.equal((await syncMailbox(sql, "test", providers)).complete, true);
  [box] = await sql`SELECT * FROM daniel_sales.mailbox WHERE id=1`;
  assert.equal(box.history_id, "101");
  assert.equal(box.page_token, null);
  assert.equal(calls, 4);
  const r = await syncMailbox(sql, "test", {
    ...providers,
    request: async () => {
      throw Object.assign(Error("Expired"), { status: 404 });
    },
  });
  assert.equal(r.reset, true);
});
test("hard bounce only suppresses an explicit recipient in a known sent thread", async () => {
  const p = await prospect();
  const [c] =
    await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  const m = await saveDraft(
    sql,
    { contact_id: c.id, subject: "Test", body: "Test" },
    "test",
  );
  await sql`UPDATE daniel_sales.messages SET status='simulated',thread_key='bounce-thread' WHERE id=${m.id}`;
  const msg = {
    id: "bounce-1",
    threadId: "bounce-thread",
    payload: {
      mimeType: "message/delivery-status",
      headers: [{ name: "From", value: "mailer-daemon@example.test" }],
      body: {
        data: Buffer.from(
          "Final-Recipient: rfc822; " + c.email + "\nStatus: 5.1.1",
        ).toString("base64url"),
      },
    },
  };
  assert.equal((await ingest(sql, msg)).bounced, true);
  const [updated] =
    await sql`SELECT * FROM daniel_sales.contacts WHERE id=${c.id}`;
  assert.ok(updated.suppressed_at);
});
test("AI cold introductions reject invented prior contact and strip duplicate signatures", async () => {
  const p = await prospect();
  let calls = 0;
  const fetcher = async () =>
    Response.json({
      model: "test",
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: "Signage",
              body:
                ++calls === 1
                  ? "Thank you for reaching out to us."
                  : "We offer vinyl banners. Are you the right contact?\nBest regards,\nDaniel",
              fact_ids: ["products"],
              requires_approval: false,
            }),
          },
        },
      ],
    });
  const draft = await generateDraft(
    sql,
    p.contact_id,
    "intro",
    { OPENAI_API_KEY: "test-only" },
    fetcher,
  );
  assert.equal(calls, 2);
  assert.equal(
    draft.body,
    "We offer vinyl banners. Are you the right contact?",
  );
  const bad = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: "Hello",
              body: "Thanks for your inquiry.",
            }),
          },
        },
      ],
    });
  await assert.rejects(
    generateDraft(
      sql,
      p.contact_id,
      "intro",
      { OPENAI_API_KEY: "test-only" },
      bad,
    ),
    /invented prior contact/,
  );
});
test("routine worker simulation is automatic while exceptions remain in owner queue", async () => {
  await sql`UPDATE daniel_sales.settings SET paused=false,auto_reply=true WHERE id=1`;
  const normal = await prospect(),
    exception = await prospect();
  for (const p of [normal, exception])
    await sql`INSERT INTO daniel_sales.tasks(contact_id,opportunity_id,kind,due_at,dedupe_key) VALUES(${p.contact_id},${p.opportunity_id},'followup',now(),${"auto-test:" + p.contact_id})`;
  const generate = async (_, contactId, kind) => ({
    contact_id: contactId,
    kind,
    subject: "Following up on signage",
    body:
      contactId === normal.contact_id
        ? "Would you like help choosing vinyl banners for your locations?"
        : "We can discuss custom pricing.",
    ai_metadata: {
      knowledge_version: "bof-v1",
      requires_approval: contactId === exception.contact_id,
      model_classification: "followup",
      fact_ids: ["products"],
    },
  });
  await runWorker(env, { sql, now, generateDraft: generate });
  const [routine] =
    await sql`SELECT * FROM daniel_sales.messages WHERE contact_id=${normal.contact_id}`;
  const [held] =
    await sql`SELECT * FROM daniel_sales.messages WHERE contact_id=${exception.contact_id}`;
  assert.equal(routine.status, "simulated");
  assert.equal(routine.approved_by, "daniel-policy");
  assert.equal(routine.sent_at, null);
  assert.equal(held.status, "pending_approval");
  await runWorker(env, { sql, now, generateDraft: generate });
  assert.equal(
    (
      await sql`SELECT * FROM daniel_sales.test_deliveries WHERE message_id=${routine.id}`
    ).length,
    1,
  );
  await sql`UPDATE daniel_sales.settings SET auto_reply=false WHERE id=1`;
});
test("background jobs authenticate, persist completion and reject replay", async (t) => {
  const calls = [];
  const mock = t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 202 });
  });
  const job = await enqueueRun(sql, {
    ...env,
    DANIEL_CRON_SECRET: "test-cron-secret",
  });
  assert.equal(job.status, "queued");
  assert.equal(
    calls[0].url,
    "https://preview.test/api/internal/daniel-agent/job",
  );
  assert.equal(calls[0].init.headers.authorization, "Bearer test-cron-secret");
  assert.equal(JSON.parse(calls[0].init.body).runId, job.runId);
  await sql`UPDATE daniel_sales.settings SET paused=true WHERE id=1`;
  const result = await runWorker(env, { sql, runId: job.runId });
  assert.equal(result.status, "paused");
  assert.equal(
    (await runWorker(env, { sql, runId: job.runId })).status,
    "already_processed",
  );
  const [saved] =
    await sql`SELECT * FROM daniel_sales.runs WHERE id=${job.runId}`;
  assert.equal(saved.status, "paused");
  assert.ok(saved.completed_at);
  mock.mock.restore();
  await sql`UPDATE daniel_sales.settings SET paused=false WHERE id=1`;
});
test("failed background scheduling is recorded and never appears completed", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 503 }),
  );
  await assert.rejects(enqueueRun(sql, env), /Unable to queue/);
  const [job] =
    await sql`SELECT * FROM daniel_sales.runs ORDER BY started_at DESC LIMIT 1`;
  assert.equal(job.status, "failed");
  assert.ok(job.completed_at);
});
test('controlled Gmail dispatch cannot reach other recipients and normal preview never sends', async () => {
  const controlled = await prospect(), other = await prospect();
  const [contact] = await sql`SELECT email FROM daniel_sales.contacts WHERE id=${controlled.contact_id}`;
  const a = await queued(controlled), b = await queued(other);
  await sql`DELETE FROM daniel_sales.daily_limits`;
  const cfg = {...env,CONTEXT:'deploy-preview',DANIEL_GMAIL_TEST_RECIPIENTS:contact.email,DANIEL_GMAIL_TEST_UNTIL:new Date(Date.now()+3600000).toISOString(),DANIEL_SENDER_EMAIL:'info@bannersonthefly.com',OUTBOUND_PHYSICAL_ADDRESS:'PO Box 368'};
  const sends=[];
  const send=async(_,m)=>{sends.push(m);return {id:'real-test-id',threadId:'real-test-thread'}};
  const getMessage=async()=>({payload:{headers:[{name:'Message-ID',value:'<canonical@gmail.test>'}]}});
  await dispatch(sql,cfg,'token',{gmailTest:true,send,getMessage,now,verifyIdentity:async()=>{}});
  assert.equal(sends.length,1);
  assert.equal(sends[0].to,contact.email);
  const [saved]=await sql`SELECT * FROM daniel_sales.messages WHERE id=${a.id}`;
  assert.equal(saved.ai_metadata.gmail_test,true);
  assert.equal(saved.status,'sent');
  assert.equal(saved.rfc_message_id,'<canonical@gmail.test>');
  assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${b.id}`)[0].status,'queued');
  await dispatch(sql,cfg,'token',{gmailTest:true,send,getMessage,now,verifyIdentity:async()=>{}});
  assert.equal(sends.length,1);
  await dispatch(sql,cfg,'token',{send,now});
  assert.equal(sends.length,1);
  assert.equal((await sql`SELECT status FROM daniel_sales.messages WHERE id=${b.id}`)[0].status,'simulated');
  await assert.rejects(dispatch(sql,{...cfg,DANIEL_GMAIL_TEST_UNTIL:'2000-01-01'},'token',{gmailTest:true,send,now}),/disabled or expired/);
});
test('accepted Gmail send survives header-read failure without a second delivery', async()=>{
  const p=await prospect(), m=await queued(p);
  const [c]=await sql`SELECT email FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  const cfg={...env,CONTEXT:'deploy-preview',DANIEL_GMAIL_TEST_RECIPIENTS:c.email,DANIEL_GMAIL_TEST_UNTIL:new Date(Date.now()+3600000).toISOString(),DANIEL_SENDER_EMAIL:'info@bannersonthefly.com',OUTBOUND_PHYSICAL_ADDRESS:'PO Box 368'};
  let sends=0;
  await dispatch(sql,cfg,'token',{gmailTest:true,now,send:async()=>{sends++;return {id:'accepted-before-read-failure',threadId:'provider-thread'}},verifyIdentity: async () => {}, getMessage:async()=>{throw Error('temporary read failure')}});
  const [held]=await sql`SELECT * FROM daniel_sales.messages WHERE id=${m.id}`;
  assert.equal(held.status,'uncertain');assert.equal(held.provider_message_id,'accepted-before-read-failure');
  await reconcile(sql,cfg,'token',{verifyIdentity: async () => {}, getMessage:async(_,id)=>{assert.equal(id,held.provider_message_id);return {payload:{headers:[{name:'Message-ID',value:'<rewritten@gmail.test>'}]}}},listMessages:async()=>{throw Error('Must use retained provider ID')}});
  const [recovered]=await sql`SELECT * FROM daniel_sales.messages WHERE id=${m.id}`;
  assert.equal(recovered.status,'sent');assert.equal(recovered.rfc_message_id,'<rewritten@gmail.test>');assert.equal(sends,1);
});
test.after(() => db.close());

test("forwarded inbound with SENT label is received once; recorded outbox stays outbound", async () => {
  const p=await prospect();
  const [c]=await sql`SELECT * FROM daniel_sales.contacts WHERE id=${p.contact_id}`;
  const inbound={id:"forwarded-dual-label",threadId:"forwarded-thread",labelIds:["SENT","INBOX"],payload:{mimeType:"text/plain",headers:[{name:"From",value:c.email}],body:{data:Buffer.from("What products do you sell?").toString("base64url")}}};
  assert.equal((await ingest(sql,inbound)).created,true);
  assert.equal((await ingest(sql,inbound)).duplicate,true);
  assert.equal((await sql`SELECT * FROM daniel_sales.tasks WHERE contact_id=${c.id} AND kind='reply'`).length,1);
  const out=await saveDraft(sql,{contact_id:c.id,kind:"reply",subject:"Products",body:"Vinyl banners."},"test");
  await sql`UPDATE daniel_sales.messages SET provider_message_id='recorded-outbox',status='sent' WHERE id=${out.id}`;
  assert.equal((await ingest(sql,{...inbound,id:"recorded-outbox"})).ignored,true);
  assert.equal((await sql`SELECT * FROM daniel_sales.messages WHERE contact_id=${c.id} AND direction='inbound'`).length,1);
});

test('daily report is delivered once, signed Brad, with truthful metrics and a durable uncertain hold',async()=>{
 const {emailDailyReport}=await import('../report-email.mjs');
 const {REPORT_RECIPIENT,BUSINESS_ADDRESS}=await import('../identity.mjs');
 const cfg={...env,CONTEXT:'deploy-preview',DANIEL_GMAIL_TEST_RECIPIENTS:REPORT_RECIPIENT,DANIEL_GMAIL_TEST_UNTIL:new Date(Date.now()+3600000).toISOString()};
 let sent=[];const opts={gmailTest:true,verifyIdentity:async()=>{},send:async(_,m)=>{sent.push(m);return {id:'report-provider-id'}}};
 const first=await emailDailyReport(sql,cfg,'token',opts);
 assert.equal(first.status,'sent');assert.equal(sent.length,1);assert.equal(sent[0].to,REPORT_RECIPIENT);assert.match(sent[0].html,/<strong>Brad<\/strong>/);assert.ok(sent[0].html.includes(BUSINESS_ADDRESS));
 assert.equal((await emailDailyReport(sql,cfg,'token',opts)).status,'already_sent');assert.equal(sent.length,1);
 await sql`DELETE FROM daniel_sales.report_outbox`;
 await assert.rejects(emailDailyReport(sql,cfg,'token',{...opts,send:async()=>{throw Error('timeout')}}));
 assert.equal((await emailDailyReport(sql,cfg,'token',{...opts,list:async()=>({messages:[]})})).status,'uncertain_held');assert.equal(sent.length,1);
 assert.equal((await emailDailyReport(sql,cfg,'token',{...opts,list:async()=>({messages:[{id:'report-recovered'}]})})).status,'reconciled');assert.equal(sent.length,1);
});
test('autonomous research creates an evidence-backed prospect and auto-approved unique introduction while agent stays paused',async()=>{
 const {discover}=await import('../discovery.mjs');
 const c={company:'Independent Regional Accounts',website:'https://regional.example.com',email:'marketing@regional.example.com',segment:'regional restaurant group',recurring_buyer:true,opportunity:'Consistent seasonal banners across locations',contact_url:'https://regional.example.com/contact',facts:[{url:'https://regional.example.com/about',quote:'Our group operates twelve restaurants across the United States.'},{url:'https://regional.example.com/contact',quote:'Our marketing team welcomes general business inquiries.'}]};
 const researcher=async(_env,instructions)=>instructions.startsWith('Independently search')?{value:c,responseId:'research-search'}:{value:{approved:true,reason:'Evidence and original content verified'},responseId:'review'};
 const [kb]=await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;
 await sql`UPDATE daniel_sales.settings SET paused=true WHERE id=1`;
 const r=await discover(sql,env,{auto_prospect:true},{now:new Date('2026-10-21T16:00:00Z'),research:researcher,readPage:async url=>({url,text:c.facts.find(x=>x.url===url).quote+' marketing@regional.example.com'}),draft:async(_,id)=>({contact_id:id,kind:'intro',subject:'Seasonal banners for your twelve restaurants',body:'Would consistent vinyl banners help your restaurant teams?',ai_metadata:{requires_approval:false,knowledge_version:kb.version,fact_ids:['products']}})});
 assert.equal(r.status,'completed');
 const [m]=await sql`SELECT * FROM daniel_sales.messages WHERE id=${r.messageId}`;assert.equal(m.status,'queued');assert.equal(m.approved_by,'daniel-policy');
 assert.equal((await sql`SELECT paused FROM daniel_sales.settings WHERE id=1`)[0].paused,true);
 assert.equal((await sql`SELECT * FROM daniel_sales.claim_message(${m.id},10)`).length,0);
 assert.equal((await discover(sql,env,{auto_prospect:true},{now:new Date('2026-10-21T16:00:00Z'),research:()=>{throw Error('Should not research same slot twice')}})).status,'already_researched_this_hour');
});
