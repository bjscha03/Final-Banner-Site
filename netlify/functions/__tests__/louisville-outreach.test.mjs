import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import outreach from "../_shared/louisville-outreach.cjs";
import validation from "../_shared/discount-validation.cjs";
import totals from "../_shared/checkoutTotals.cjs";
import { handler as admin } from "../admin-louisville-outreach.mjs";
import { handler as coupon } from "../louisville-coupon.mjs";
import auth from "../_shared/server-auth.cjs";
let db;
const sql = async (strings, ...values) => {
  if (typeof strings === "string")
    return (await db.query(strings, values[0] || [])).rows;
  const query = strings.reduce((all, s, i) => all + (i ? `$${i}` : "") + s, "");
  if (query.includes("CREATE EXTENSION")) return [];
  return (await db.query(query, values)).rows;
};
before(async () => {
  process.env.AUTH_SESSION_SECRET = "local-unit-test-secret";
  db = new PGlite();
  await db.exec(`CREATE TABLE discount_codes (
    id UUID DEFAULT gen_random_uuid(),code TEXT UNIQUE,email TEXT,discount_percentage INTEGER,
    discount_amount_cents INTEGER,single_use BOOLEAN,used BOOLEAN,expires_at TIMESTAMPTZ,
    status TEXT,issued_at TIMESTAMPTZ,campaign TEXT,max_uses_per_customer INTEGER,max_total_uses INTEGER,
    created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,used_by_user_id UUID,used_by_email TEXT[],cart_id UUID,order_id UUID
  ); CREATE TABLE orders(id UUID,email TEXT,status TEXT,is_test_order BOOLEAN,checkout_idempotency_key TEXT);
  CREATE TABLE abandoned_carts(id UUID,recovery_status TEXT);`);
  await outreach.ensureSchema(sql);
});
after(async () => {
  await db.close();
});
test("imports quoted CSV, spreadsheet TSV, optional names, and removes duplicates without guessing invalid emails", () => {
  const result = outreach.parseContacts(
    'Email,First Name,Last Name,Company\r\nbob@example.invalid,Bob,Smith,"Acme, Inc."\r\nBOB@example.invalid,Bob,,Acme\r\nbad-address,No,Name,Bad',
  );
  assert.deepEqual(result.contacts, [
    { email: "bob@example.invalid", name: "Bob Smith", company: "Acme, Inc." },
  ]);
  assert.equal(result.duplicates, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(
    outreach.parseContacts(
      "email\tname\tcompany\nx@example.invalid\tAlex\tLocal Co",
    ).contacts[0].name,
    "Alex",
  );
  assert.equal(
    outreach.parseContacts("x@example.invalid\ny@example.invalid").contacts
      .length,
    2,
  );
  assert.equal(
    outreach.parseContacts('Email,Name\nx@example.invalid,"Unclosed').contacts
      .length,
    0,
  );
});
test("atomic imports create one email-bound coupon per recipient, and repeat imports keep the same payload", async () => {
  const rows = [
    { email: "bob@example.invalid", name: "Bob", company: "Local Co" },
  ];
  assert.deepEqual(await outreach.importContacts(sql, rows, { sub: "admin" }), {
    imported: 1,
    existing: 0,
  });
  assert.deepEqual(
    await outreach.importContacts(sql, [{ ...rows[0], name: "Changed" }], {
      sub: "admin",
    }),
    { imported: 0, existing: 1 },
  );
  const lead = (await sql`SELECT * FROM louisville_outreach_contacts`)[0];
  assert.equal(lead.name, "Bob");
  assert.match(lead.discount_code, outreach.CODE_PATTERN);
  const good = await validation.validateDiscountForCheckout({
    sql,
    code: lead.discount_code,
    email: lead.email,
  });
  assert.equal(good.valid, true);
  assert.equal(good.discount.discountScope, "banner_lines");
  assert.equal(good.discount.discountPercentage, 25);
  assert.equal(
    (
      await validation.validateDiscountForCheckout({
        sql,
        code: lead.discount_code,
        email: "wrong@example.invalid",
      })
    ).valid,
    false,
  );
  const row = (await sql`SELECT * FROM discount_codes`)[0];
  assert.equal(row.single_use, true);
  assert.equal(row.max_total_uses, 1);
  assert.equal(row.expires_at, null);
  await sql`UPDATE discount_codes SET used=TRUE WHERE code=${lead.discount_code}`;
  assert.equal(
    (
      await validation.validateDiscountForCheckout({
        sql,
        code: lead.discount_code,
        email: lead.email,
      })
    ).valid,
    false,
  );
});
test("25% applies to banners only and never stacks with quantity discounts or reduces shipping/tax directly", () => {
  const discount = {
    code: "LOU25-AAAAAAAAAAAAAAAAAAAA",
    campaign: outreach.CAMPAIGN,
    discountScope: "banner_lines",
    discountPercentage: 25,
  };
  const result = totals.computeTotals(
    [
      { product_type: "banner", quantity: 5, line_total_cents: 10000 },
      { product_type: "car_magnet", quantity: 1, line_total_cents: 8000 },
      { product_type: "yard_sign", quantity: 1, line_total_cents: 2000 },
    ],
    0.06,
    { freeShipping: true },
    discount,
  );
  assert.equal(result.applied_discount_cents, 2500);
  assert.equal(result.total_cents, 18550);
  assert.equal(result.applied_discount_type, "promo");
  assert.equal(
    totals.computeTotals(
      [{ product_type: "car_magnet", line_total_cents: 8000 }],
      0.06,
      { freeShipping: true },
      discount,
    ).applied_discount_cents,
    0,
  );
});
test("personalization escapes HTML and header newlines; email links use a copy page and real Wallet endpoint", () => {
  const content = outreach.emailContent(
    {
      name: "Bob\r\nBcc:bad",
      company: "<script>alert(1)</script>",
      discount_code: "LOU25-AAAAAAAAAAAAAAAAAAAA",
    },
    "https://bannersonthefly.com/unsubscribe",
  );
  assert.ok(content.subject.startsWith("Hey Bob,"));
  assert.ok(!/[\r\n]/.test(content.subject));
  assert.ok(!content.html.includes("<script>"));
  assert.match(content.html, /&lt;script&gt;/);
  assert.match(content.html, /louisville-offer\?code=/);
  assert.match(content.html, /louisville-coupon\?action=wallet/);
  assert.match(content.text, /after production/);
  assert.ok(!outreach.emailContent().subject.includes("undefined"));
});
test("sending respects suppression and duplicate protection, and only reports provider-confirmed success", async () => {
  await outreach.importContacts(
    sql,
    [
      { email: "send@example.invalid", name: "Send" },
      { email: "blocked@example.invalid", name: "Blocked" },
    ],
    {},
  );
  const lead = (
    await sql`SELECT * FROM louisville_outreach_contacts WHERE email='send@example.invalid'`
  )[0];
  let calls = 0;
  let payload;
  const sender = async (value) => {
    calls++;
    payload = value;
    return { data: { id: "test-provider-id" } };
  };
  assert.equal(
    (await outreach.sendInvitation(sql, lead, {}, sender)).status,
    "sent",
  );
  assert.equal(
    (await outreach.sendInvitation(sql, lead, {}, sender)).status,
    "skipped",
  );
  assert.equal(calls, 1);
  assert.equal(
    payload.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  await sql`INSERT INTO marketing_email_suppressions(normalized_email,reason,source) VALUES('blocked@example.invalid','unsubscribe','admin')`;
  const blocked = (
    await sql`SELECT * FROM louisville_outreach_contacts WHERE email='blocked@example.invalid'`
  )[0];
  assert.equal(
    (await outreach.sendInvitation(sql, blocked, {}, sender)).status,
    "suppressed",
  );
  assert.equal(calls, 1);
});
test("a failed send retries with the same payload/key, then stops outside provider idempotency retention", async () => {
  await outreach.importContacts(
    sql,
    [{ email: "retry@example.invalid", name: "Retry" }],
    {},
  );
  const lead = (
    await sql`SELECT * FROM louisville_outreach_contacts WHERE email='retry@example.invalid'`
  )[0];
  const attempts = [];
  const sender = async (payload, key) => {
    attempts.push({ payload, key });
    return { error: { message: "outage" } };
  };
  assert.equal(
    (await outreach.sendInvitation(sql, lead, {}, sender)).status,
    "error",
  );
  await sql`UPDATE marketing_email_sends SET last_attempt_at=now()-interval '6 minutes' WHERE normalized_email=${lead.email}`;
  assert.equal(
    (await outreach.sendInvitation(sql, lead, {}, sender)).status,
    "error",
  );
  assert.deepEqual(attempts[0], attempts[1]);
  await sql`UPDATE marketing_email_sends SET last_attempt_at=now()-interval '6 minutes',created_at=now()-interval '25 hours' WHERE normalized_email=${lead.email}`;
  assert.equal(
    (await outreach.sendInvitation(sql, lead, {}, sender)).status,
    "skipped",
  );
  assert.equal(attempts.length, 2);
});
test("admin endpoints reject unauthenticated, cross-origin and preview mutations before storage/provider access", async () => {
  assert.equal(
    (await admin({ httpMethod: "GET", headers: {} })).statusCode,
    401,
  );
  const token = auth.createSessionToken({ id: "test-admin", is_admin: true });
  const event = {
    httpMethod: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      host: "bannersonthefly.com",
      origin: "https://evil.example",
    },
    queryStringParameters: { action: "send" },
    body: "{}",
  };
  assert.equal((await admin(event)).statusCode, 403);
  const preview = {
    ...event,
    headers: {
      authorization: `Bearer ${token}`,
      host: "deploy-preview-999--bannersonthefly.netlify.app",
    },
    queryStringParameters: { action: "import" },
  };
  assert.equal((await admin(preview)).statusCode, 409);
  assert.equal(
    (
      await coupon({
        httpMethod: "GET",
        queryStringParameters: { code: "guess" },
      })
    ).statusCode,
    404,
  );
});
