import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import events from "../_shared/bof-provider-events.cjs";
import bof from "../_shared/bof-service.cjs";
import { _test as webhook } from "../stripe-webhook.mjs";

let db;
const sql = async (strings, ...params) => (await db.query(strings.reduce((s, part, i) => s + (i ? `$${i}` : "") + part, ""), params)).rows;
const chargeId = "ch_refundtest";
let owner, order, charge, refunds, stripe;
const refund = (id, amount, status = "succeeded") => ({ id, charge: chargeId, amount, currency: "usd", status });
const event = (type = "charge.refunded", created = 100) => ({
  id: `evt_${type.replaceAll(".", "")}_${created}`, type, created,
  data: { object: type === "charge.refunded" ? { id: chargeId, amount_refunded: 7950 } : { id: "re_update", charge: chargeId } },
});
const returned = async () => Number((await sql`SELECT coalesce(sum(amount_cents),0)::integer AS cents FROM bof_cash_entries WHERE order_id=${order}::uuid AND kind='redemption_refund'`)[0].cents);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE profiles(id uuid PRIMARY KEY,email text UNIQUE,full_name text,username text,is_admin boolean DEFAULT false,email_verified boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),email text,status text,total_cents integer,is_test_order boolean DEFAULT false,payment_reconciliation_status text,checkout_idempotency_key text,paypal_capture_id text,paypal_order_id text,stripe_payment_intent_id text,created_at timestamptz DEFAULT now());`);
  await db.exec(await readFile(new URL("../../../migrations/045_bof_referral_program.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec("TRUNCATE profiles,orders CASCADE");
  owner = randomUUID(); order = randomUUID();
  await sql`INSERT INTO profiles(id,email) VALUES(${owner}::uuid,${owner + "@bof-test.invalid"})`;
  await sql`INSERT INTO bof_members(user_id,code) VALUES(${owner}::uuid,'ABCDEF123456')`;
  await sql`INSERT INTO orders(id,email,status,total_cents,stripe_payment_intent_id) VALUES(${order}::uuid,${order + "@bof-test.invalid"},'paid',7950,'pi_refundtest')`;
  await sql`INSERT INTO bof_order_benefits(order_id,buyer_email,wallet_member_id,wallet_cents,contribution_cents,net_merchandise_cents,cost_snapshot,state) VALUES(${order}::uuid,${order + "@bof-test.invalid"},${owner}::uuid,1000,2500,7500,'{}','paid')`;
  await sql`INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at) VALUES(${owner}::uuid,${order}::uuid,${"spend:" + order},'redemption',-1000,now())`;
  charge = { id: chargeId, payment_intent: "pi_refundtest", currency: "usd", amount: 7950, amount_refunded: 7950, refunded: true };
  refunds = [refund("re_first", 7950, "pending")];
  stripe = {
    charges: { retrieve: vi.fn(async () => charge) },
    refunds: { list: vi.fn(async () => ({ data: refunds, has_more: false })) },
  };
  vi.stubEnv("BOF_REFERRAL_ENABLED", "true");
});
afterEach(() => { webhook.resetFactories(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Stripe canonical refund status reconciliation", () => {
  it("does not restore BOF Cash for a pending refund even when Stripe marks the full charge refunded", async () => {
    await events.stripeAdjustment(sql, stripe, event());
    expect(await returned()).toBe(0);
    expect((await sql`SELECT state FROM bof_order_benefits WHERE order_id=${order}::uuid`)[0].state).toBe("reversed");
  });

  it("handles pending, succeeded, later failed, duplicate delivery and a new successful retry exactly", async () => {
    await events.stripeAdjustment(sql, stripe, event());
    refunds[0].status = "succeeded";
    await events.stripeAdjustment(sql, stripe, event("refund.updated", 200));
    await events.stripeAdjustment(sql, stripe, event("refund.updated", 200));
    expect(await returned()).toBe(1000);
    refunds[0].status = "failed"; charge.amount_refunded = 0;
    await events.stripeAdjustment(sql, stripe, event("refund.failed", 300));
    await events.stripeAdjustment(sql, stripe, event("refund.failed", 300));
    expect(await returned()).toBe(0);
    expect((await bof.wallet(sql, owner)).adjustmentCents).toBe(-1000);
    refunds.push(refund("re_retry", 7950));
    await events.stripeAdjustment(sql, stripe, event("refund.updated", 400));
    expect(await returned()).toBe(1000);
    expect((await sql`SELECT amount_cents FROM bof_cash_entries WHERE order_id=${order}::uuid AND kind='redemption_refund' ORDER BY created_at,id`).map(r => r.amount_cents).sort((a,b) => a-b)).toEqual([-1000,1000,1000]);
  });

  it("sums succeeded partial refunds only and reconciles their proportional failure", async () => {
    refunds = [refund("re_first", 3975), refund("re_second", 3975, "pending")];
    await events.stripeAdjustment(sql, stripe, event());
    expect(await returned()).toBe(500);
    refunds[1].status = "succeeded";
    await events.stripeAdjustment(sql, stripe, event("refund.updated", 200));
    expect(await returned()).toBe(1000);
    refunds[0].status = "failed";
    await events.stripeAdjustment(sql, stripe, event("refund.failed", 300));
    expect(await returned()).toBe(500);
  });

  it("does not let an older event with a stale provider read overwrite a newer failed-refund result", async () => {
    refunds[0].status = "succeeded";
    await events.stripeAdjustment(sql, stripe, event("refund.updated", 200));
    refunds[0].status = "failed";
    await events.stripeAdjustment(sql, stripe, event("refund.failed", 300));
    refunds[0].status = "succeeded";
    await events.stripeAdjustment(sql, stripe, event("refund.updated", 200));
    expect(await returned()).toBe(0);
  });

  it("accepts a canonical status change within the same event timestamp second", async () => {
    refunds[0].status = "succeeded";
    await events.stripeAdjustment(sql, stripe, event("refund.updated", 200));
    refunds[0].status = "failed";
    await events.stripeAdjustment(sql, stripe, event("refund.failed", 200));
    expect(await returned()).toBe(0);
  });

  it("refetches canonical state when a same-second failure wins a race with an older successful snapshot", async () => {
    refunds[0].status = "succeeded";
    let pause, observed;
    const blocked = new Promise(resolve => { pause = resolve; });
    const snapshotRead = new Promise(resolve => { observed = resolve; });
    let first = true;
    const delayedSql = async (strings, ...params) => {
      if (first && strings.join("").includes("bof_reconcile_stripe_refund")) {
        first = false;
        expect(params[1]).toBe(7950);
        observed();
        await blocked;
      }
      return sql(strings, ...params);
    };
    const older = events.stripeAdjustment(delayedSql, stripe, event("refund.updated", 200));
    await snapshotRead;
    refunds = [refund("re_first", 7950, "failed")];
    await events.stripeAdjustment(sql, stripe, event("refund.failed", 200));
    pause();
    await older;
    expect(stripe.refunds.list).toHaveBeenCalledTimes(3);
    expect(await returned()).toBe(0);
    expect((await sql`SELECT count(*)::integer AS n FROM bof_cash_entries WHERE order_id=${order}::uuid AND kind='redemption_refund'`)[0].n).toBe(0);
  });

  it("paginates the complete canonical refund collection", async () => {
    const first = Array.from({ length: 100 }, (_, i) => refund(`re_${i}`, 50));
    stripe.refunds.list.mockImplementation(async ({ starting_after }) => starting_after
      ? { data: [refund("re_100", 50)], has_more: false }
      : { data: first, has_more: true });
    await events.stripeAdjustment(sql, stripe, event());
    expect(stripe.refunds.list).toHaveBeenNthCalledWith(2, { charge: chargeId, limit: 100, starting_after: "re_99" });
    expect(await returned()).toBe(635);
  });

  it.each([
    ["wrong charge", refund("re_wrong", 7950), { charge: "ch_other" }],
    ["wrong currency", refund("re_wrong", 7950), { currency: "eur" }],
    ["fractional amount", refund("re_wrong", 7950), { amount: 7950.5 }],
    ["negative amount", refund("re_wrong", 7950), { amount: -1 }],
    ["excessive amount", refund("re_wrong", 7950), { amount: 7951 }],
  ])("fails closed for a canonical refund with %s", async (_name, base, changes) => {
    refunds = [{ ...base, ...changes }];
    await expect(events.stripeAdjustment(sql, stripe, event())).rejects.toThrow(/BOF_REFUND_/);
    expect(await returned()).toBe(0);
  });

  it("refuses a repeated pagination cursor without restoring any credit", async () => {
    stripe.refunds.list.mockResolvedValue({ data: [refund("re_repeated", 3975)], has_more: true });
    await expect(events.stripeAdjustment(sql, stripe, event())).rejects.toThrow("BOF_REFUND_PAGINATION_INVALID");
    expect(await returned()).toBe(0);
  });

  it("preserves dispute handling without treating a dispute as a successful cash refund", async () => {
    await events.stripeAdjustment(sql, stripe, event("charge.dispute.created"));
    expect(stripe.refunds.list).not.toHaveBeenCalled();
    expect(await returned()).toBe(0);
  });

  it.each(["refund.updated", "refund.failed"])("routes signed %s webhooks into canonical refund reconciliation", async type => {
    Object.entries({ CONTEXT:"deploy-preview", STRIPE_MODE:"test", STRIPE_PUBLISHABLE_KEY:"pk_test_unit", STRIPE_SECRET_KEY:"sk_test_unit", STRIPE_WEBHOOK_SECRET:"whsec_isolated_unit", DATABASE_URL:"postgresql://unit.invalid/test", AUTH_SESSION_SECRET:"unit-secret", INTERNAL_JOB_SECRET:"unit-secret" }).forEach(([key, value]) => vi.stubEnv(key,value));
    const sdk = new Stripe("sk_test_unit");
    stripe.webhooks = sdk.webhooks;
    webhook.setNeonFactory(() => sql);
    webhook.setStripeFactory(() => stripe);
    const payload = JSON.stringify(event(type));
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret:"whsec_isolated_unit" });
    const response = await webhook.handler({ httpMethod:"POST", headers:{ host:"deploy-preview-1--bof.netlify.app", "stripe-signature":signature }, body:payload });
    expect(response.statusCode).toBe(200);
    expect(stripe.refunds.list).toHaveBeenCalledTimes(1);
    expect(await returned()).toBe(0);
  });

  it("requests webhook retry after bounded revision conflicts without acknowledging stale credit", async () => {
    Object.entries({ CONTEXT:"deploy-preview", STRIPE_MODE:"test", STRIPE_PUBLISHABLE_KEY:"pk_test_unit", STRIPE_SECRET_KEY:"sk_test_unit", STRIPE_WEBHOOK_SECRET:"whsec_isolated_unit", DATABASE_URL:"postgresql://unit.invalid/test", AUTH_SESSION_SECRET:"unit-secret", INTERNAL_JOB_SECRET:"unit-secret" }).forEach(([key, value]) => vi.stubEnv(key,value));
    const sdk = new Stripe("sk_test_unit"); stripe.webhooks = sdk.webhooks;
    const busySql = async (strings, ...params) => {
      if (strings.join("").includes("bof_reconcile_stripe_refund")) throw new Error("BOF_REFUND_SNAPSHOT_CHANGED");
      return sql(strings, ...params);
    };
    webhook.setNeonFactory(() => busySql); webhook.setStripeFactory(() => stripe);
    const payload = JSON.stringify(event("refund.updated"));
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret:"whsec_isolated_unit" });
    vi.spyOn(console,"error").mockImplementation(() => {});
    const response = await webhook.handler({ httpMethod:"POST", headers:{ host:"deploy-preview-1--bof.netlify.app", "stripe-signature":signature }, body:payload });
    expect(response.statusCode).toBe(503);
    expect(stripe.refunds.list).toHaveBeenCalledTimes(3);
    expect(await returned()).toBe(0);
  });
});
