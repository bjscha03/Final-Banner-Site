import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import rewardEmail from "../_shared/bof-reward-email.cjs";
import bof from "../_shared/bof-service.cjs";
import marketing from "../_shared/marketing-email-store.cjs";
let db, requests;
const sql = async (strings, ...values) => {
  const query = strings.reduce(
    (s, p, i) => s + p + (i < values.length ? `$${i + 1}` : ""),
    "",
  );
  if (/^\s*CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(query)) return [];
  return (await db.query(query, values)).rows;
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE profiles(id uuid PRIMARY KEY,email text UNIQUE,email_verified boolean DEFAULT true);
    CREATE TABLE orders(id uuid PRIMARY KEY,email text,status text,total_cents integer,is_test_order boolean DEFAULT false,payment_reconciliation_status text,paypal_capture_id text,created_at timestamptz DEFAULT now());`);
  await db.exec(
    await readFile(
      new URL(
        "../../../migrations/045_bof_referral_program.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await rewardEmail.ensureSchema(sql);
  await marketing.ensureMarketingEmailSchema(sql);
}, 30000);
beforeEach(async () => {
  await db.exec(
    "TRUNCATE profiles,orders,marketing_email_suppressions CASCADE",
  );
  vi.stubEnv("BOF_REFERRAL_ENABLED", "true");
  vi.stubEnv("CONTEXT", "production");
  vi.stubEnv("DEPLOY_PRIME_URL", "https://bannersonthefly.com");
  vi.stubEnv("RESEND_API_KEY", "re_isolated_no_network");
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      expect(String(url)).toBe("https://api.resend.com/emails");
      requests.push({
        body: JSON.parse(options.body),
        key: new Headers(options.headers).get("idempotency-key"),
      });
      return new Response(
        JSON.stringify({ id: `isolated-${requests.length}` }),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => db?.close());
async function fixture({ status = "paid", test = false, reward = 500 } = {}) {
  const member = randomUUID(),
    order = randomUUID(),
    buyer = `${order}@buyer.invalid`,
    email = `${member}@member.invalid`;
  await sql`INSERT INTO profiles(id,email) VALUES(${member}::uuid,${email})`;
  await sql`INSERT INTO bof_members(user_id,code) VALUES(${member}::uuid,${member.replaceAll("-", "").slice(0, 12).toUpperCase()})`;
  await sql`INSERT INTO orders(id,email,status,total_cents,is_test_order) VALUES(${order}::uuid,${buyer},${status},7950,${test})`;
  await sql`INSERT INTO bof_order_benefits(order_id,buyer_email,referrer_id,reward_cents,contribution_cents,net_merchandise_cents,cost_snapshot)
    VALUES(${order}::uuid,${buyer},${member}::uuid,${reward},2500,7500,'{}')`;
  await bof.settle(sql, { id: order, is_test_order: test });
  return { member, order, email, buyer };
}
it("notifies only the referrer after a paid order, with accurate pending wording and no buyer data", async () => {
  const f = await fixture();
  expect(await rewardEmail.dispatch(sql, { orderId: f.order })).toEqual({
    sent: 1,
  });
  expect(requests[0].body.to).toBe(f.email);
  expect(requests[0].body.subject).toBe("You earned $5.00 in BOF Cash!");
  expect(requests[0].body.text).toContain("pending rewards");
  expect(requests[0].body.text).toContain("14 days after the order ships");
  expect(requests[0].body.text).toContain(
    "https://bannersonthefly.com/bof-cash",
  );
  expect(JSON.stringify(requests[0])).not.toContain(f.buyer);
  expect(requests[0].body.html).not.toContain("#claim=");
  expect(
    (await sql`SELECT status,provider_id FROM bof_reward_email_sends`)[0],
  ).toEqual({ status: "sent", provider_id: "isolated-1" });
});
it("duplicate payment followups and concurrent maintenance send one earned notification", async () => {
  const f = await fixture({ reward: 1000 });
  await Promise.all([
    rewardEmail.dispatch(sql, { orderId: f.order }),
    rewardEmail.dispatch(sql, { orderId: f.order }),
  ]);
  await bof.settle(sql, { id: f.order });
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(1);
  expect(requests[0].body.subject).toContain("$10.00");
});
it("does not send for unpaid or test orders", async () => {
  await fixture({ status: "pending" });
  await fixture({ test: true });
  expect(await rewardEmail.dispatch(sql)).toEqual({ sent: 0 });
  expect(requests).toHaveLength(0);
});
it("sends availability once only after shipment plus 14 days", async () => {
  const f = await fixture();
  await rewardEmail.dispatch(sql);
  await sql`UPDATE orders SET status='shipped' WHERE id=${f.order}::uuid`;
  await bof.sync(sql);
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(1);
  await sql`UPDATE bof_cash_entries SET available_at=now()-interval '1 minute' WHERE order_id=${f.order}::uuid`;
  await rewardEmail.dispatch(sql);
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(2);
  expect(requests[1].body.subject).toBe("Your $5.00 BOF Cash is ready to use");
  expect(requests[1].body.text).not.toContain("pending rewards");
});
it("refunds revoke eligibility before an unsent notification or availability notice", async () => {
  const f = await fixture();
  await bof.reverse(sql, f.order, 7950, 7950);
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(0);
});
it("retries transient failure with identical payload and key and cancels retries after refunds", async () => {
  const f = await fixture();
  fetch.mockImplementationOnce(async (url, options) => {
    requests.push({
      body: JSON.parse(options.body),
      key: new Headers(options.headers).get("idempotency-key"),
    });
    return new Response(
      JSON.stringify({
        name: "application_error",
        message: "Temporary",
        statusCode: 500,
      }),
      { status: 500 },
    );
  });
  await rewardEmail.dispatch(sql);
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(1);
  await sql`UPDATE bof_reward_email_sends SET last_attempt_at=now()-interval '6 minutes'`;
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  const f2 = await fixture();
  fetch.mockImplementationOnce(async () => {
    throw new Error("Timeout after send");
  });
  await rewardEmail.dispatch(sql);
  await bof.reverse(sql, f2.order, 100, 7950);
  await sql`UPDATE bof_reward_email_sends SET last_attempt_at=now()-interval '6 minutes' WHERE order_id=${f2.order}::uuid`;
  await rewardEmail.dispatch(sql);
  expect(
    (
      await sql`SELECT status FROM bof_reward_email_sends WHERE order_id=${f2.order}::uuid`
    )[0].status,
  ).toBe("cancelled");
});
it("does not repeat an ambiguous send after the provider deduplication window", async () => {
  await fixture();
  fetch.mockImplementationOnce(async () => {
    throw new Error("Timeout");
  });
  await rewardEmail.dispatch(sql);
  await sql`UPDATE bof_reward_email_sends SET first_attempt_at=now()-interval '25 hours',last_attempt_at=now()-interval '2 hours'`;
  await rewardEmail.dispatch(sql);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await sql`SELECT status FROM bof_reward_email_sends`)[0].status).toBe(
    "review",
  );
});
it("honors hard-bounce suppression while keeping transactional balance notices for marketing opt-outs", async () => {
  const blocked = await fixture(),
    optedOut = await fixture();
  await sql`INSERT INTO marketing_email_suppressions(normalized_email,reason,source) VALUES(${blocked.email},'hard_bounce','resend_webhook'),(${optedOut.email},'unsubscribe','footer_link')`;
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(1);
  expect(requests[0].body.to).toBe(optedOut.email);
});
it("blocks preview sends and survives provider/schema failures without breaking order processing", async () => {
  await fixture();
  vi.stubEnv("CONTEXT", "deploy-preview");
  expect((await rewardEmail.dispatch(sql)).inactive).toBe(true);
  expect(requests).toHaveLength(0);
  vi.stubEnv("CONTEXT", "production");
  expect(
    await rewardEmail.dispatchSafely(async () => {
      throw new Error("Database unavailable");
    }),
  ).toEqual({ sent: 0, error: true });
});
it("matured rewards recovered by maintenance get only a ready-to-use email", async () => {
  const f = await fixture();
  await sql`UPDATE bof_cash_entries SET available_at=now()-interval '1 day' WHERE order_id=${f.order}::uuid`;
  await rewardEmail.dispatch(sql);
  expect(requests).toHaveLength(1);
  expect(requests[0].body.subject).toContain("ready to use");
});
