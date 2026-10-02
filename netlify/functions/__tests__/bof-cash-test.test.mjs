import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash, createHmac, randomUUID } from "node:crypto";
const stub = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: (...args) => { stub.connect(...args); return stub.query; } }));
import handler, { testConfiguration, signTestSession, verifyTestSession } from "../bof-cash-test.mjs";
const TESTER = "b.schaefermarketer@outlook.com", BRANCH = "br-delicate-boat-ae77mvtt";
const SECRET = "isolated-test-secret-at-least-32-characters";
const envKeys = ["DATABASE_URL", "NETLIFY_DATABASE_URL", "BOF_TEST_DATABASE_URL", "BOF_TEST_BRANCH_ID", "BOF_TEST_SESSION_SECRET", "BOF_TEST_PUBLIC_SITE_URL", "AUTH_SESSION_SECRET", "CLOUDINARY_API_SECRET"];
let savedEnv, db, branch = BRANCH;
const request = (action, input = {}, token = "", options = {}) => new Request(`https://bannersonthefly.com/.netlify/functions/bof-cash-test?action=${action}`, {
  method: "POST", headers: { "Content-Type": "application/json", origin: "https://bannersonthefly.com", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input), ...options,
});
const call = async (...args) => { const response = await handler(request(...args)); return { status: response.status, data: await response.json() }; };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const invitation = async (email = TESTER) => {
  const raw = `${randomUUID()}.${"a".repeat(64)}`;
  await db.query("INSERT INTO bof_invitations(id,email,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [raw.split(".")[0],email,hash(raw)]);
  return raw;
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE profiles(id uuid PRIMARY KEY,email text UNIQUE,full_name text,username text,is_admin boolean DEFAULT false,email_verified boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),email text,status text,subtotal_cents integer NOT NULL,tax_cents integer NOT NULL,total_cents integer NOT NULL,is_test_order boolean DEFAULT false,payment_reconciliation_status text,checkout_idempotency_key text,paypal_capture_id text,paypal_order_id text,stripe_payment_intent_id text,created_at timestamptz DEFAULT now());`);
  await db.exec(await readFile(new URL("../../../migrations/045_bof_referral_program.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, { DATABASE_URL: "postgres://role:secret@ep-production.test/db", BOF_TEST_DATABASE_URL: "postgres://role:secret@ep-test.test/db", BOF_TEST_BRANCH_ID: BRANCH, BOF_TEST_SESSION_SECRET: SECRET });
  branch = BRANCH;
  stub.connect.mockReset();
  stub.query.mockReset().mockImplementation(async (strings, ...values) => {
    const query = strings.reduce((s, part, i) => s + part + (i < values.length ? `$${i+1}` : ""), "");
    if (query.includes("current_setting('neon.branch_id'")) return [{ branch_id: branch }];
    return (await db.query(query, values)).rows;
  });
  await db.exec("TRUNCATE profiles,orders,bof_members,bof_invitations,bof_quotes,bof_order_benefits,bof_cash_entries CASCADE");
  await db.query("INSERT INTO orders(id,email,status,subtotal_cents,tax_cents,total_cents) VALUES($1,$2,'delivered',7500,450,7950)", [randomUUID(),TESTER]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
  vi.restoreAllMocks();
});

describe("isolated owner BOF test", () => {
  it("runs real claim, guest-order linking, referral ledger, maturity and redemption without changing another account", async () => {
    const outsider = randomUUID();
    await db.query("INSERT INTO orders(id,email,status,subtotal_cents,tax_cents,total_cents) VALUES($1,'other@example.test','paid',7500,450,7950)",[outsider]);
    const claim = await call("claim", { token: await invitation() });
    expect(claim.status).toBe(200);
    const token = claim.data.sessionToken;
    const initial = await call("wallet", {}, token);
    expect(initial.data).toMatchObject({ isolatedTest: true, availableCents: 0, pendingCents: 0, email: TESTER });
    expect(initial.data.pastOrders).toHaveLength(1);
    expect((await db.query("SELECT user_id FROM orders WHERE id=$1",[outsider])).rows[0].user_id).toBeNull();
    const ref = { idempotencyKey: randomUUID(), referralCode: initial.data.code };
    const referred = await call("refer", ref, token);
    expect(referred.status).toBe(200);
    expect(referred.data.pendingCents).toBe(1000);
    expect(referred.data.availableCents).toBe(0);
    expect(referred.data.simulatedOrder.discountCents).toBe(2500);
    expect(referred.data.entries[0].kind).toBe("reward");
    const replay = await call("refer", ref, token);
    expect(replay.data.pendingCents).toBe(1000);
    expect(replay.data.entries).toHaveLength(1);
    const matured = await call("mature", {}, token);
    expect(matured.data.pendingCents).toBe(0);
    expect(matured.data.availableCents).toBe(1000);
    const redemption = { idempotencyKey: randomUUID() };
    const redeemed = await call("redeem", redemption, token);
    expect(redeemed.status).toBe(200);
    expect(redeemed.data.availableCents).toBe(0);
    expect(redeemed.data.entries.filter(entry => entry.kind === "redemption")).toHaveLength(1);
    expect(redeemed.data.message).toContain("No payment was made");
    const replaySpend = await call("redeem", redemption, token);
    expect(replaySpend.status).toBe(200);
    expect(replaySpend.data.availableCents).toBe(0);
    expect(replaySpend.data.entries.filter(entry => entry.kind === "redemption")).toHaveLength(1);
    expect(stub.connect.mock.calls.every(args => args[0] === process.env.BOF_TEST_DATABASE_URL)).toBe(true);
  });

  it("rejects production database aliases, shared secrets, missing configuration and unexpected actual branches", async () => {
    expect(() => testConfiguration({ ...process.env, BOF_TEST_DATABASE_URL: "postgres://different:password@ep-production-pooler.test/db" })).toThrow("not available");
    expect(() => testConfiguration({ ...process.env, AUTH_SESSION_SECRET: SECRET })).toThrow("not available");
    expect(() => testConfiguration({ ...process.env, BOF_TEST_BRANCH_ID: "different-branch" })).toThrow("not available");
    branch = "production-branch";
    const result = await call("claim", { token: await invitation() });
    expect(result.status).toBe(503);
    expect(stub.query).toHaveBeenCalledTimes(1);
    expect((await db.query("SELECT claimed_at FROM bof_invitations")).rows[0].claimed_at).toBeNull();
  });

  it("refuses GET claims, unsigned mutations, cross-origin posts and other invitees", async () => {
    const get = await handler(new Request("https://bannersonthefly.com/.netlify/functions/bof-cash-test?action=claim"));
    expect(get.status).toBe(405);
    expect(stub.connect).not.toHaveBeenCalled();
    expect((await call("mature")).status).toBe(401);
    expect((await call("claim", { token: await invitation("another@example.test") })).status).toBe(410);
    const cross = await handler(request("claim", {}, "", { headers: { origin: "https://evil.example" } }));
    expect(cross.status).toBe(403);
  });

  it("uses test-only signed sessions and rejects tampering, ordinary sessions and wrong audiences", () => {
    const token = signTestSession({ id: randomUUID() }, SECRET);
    expect(verifyTestSession(token, SECRET).email).toBe(TESTER);
    expect(verifyTestSession(token + "x", SECRET)).toBeNull();
    expect(verifyTestSession(token, "ordinary-production-secret")).toBeNull();
    const payload = Buffer.from(JSON.stringify({ sub:randomUUID(),email:TESTER,exp:Date.now()/1000+1000,aud:"ordinary-account",branch:BRANCH })).toString("base64url");
    expect(verifyTestSession(`${payload}.${createHmac("sha256",SECRET).update(payload).digest("base64url")}`,SECRET)).toBeNull();
  });

  it("does not permit a test referral without the authenticated owner's actual code", async () => {
    const claim = await call("claim", { token: await invitation() });
    const result = await call("refer", { idempotencyKey: randomUUID(), referralCode: "BOFREF-000000000000" },claim.data.sessionToken);
    expect(result.status).toBe(400);
    expect((await db.query("SELECT count(*)::integer AS n FROM bof_cash_entries")).rows[0].n).toBe(0);
  });

  it("serves an honest public test share card without ordinary referral storage, account data or live checkout", async () => {
    const claim = await call("claim", { token: await invitation() });
    const { data } = await call("wallet", {}, claim.data.sessionToken);
    const response = await handler(new Request(`https://bannersonthefly.com/.netlify/functions/bof-cash-test?action=share&code=${data.code}`));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("ISOLATED TEST — NO LIVE DISCOUNT OR FUNDS");
    expect(html).toContain(`/bof-cash-test?ref=${data.code}#testing`);
    expect(html).not.toContain(TESTER);
    expect(html).not.toContain("bof_referral_v1");
    expect(html).not.toContain("/checkout");
    expect(html).not.toContain(claim.data.sessionToken);
  });

  it("supports only the configured test preview origin and strips injected public code text", async () => {
    process.env.BOF_TEST_PUBLIC_SITE_URL = "https://deploy-preview-553--bannersonthefly.netlify.app";
    expect(testConfiguration().origin).toBe(process.env.BOF_TEST_PUBLIC_SITE_URL);
    expect(() => testConfiguration({ ...process.env, BOF_TEST_PUBLIC_SITE_URL:"https://bannersonthefly.com.evil.example" })).toThrow();
    const invalid = await handler(new Request("https://bannersonthefly.com/.netlify/functions/bof-cash-test?action=share&code=%22%3E%3Cscript%3E"));
    expect(invalid.status).toBe(404);
    expect(await invalid.text()).not.toContain("<script>");
  });
});
