import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE profiles(id uuid PRIMARY KEY,email varchar(255) UNIQUE,full_name varchar(255),username varchar(255),is_admin boolean DEFAULT false,email_verified boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),email text,status text,total_cents integer,is_test_order boolean DEFAULT false,payment_reconciliation_status text,checkout_idempotency_key text,paypal_capture_id text,paypal_order_id text,stripe_payment_intent_id text,created_at timestamptz DEFAULT now());`);
  await db.exec(await readFile(new URL("../../../migrations/045_bof_referral_program.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => db?.close());

async function newMember() {
  const id = randomUUID();
  await db.query("INSERT INTO profiles(id,email) VALUES($1,$2)", [id, `${id}@stripe-ledger.invalid`]);
  await db.query("INSERT INTO bof_members(user_id,code) VALUES($1,$2)", [id, randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()]);
  return id;
}
async function newOrder(status = "pending") {
  const id = randomUUID();
  await db.query("INSERT INTO orders(id,email,status,total_cents) VALUES($1,$2,$3,10000)", [id, `${id}@stripe-ledger.invalid`, status]);
  return id;
}
async function spend(member, cents = 1000) {
  const order = await newOrder();
  const quote = `BOFCASH-${randomUUID()}`;
  await db.query("INSERT INTO bof_quotes(code,member_id,cart_hash,amount_cents,expires_at) VALUES($1,$2,'fixture-cart',$3,now()+interval '1 hour')", [quote, member, cents]);
  await db.query("SELECT bof_reserve($1,$2,NULL,0,$3,$4,0,4000,10000,'{}',$5)", [order, `${order}@stripe-ledger.invalid`, member, cents, quote]);
  await db.query("UPDATE orders SET status='paid' WHERE id=$1", [order]);
  await db.query("SELECT bof_settle($1)", [order]);
  return order;
}
async function fixture() {
  const member = await newMember();
  const funding = await newOrder("paid");
  await db.query("INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at) VALUES($1,$2,$3,'reward',1000,now())", [member, funding, `seed:${funding}`]);
  const order = await spend(member);
  return { member, order };
}
async function revision(order) {
  return (await db.query("SELECT bof_stripe_refund_revision($1) AS revision", [order])).rows[0].revision;
}
async function reconcileSnapshot(order, cents, timestamp, expectedRevision, paid = 10000) {
  return (await db.query("SELECT bof_reconcile_stripe_refund($1,$2,$3,$4,$5) AS applied", [order, cents, paid, timestamp, expectedRevision])).rows[0].applied;
}
async function reconcile(order, cents, timestamp, paid = 10000) {
  return reconcileSnapshot(order, cents, timestamp, await revision(order), paid);
}
async function balance(member) {
  return Number((await db.query("SELECT coalesce(sum(amount_cents),0) AS cents FROM bof_cash_entries WHERE member_id=$1 AND available_at<=now()", [member])).rows[0].cents);
}
async function returned(order) {
  return (await db.query("SELECT amount_cents FROM bof_cash_entries WHERE order_id=$1 AND kind='redemption_refund' ORDER BY created_at,id", [order])).rows.map((r) => r.amount_cents);
}

describe("Stripe confirmed-refund cash reconciliation", () => {
  it("pending refunds return no BOF Cash; success, failure, and retry reconcile exact signed deltas", async () => {
    const { member, order } = await fixture();
    expect(await reconcile(order, 0, 100)).toBe(true);
    expect(await balance(member)).toBe(0);
    expect(await returned(order)).toEqual([]);
    await reconcile(order, 10000, 101);
    await reconcile(order, 10000, 101);
    expect(await balance(member)).toBe(1000);
    expect(await returned(order)).toEqual([1000]);
    await reconcile(order, 0, 102);
    expect(await balance(member)).toBe(0);
    await reconcile(order, 10000, 103);
    await reconcile(order, 10000, 103);
    expect(await balance(member)).toBe(1000);
    expect(await returned(order)).toEqual([1000, -1000, 1000]);
  });

  it("failed refunded credit already spent becomes a negative balance and cannot be spent twice", async () => {
    const { member, order } = await fixture();
    await reconcile(order, 10000, 200);
    await spend(member, 600);
    expect(await balance(member)).toBe(400);
    await reconcile(order, 0, 201);
    expect(await balance(member)).toBe(-600);
    await expect(spend(member, 1)).rejects.toThrow("BOF_BALANCE_CHANGED");
    await reconcile(order, 10000, 202);
    expect(await balance(member)).toBe(400);
  });

  it("ignores older events while allowing changed statuses within the same second", async () => {
    const { member, order } = await fixture();
    await reconcile(order, 10000, 300);
    await reconcile(order, 0, 301);
    expect(await reconcile(order, 10000, 300)).toBe(false);
    expect(await balance(member)).toBe(0);
    expect(await reconcile(order, 10000, 301)).toBe(true);
    expect(await balance(member)).toBe(1000);
    const state = (await db.query("SELECT event_created,confirmed_cents FROM bof_stripe_refund_state WHERE order_id=$1", [order])).rows[0];
    expect(Number(state.event_created)).toBe(301);
    expect(state.confirmed_cents).toBe(10000);
  });

  it("rounds proportional partial returns down and corrects later decreases", async () => {
    const { member, order } = await fixture();
    await reconcile(order, 3333, 400);
    expect(await balance(member)).toBe(333);
    await reconcile(order, 7500, 401);
    expect(await balance(member)).toBe(750);
    await reconcile(order, 5000, 402);
    expect(await balance(member)).toBe(500);
    expect(await returned(order)).toEqual([333, 417, -250]);
  });

  it("revokes a matured referral reward even while the cash refund is pending", async () => {
    const member = await newMember();
    const order = await newOrder("shipped");
    await db.query("INSERT INTO bof_order_benefits(order_id,buyer_email,referrer_id,reward_cents,contribution_cents,net_merchandise_cents,cost_snapshot,state,shipped_at) VALUES($1,$2,$3,1000,4000,10000,'{}','paid',now()-interval '15 days')", [order, `${order}@stripe-ledger.invalid`, member]);
    await db.query("SELECT bof_settle($1)", [order]);
    expect(await balance(member)).toBe(1000);
    await reconcile(order, 0, 500);
    await reconcile(order, 10000, 501);
    expect(await balance(member)).toBe(0);
    expect(await returned(order)).toEqual([]);
    expect((await db.query("SELECT count(*)::int AS count FROM bof_cash_entries WHERE order_id=$1 AND kind='reward_reversal'", [order])).rows[0].count).toBe(1);
  });


  it("rejects an interleaved stale success snapshot after a same-second failed refund", async () => {
    const { member, order } = await fixture();
    await reconcile(order, 10000, 600);
    // Both workers capture a revision before their independent Stripe reads.
    const staleSuccessRevision = await revision(order);
    const latestFailureRevision = await revision(order);
    expect(staleSuccessRevision).toBe(latestFailureRevision);
    await reconcileSnapshot(order, 0, 601, latestFailureRevision);
    expect(await balance(member)).toBe(0);
    await expect(reconcileSnapshot(order, 10000, 601, staleSuccessRevision)).rejects.toThrow("BOF_REFUND_SNAPSHOT_CHANGED");
    expect(await balance(member)).toBe(0);
    // A retry starts with a new revision and a fresh canonical failed snapshot.
    await reconcileSnapshot(order, 0, 601, await revision(order));
    expect(await balance(member)).toBe(0);
    expect(await returned(order)).toEqual([1000, -1000]);
  });

  it("advances revision for a no-op pending snapshot so a concurrent stale success cannot commit", async () => {
    const { member, order } = await fixture();
    const staleRevision = await revision(order);
    await reconcileSnapshot(order, 0, 700, await revision(order));
    expect(Number(await revision(order))).toBe(Number(staleRevision) + 1);
    await expect(reconcileSnapshot(order, 10000, 700, staleRevision)).rejects.toThrow("BOF_REFUND_SNAPSHOT_CHANGED");
    expect(await balance(member)).toBe(0);
    expect(await returned(order)).toEqual([]);
  });

  it("rejects callers that omit the pre-fetch revision", async () => {
    const { member, order } = await fixture();
    await expect(db.query("SELECT bof_reconcile_stripe_refund($1,10000,10000,800)", [order])).rejects.toThrow("BOF_REFUND_REVISION_REQUIRED");
    await expect(reconcileSnapshot(order, 10000, 800, null)).rejects.toThrow("BOF_REFUND_REVISION_REQUIRED");
    expect(await balance(member)).toBe(0);
  });

  it.each([[null, 10000, 1], [-1, 10000, 1], [10001, 10000, 1], [0, 0, 1], [0, null, 1], [0, 10000, -1], [0, 10000, null]])("rejects invalid confirmed/paid/event amounts without ledger changes: %j", async (confirmed, paid, timestamp) => {
    const { member, order } = await fixture();
    await expect(reconcile(order, confirmed, timestamp, paid)).rejects.toThrow("BOF_REFUND_AMOUNT_INVALID");
    expect(await balance(member)).toBe(0);
    expect(await returned(order)).toEqual([]);
    expect((await db.query("SELECT state FROM bof_order_benefits WHERE order_id=$1", [order])).rows[0].state).toBe("paid");
  });
});
