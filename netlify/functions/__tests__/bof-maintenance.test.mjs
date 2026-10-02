import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import queries from "../_shared/bof-maintenance-queries.cjs";
import bof from "../_shared/bof-service.cjs";
import email from "../_shared/bof-email.cjs";
import marketing from "../_shared/marketing-email-store.cjs";

let db;
const sql = async (strings, ...values) => {
  const query = strings.reduce(
    (text, part, index) =>
      text + part + (index < values.length ? `$${index + 1}` : ""),
    "",
  );
  // PGlite has core gen_random_uuid(), without the optional pgcrypto extension.
  if (/^\s*CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(query)) return [];
  return (await db.query(query, values)).rows;
};
const launched = new Date(Date.now() - 14 * 86400000).toISOString();
const order = async (
  address,
  { status = "delivered", ageDays = 1, test = false } = {},
) => {
  const id = randomUUID();
  await sql`INSERT INTO orders(id,email,status,total_cents,created_at,is_test_order)
    VALUES(${id}::uuid,${address},${status},7950,now()-(${ageDays}*interval '1 day'),${test})`;
  return id;
};
const member = async () => {
  const id = randomUUID();
  await sql`INSERT INTO profiles(id,email) VALUES(${id}::uuid,${id + "@customer.com"})`;
  await sql`INSERT INTO bof_members(user_id,code) VALUES(${id}::uuid,${id.replaceAll("-", "").slice(0, 12).toUpperCase()})`;
  return id;
};
const benefit = async (id, wallet, state = "paid") => {
  await sql`INSERT INTO bof_order_benefits(order_id,buyer_email,wallet_member_id,wallet_cents,contribution_cents,net_merchandise_cents,cost_snapshot,state)
    VALUES(${id}::uuid,${id + "@customer.com"},${wallet}::uuid,1000,2500,7500,'{}',${state})`;
  await sql`INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at)
    VALUES(${wallet}::uuid,${id}::uuid,${"spend:" + id},'redemption',-1000,now())`;
};
const refund = async (id, cents = 7950) => {
  await sql`INSERT INTO bof_provider_refunds(provider,refund_id,order_id,amount_cents)
    VALUES('paypal',${randomUUID()},${id}::uuid,${cents})`;
};
const sendRow = async (
  address,
  status,
  createdHours = 1,
  attemptedMinutes = 10,
) => {
  const id = randomUUID();
  await sql`INSERT INTO marketing_email_sends(campaign_key,normalized_email,recipient_email,subject,status,request_id,provider_idempotency_key,unsubscribe_token_hash,created_at,last_attempt_at)
    VALUES(${email.CAMPAIGN},${address},${address},'BOF test',${status},${id},${"test/" + id},${id},
      now()-(${createdHours}*interval '1 hour'),now()-(${attemptedMinutes}*interval '1 minute'))`;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE profiles(id uuid PRIMARY KEY,email text UNIQUE,full_name text,username text,is_admin boolean DEFAULT false,email_verified boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),email text,status text,total_cents integer,is_test_order boolean DEFAULT false,payment_reconciliation_status text,checkout_idempotency_key text,paypal_capture_id text,paypal_order_id text,stripe_payment_intent_id text,created_at timestamptz DEFAULT now());`);
  await db.exec(
    await readFile(
      new URL(
        "../../../migrations/045_bof_referral_program.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await marketing.ensureMarketingEmailSchema(sql);
}, 30000);
beforeEach(async () => {
  await db.exec(
    "TRUNCATE profiles,orders,marketing_email_sends,marketing_email_suppressions,bof_invitations,bof_rate_limits CASCADE",
  );
  vi.stubEnv("BOF_REFERRAL_ENABLED", "true");
  vi.stubEnv("CONTEXT", "production");
  vi.stubEnv("DEPLOY_PRIME_URL", "https://bannersonthefly.com");
  vi.stubEnv("AUTH_SESSION_SECRET", "isolated-maintenance-test-secret");
  vi.stubEnv("RESEND_API_KEY", "re_isolated_test_no_network");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => db?.close());

describe("BOF maintenance database work selection", () => {
  it("advances past more than one batch of already reconciled refunds", async () => {
    const wallet = await member();
    for (let index = 0; index < 105; index++) {
      const id = await order(`settled-${index}@customer.com`, {
        status: "paid",
      });
      await benefit(id, wallet, "reversed");
      await refund(id);
      await sql`INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at)
        VALUES(${wallet}::uuid,${id}::uuid,${"return:" + id},'redemption_refund',1000,now())`;
    }
    const pending = await order("new-refund@customer.com", { status: "paid" });
    await benefit(pending, wallet);
    await refund(pending);
    const work = await queries.pendingRefunds(sql);
    expect(work.map((row) => row.order_id)).toEqual([pending]);
    await bof.reverse(
      sql,
      pending,
      Number(work[0].cents),
      Number(work[0].total_cents),
    );
    expect(await queries.pendingRefunds(sql)).toEqual([]);
  });

  it("requeues a reversed order when a later partial refund increases credit owed", async () => {
    const wallet = await member();
    const id = await order("partial-refund@customer.com", { status: "paid" });
    await benefit(id, wallet);
    await refund(id, 3975);
    await bof.reverse(sql, id, 3975, 7950);
    expect(await queries.pendingRefunds(sql)).toEqual([]);
    await refund(id, 3975);
    expect(
      (await queries.pendingRefunds(sql)).map((row) => row.order_id),
    ).toEqual([id]);
    await bof.reverse(sql, id, 7950, 7950);
    expect(await queries.pendingRefunds(sql)).toEqual([]);
    expect(
      (
        await sql`SELECT sum(amount_cents)::integer AS cents FROM bof_cash_entries WHERE order_id=${id}::uuid AND kind='redemption_refund'`
      )[0].cents,
    ).toBe(1000);
  });

  it("selects new delivery invitations and bounded retries while excluding unsafe or ineligible recipients", async () => {
    for (const address of [
      "new@customer.com",
      "retry@customer.com",
      "processing@customer.com",
      "fresh@customer.com",
      "stale@customer.com",
      "sent@customer.com",
      "suppressed@customer.com",
      "invalid",
    ])
      await order(address);
    await sendRow("retry@customer.com", "error", 20);
    await sendRow("processing@customer.com", "processing", 20);
    await sendRow("fresh@customer.com", "processing", 1, 1);
    await sendRow("stale@customer.com", "error", 24);
    await sendRow("sent@customer.com", "sent");
    await sendRow("suppressed@customer.com", "suppressed");
    await order("historical@customer.com", { ageDays: 15 });
    await order("test@customer.com", { test: true });
    const joined = await member();
    await order(joined + "@customer.com");
    const shipped = await order("shipped@customer.com", { status: "shipped" });
    await sql`INSERT INTO bof_order_touchpoints(order_id,first_shipped_at) VALUES(${shipped}::uuid,now()-interval '4 days')`;
    const recent = await order("recent-shipment@customer.com", {
      status: "shipped",
    });
    await sql`INSERT INTO bof_order_touchpoints(order_id,first_shipped_at) VALUES(${recent}::uuid,now()-interval '2 days')`;
    const due = await queries.dueInvitations(sql, launched, email.CAMPAIGN);
    expect(new Set(due.map((row) => row.email))).toEqual(
      new Set([
        "new@customer.com",
        "retry@customer.com",
        "processing@customer.com",
        "shipped@customer.com",
      ]),
    );
    expect(due.slice(0, 2).map((row) => row.email)).toEqual([
      "new@customer.com",
      "shipped@customer.com",
    ]);
  });

  it("records suppressed skips so a full skipped batch cannot hide the next eligible customer", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("No external request is allowed");
    });
    vi.stubGlobal("fetch", fetchSpy);
    for (let index = 0; index < 10; index++) {
      const address = `suppressed-${index}@customer.com`;
      await order(address, { ageDays: 2 });
      await sql`INSERT INTO marketing_email_suppressions(normalized_email,reason,source) VALUES(${address},'unsubscribe','footer_link')`;
    }
    await order("next-eligible@customer.com");
    const first = await queries.dueInvitations(sql, launched, email.CAMPAIGN);
    expect(first).toHaveLength(10);
    for (const customer of first)
      expect((await email.sendInvitation(sql, customer.email)).status).toBe(
        "skipped",
      );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      (
        await sql`SELECT count(*)::integer AS count FROM marketing_email_sends WHERE status='suppressed'`
      )[0].count,
    ).toBe(10);
    expect(
      (await sql`SELECT count(*)::integer AS count FROM bof_invitations`)[0]
        .count,
    ).toBe(0);
    expect(await queries.dueInvitations(sql, launched, email.CAMPAIGN)).toEqual(
      [{ email: "next-eligible@customer.com" }],
    );
  });

  it("retries a transient invitation failure with the same provider key and body, then stops selecting it", async () => {
    const address = "transient@customer.com";
    await order(address);
    const requests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (String(url) !== "https://api.resend.com/emails")
          throw new Error("Unexpected outbound request");
        requests.push({
          key: new Headers(options.headers).get("idempotency-key"),
          body: options.body,
        });
        return requests.length === 1
          ? new Response(
              JSON.stringify({
                name: "application_error",
                message: "Temporary test failure",
                statusCode: 500,
              }),
              { status: 500 },
            )
          : new Response(JSON.stringify({ id: "isolated-message-id" }), {
              status: 200,
            });
      }),
    );
    expect((await email.sendInvitation(sql, address)).status).toBe("failed");
    expect(await queries.dueInvitations(sql, launched, email.CAMPAIGN)).toEqual(
      [],
    );
    await sql`UPDATE marketing_email_sends SET last_attempt_at=now()-interval '6 minutes' WHERE normalized_email=${address}`;
    expect(await queries.dueInvitations(sql, launched, email.CAMPAIGN)).toEqual(
      [{ email: address }],
    );
    expect((await email.sendInvitation(sql, address)).status).toBe("sent");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0].key).toMatch(/^bof-referral\//);
    expect(
      (
        await sql`SELECT status,attempt_count FROM marketing_email_sends WHERE normalized_email=${address}`
      )[0],
    ).toEqual({ status: "sent", attempt_count: 2 });
    expect(await queries.dueInvitations(sql, launched, email.CAMPAIGN)).toEqual(
      [],
    );
  });
});
