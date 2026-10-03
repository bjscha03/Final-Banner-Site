import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import {
  evaluateCart,
  cartHash,
  canonicalCart,
} from "../_shared/bof-policy.mjs";
import members from "../_shared/bof-membership.cjs";
import service from "../_shared/bof-service.cjs";
import email from "../_shared/bof-email.cjs";
import providerEvents from "../_shared/bof-provider-events.cjs";

const banner = (width = 60, height = 24, quantity = 1) => ({
  id: "banner",
  product_type: "banner",
  width_in: width,
  height_in: height,
  material: "13oz",
  quantity,
});
const magnet = (quantity = 1) => ({
  id: "magnet",
  product_type: "car_magnet",
  width_in: 24,
  height_in: 18,
  quantity,
});
let db;
const sql = async (strings, ...values) => {
  let query;
  if (typeof strings === "string")
    return (await db.query(strings, values[0] || [])).rows;
  query = strings.reduce(
    (s, part, i) => s + part + (i < values.length ? `$${i + 1}` : ""),
    "",
  );
  return (await db.query(query, values)).rows;
};
const newPerson = async (emailAddress) => {
  const id = randomUUID();
  await db.query("INSERT INTO profiles(id,email) VALUES($1,$2)", [
    id,
    emailAddress || id + "@customer.com",
  ]);
  await db.query("INSERT INTO bof_members(user_id,code) VALUES($1,$2)", [
    id,
    randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
  ]);
  return id;
};
const newOrder = async (emailAddress, status = "pending") => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO orders(id,email,status,total_cents) VALUES($1,$2,$3,7950)",
    [id, emailAddress || id + "@customer.com", status],
  );
  return id;
};
const reserve = async ({
  order,
  emailAddress,
  referrer = null,
  reward = 0,
  member = null,
  cash = 0,
  quote = null,
}) =>
  db.query("SELECT bof_reserve($1,$2,$3,$4,$5,$6,0,2500,7500,$7,$8)", [
    order,
    emailAddress,
    referrer,
    reward,
    member,
    cash,
    JSON.stringify({ version: "test" }),
    quote,
  ]);
const seed = async (member, cents) => {
  const order = await newOrder(null, "paid");
  await db.query(
    "INSERT INTO bof_order_benefits(order_id,buyer_email,contribution_cents,net_merchandise_cents,cost_snapshot,state,shipped_at) VALUES($1,$2,2500,7500,'{}','paid',now()-interval '15 days')",
    [order, `${order}@customer.com`],
  );
  await db.query(
    "INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at) VALUES($1,$2,$3,'reward',$4,now())",
    [member, order, "seed:" + order, cents],
  );
  return order;
};
const quote = async (member, amount, hash = "cart") => {
  const code = "BOFCASH-" + randomUUID().replaceAll("-", "").toUpperCase();
  await db.query(
    "INSERT INTO bof_quotes(code,member_id,cart_hash,amount_cents,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')",
    [code, member, hash, amount],
  );
  return code;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE profiles(id uuid PRIMARY KEY,email varchar(255) UNIQUE,full_name varchar(255),username varchar(255),is_admin boolean DEFAULT false,email_verified boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz);
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
}, 30000);
afterAll(async () => {
  delete process.env.BOF_REFERRAL_ENABLED;
  await db?.close();
});

describe("Provider-confirmed refund adapters", () => {
  const paidWalletOrder = async () => {
    const member = await newPerson();
    await seed(member, 1000);
    const order = await newOrder();
    await reserve({
      order,
      emailAddress: `${order}@customer.com`,
      member,
      cash: 1000,
      quote: await quote(member, 1000),
    });
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [order]);
    return { member, order };
  };
  it("uses Stripe's canonical cumulative refund and credits duplicates only once", async () => {
    const { member, order } = await paidWalletOrder();
    await db.query(
      "UPDATE orders SET stripe_payment_intent_id=$1 WHERE id=$2",
      [`pi_${order}`, order],
    );
    const charge = {
      id: "ch_test",
      payment_intent: `pi_${order}`,
      currency: "usd",
      amount: 7950,
      amount_refunded: 3975,
    };
    const retrieve = vi.fn(async () => charge);
    const stripe = { charges: { retrieve }, refunds: { list: async () => ({ data: [{ id: "re_test", charge: charge.id, currency: "usd", amount: charge.amount_refunded, status: "succeeded" }], has_more: false }) } };
    const event = {
      type: "charge.refunded",
      data: { object: { id: "ch_test", amount_refunded: 7950 } },
    };
    await providerEvents.stripeAdjustment(sql, stripe, event);
    await providerEvents.stripeAdjustment(sql, stripe, event);
    expect((await service.wallet(sql, member)).availableCents).toBe(500);
    expect(retrieve).toHaveBeenCalledWith("ch_test");
    charge.amount = 8000;
    await expect(
      providerEvents.stripeAdjustment(sql, stripe, event),
    ).rejects.toThrow("BOF_REFUND_BINDING_MISMATCH");
    expect((await service.wallet(sql, member)).availableCents).toBe(500);
    charge.amount = 7950;
    charge.amount_refunded = 7950;
    await providerEvents.stripeAdjustment(sql, stripe, event);
    expect((await service.wallet(sql, member)).availableCents).toBe(1000);
  });
  it("sums distinct verified PayPal partial refunds and ignores duplicate delivery", async () => {
    const { member, order } = await paidWalletOrder();
    const captureId = order.replaceAll("-", "");
    await db.query("UPDATE orders SET paypal_capture_id=$1 WHERE id=$2", [
      captureId,
      order,
    ]);
    const requests = [];
    vi.stubGlobal("fetch", async (url) => {
      requests.push(url);
      const id = String(url).split("/").at(-1);
      const data = String(url).includes("/refunds/")
        ? {
            id,
            status: "COMPLETED",
            amount: { currency_code: "USD", value: "39.75" },
            links: [
              {
                rel: "up",
                href: `https://api-m.paypal.com/v2/payments/captures/${captureId}`,
              },
            ],
          }
        : { id: captureId, amount: { currency_code: "USD", value: "79.50" } };
      return { ok: true, json: async () => data };
    });
    try {
      const access = async () => ({
        accessToken: "test-only",
        baseUrl: "https://api-m.sandbox.paypal.com",
      });
      const first = {
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: { id: "REFUNDTEST1" },
      };
      await providerEvents.paypalAdjustment(sql, first, access);
      await providerEvents.paypalAdjustment(sql, first, access);
      expect((await service.wallet(sql, member)).availableCents).toBe(500);
      await providerEvents.paypalAdjustment(
        sql,
        { ...first, resource: { id: "REFUNDTEST2" } },
        access,
      );
      expect((await service.wallet(sql, member)).availableCents).toBe(1000);
      expect(
        requests.every((url) =>
          url.startsWith("https://api-m.sandbox.paypal.com/"),
        ),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Financial rules use authoritative prices and supplier costs", () => {
  it("ignores browser prices and computes $5 reward, 25% offer, and fee/risk buffers", () => {
    const r = evaluateCart([{ ...banner(), line_total_cents: 1 }]);
    expect(r.grossCents).toBe(5000);
    expect(r.discountCents).toBe(1250);
    expect(r.rewardCents).toBe(500);
    expect(r.productionCents).toBe(1250);
    expect(r.supplierShippingCents).toBe(1000);
    expect(r.contributionCents).toBe(676);
    expect(r.eligible).toBe(true);
  });
  it("caps friend savings at $25 and rewards at $10", () => {
    const r = evaluateCart([banner(120, 48)]);
    expect(r.discountCents).toBe(2500);
    expect(r.rewardCents).toBe(1000);
    expect(r.contributionCents).toBeGreaterThanOrEqual(
      Math.max(500, Math.ceil(r.netCents * 0.15)),
    );
  });
  it("requires $75 in a magnet cart and gives magnets 10%", () => {
    expect(evaluateCart([magnet()]).eligible).toBe(false);
    const r = evaluateCart([magnet(2)]);
    expect(r.eligibleCents).toBe(9400);
    expect(r.discountCents).toBe(940);
    expect(r.rewardCents).toBe(500);
  });
  it("uses product-specific wallet caps for mixed carts", () => {
    const r = evaluateCart([banner(), magnet(2)], {
      kind: "wallet",
      balanceCents: 99999,
    });
    expect(r.capCents).toBe(1250 + 1410);
    expect(r.discountCents).toBe(2660);
  });
  it("rejects unknown supplier costs instead of assuming free production", () => {
    expect(
      evaluateCart([{ ...banner(), material: "18oz_double" }]).eligible,
    ).toBe(false);
    expect(
      evaluateCart([
        {
          id: "sign",
          product_type: "yard_sign",
          width_in: 24,
          height_in: 18,
          quantity: 10,
          yard_sign_sidedness: "single",
          yard_sign_designs: [{ quantity: 10 }],
          yard_sign_step_stakes_enabled: true,
          yard_sign_step_stakes_qty: 10,
        },
      ]).eligible,
    ).toBe(false);
  });
  it("never discounts finishing and changes the signature for priced selections", () => {
    const plain = canonicalCart([banner()]);
    const rope = canonicalCart([
      { ...banner(), rope_feet: 5, rope_placement: "top" },
    ]);
    expect(cartHash(plain)).not.toBe(cartHash(rope));
    const r = evaluateCart(rope);
    expect(r.eligibleCents).toBe(5000);
  });
  it("preserves a better quantity offer", () => {
    const r = evaluateCart([banner(60, 24, 5)], {
      kind: "wallet",
      balanceCents: 100,
    });
    expect(r.betterOffer).toBe(true);
  });
});

describe("Atomic ledger", () => {
  it("allows only one of two checkouts to spend the same available balance", async () => {
    const m = await newPerson();
    await seed(m, 1000);
    const a = await newOrder(),
      b = await newOrder();
    const qa = await quote(m, 1000),
      qb = await quote(m, 1000);
    const results = await Promise.allSettled([
      reserve({
        order: a,
        emailAddress: "a@testcustomer.com",
        member: m,
        cash: 1000,
        quote: qa,
      }),
      reserve({
        order: b,
        emailAddress: "b@testcustomer.com",
        member: m,
        cash: 1000,
        quote: qb,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("settles only after payment and debits once on webhook retries", async () => {
    const m = await newPerson();
    await seed(m, 2000);
    const o = await newOrder();
    const q = await quote(m, 1000);
    await reserve({
      order: o,
      emailAddress: "settle@testcustomer.com",
      member: m,
      cash: 1000,
      quote: q,
    });
    expect(
      (await db.query("SELECT bof_settle($1) AS result", [o])).rows[0].result,
    ).toBe(false);
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    expect(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM bof_cash_entries WHERE order_id=$1 AND kind='redemption'",
          [o],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("holds rewards until 14 days after shipment, never double credits", async () => {
    const m = await newPerson(),
      o = await newOrder("new-friend@testcustomer.com");
    await reserve({
      order: o,
      emailAddress: "new-friend@testcustomer.com",
      referrer: m,
      reward: 500,
    });
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    expect(
      (
        await db.query(
          "SELECT available_at FROM bof_cash_entries WHERE order_id=$1",
          [o],
        )
      ).rows[0].available_at,
    ).toBe(null);
    await db.query("UPDATE orders SET status='shipped' WHERE id=$1", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    const available = (
      await db.query(
        "SELECT available_at FROM bof_cash_entries WHERE order_id=$1",
        [o],
      )
    ).rows[0].available_at;
    expect(new Date(available).getTime() - Date.now()).toBeGreaterThan(
      13.99 * 86400000,
    );
    await db.query("SELECT bof_settle($1)", [o]);
    expect(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM bof_cash_entries WHERE order_id=$1",
          [o],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("awards a new customer only once across simultaneous referral checkouts", async () => {
    const m = await newPerson(),
      a = await newOrder("same@customer.com"),
      b = await newOrder("same@customer.com");
    await reserve({
      order: a,
      emailAddress: "same@customer.com",
      referrer: m,
      reward: 500,
    });
    await expect(
      reserve({
        order: b,
        emailAddress: "same@customer.com",
        referrer: m,
        reward: 500,
      }),
    ).rejects.toThrow("BOF_FIRST_ORDER_UNAVAILABLE");
  });
  it("blocks self referrals and repeat customers", async () => {
    const m = await newPerson("self@customer.com");
    const o = await newOrder("self@customer.com");
    await expect(
      reserve({
        order: o,
        emailAddress: "self@customer.com",
        referrer: m,
        reward: 500,
      }),
    ).rejects.toThrow("BOF_FIRST_ORDER_UNAVAILABLE");
    await newOrder("repeat@customer.com", "paid");
    const b = await newOrder("repeat@customer.com");
    await expect(
      reserve({
        order: b,
        emailAddress: "repeat@customer.com",
        referrer: m,
        reward: 500,
      }),
    ).rejects.toThrow("BOF_FIRST_ORDER_UNAVAILABLE");
  });
  it("returns spent credit proportionally and idempotently for partial then full refund", async () => {
    const m = await newPerson();
    await seed(m, 2000);
    const o = await newOrder(),
      q = await quote(m, 1000);
    await reserve({
      order: o,
      emailAddress: "refund@customer.com",
      member: m,
      cash: 1000,
      quote: q,
    });
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    for (const amount of [3975, 3975, 7950, 7950])
      await db.query("SELECT bof_reverse($1,$2,7950,false)", [o, amount]);
    const result = await db.query(
      "SELECT sum(amount_cents)::integer AS cents,count(*)::integer AS n FROM bof_cash_entries WHERE order_id=$1 AND kind='redemption_refund'",
      [o],
    );
    expect(result.rows[0]).toEqual({ cents: 1000, n: 2 });
  });
  it("does not return spent credit from a record-only refund status before the provider confirms it", async () => {
    const member = await newPerson();
    await seed(member, 1000);
    const order = await newOrder();
    await reserve({
      order,
      emailAddress: "record-only-refund@customer.com",
      member,
      cash: 1000,
      quote: await quote(member, 1000),
    });
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [order]);
    await service.settle(sql, { id: order });
    await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [order]);
    // The admin action only records a status; it does not move provider money.
    expect((await service.wallet(sql, member)).availableCents).toBe(0);
    expect(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM bof_cash_entries WHERE order_id=$1 AND kind='redemption_refund'",
          [order],
        )
      ).rows[0].n,
    ).toBe(0);
    // A later canonical partial refund returns only its proportional credit.
    await service.reverse(sql, order, 3975, 7950);
    expect((await service.wallet(sql, member)).availableCents).toBe(500);
    await service.reverse(sql, order, 7950, 7950);
    expect((await service.wallet(sql, member)).availableCents).toBe(1000);
  });
  it("prevents canceled pending rewards from maturing later", async () => {
    const m = await newPerson(),
      o = await newOrder("revoked@customer.com");
    await reserve({
      order: o,
      emailAddress: "revoked@customer.com",
      referrer: m,
      reward: 500,
    });
    await db.query("UPDATE orders SET status='shipped' WHERE id=$1", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    await db.query("SELECT bof_reverse($1,7950,7950,false)", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    const w = await service.wallet(sql, m);
    expect(w.pendingCents).toBe(0);
    expect(w.availableCents).toBe(0);
  });
  it("does not return wallet cash for an unresolved chargeback", async () => {
    const m = await newPerson();
    await seed(m, 1000);
    const o = await newOrder(),
      q = await quote(m, 1000);
    await reserve({
      order: o,
      emailAddress: "dispute@customer.com",
      member: m,
      cash: 1000,
      quote: q,
    });
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    await db.query("SELECT bof_reverse($1,7950,7950,true)", [o]);
    expect(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM bof_cash_entries WHERE order_id=$1 AND kind='redemption_refund'",
          [o],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("releases a failed checkout and safely re-reserves its retry", async () => {
    const m = await newPerson();
    await seed(m, 1000);
    const o = await newOrder(),
      q = await quote(m, 1000);
    const args = {
      order: o,
      emailAddress: "retry@customer.com",
      member: m,
      cash: 1000,
      quote: q,
    };
    await reserve(args);
    await db.query("SELECT bof_release($1)", [o]);
    expect(
      (await db.query("SELECT bof_begin_payment($1) AS ready", [o])).rows[0]
        .ready,
    ).toBe(false);
    await reserve(args);
    expect(
      (await db.query("SELECT bof_begin_payment($1) AS ready", [o])).rows[0]
        .ready,
    ).toBe(true);
  });
});

describe("Guest claiming and membership", () => {
  it("omits the order-confirmation invitation after the customer has joined", async () => {
    process.env.BOF_REFERRAL_ENABLED = "true";
    try {
      await newPerson("alreadyjoined@customer.com");
      expect(
        await email.confirmationBlock(
          sql,
          " AlreadyJoined@customer.com ",
          false,
        ),
      ).toBe("");
    } finally {
      delete process.env.BOF_REFERRAL_ENABLED;
    }
  });
  it("uses a single-use link and creates one non-admin account for a guest", async () => {
    const address = "newguest@customer.com",
      id = randomUUID(),
      raw = "secret-" + id,
      hash = createHash("sha256").update(raw).digest("hex");
    await newOrder(address, "paid");
    await db.query(
      "INSERT INTO bof_invitations(id,email,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [id, address, hash],
    );
    const claimed = (
      await db.query("SELECT * FROM bof_claim_invitation($1,'ABCDEF123456')", [
        hash,
      ])
    ).rows[0];
    expect(claimed.email).toBe(address);
    expect(claimed.is_admin).toBe(false);
    await expect(
      db.query("SELECT * FROM bof_claim_invitation($1,'ABCDEF123456')", [hash]),
    ).rejects.toThrow("BOF_LINK_EXPIRED");
    const result = await members.enrichMembership(sql, [
      { email: address },
      { email: "notjoined@customer.com" },
    ]);
    expect(result[0].bof_member).toBe(true);
    expect(result[1].bof_member).toBe(false);
  });
  it("reuses an existing guest profile without creating a duplicate", async () => {
    const address = "existingguest@customer.com",
      id = randomUUID(),
      invite = randomUUID();
    await db.query("INSERT INTO profiles(id,email) VALUES($1,$2)", [
      id,
      address,
    ]);
    await newOrder(address, "paid");
    await db.query(
      "INSERT INTO bof_invitations(id,email,token_hash,expires_at) VALUES($1,$2,'existing-guest',now()+interval '1 day')",
      [invite, address],
    );
    const rows = (
      await db.query(
        "SELECT * FROM bof_claim_invitation('existing-guest','ABCDEF654321')",
      )
    ).rows;
    expect(rows[0].id).toBe(id);
    expect(
      (await db.query("SELECT email_verified FROM profiles WHERE id=$1", [id]))
        .rows[0].email_verified,
    ).toBe(true);
  });
  it("rejects expired links and never turns an invitation into admin access", async () => {
    const id = randomUUID(),
      address = "admin@customer.com";
    await db.query(
      "INSERT INTO profiles(id,email,is_admin) VALUES($1,$2,true)",
      [id, address],
    );
    await newOrder(address, "paid");
    await db.query(
      "INSERT INTO bof_invitations(id,email,token_hash,expires_at) VALUES($1,$2,'admin-link',now()+interval '1 day')",
      [randomUUID(), address],
    );
    await expect(
      db.query(
        "SELECT * FROM bof_claim_invitation('admin-link','111111111111')",
      ),
    ).rejects.toThrow("BOF_ADMIN_SIGN_IN_REQUIRED");
    await db.query(
      "INSERT INTO bof_invitations(id,email,token_hash,expires_at) VALUES($1,$2,'old-link',now()-interval '1 minute')",
      [randomUUID(), address],
    );
    await expect(
      db.query("SELECT * FROM bof_claim_invitation('old-link','111111111111')"),
    ).rejects.toThrow("BOF_LINK_EXPIRED");
  });
  it("gates wallet validation off before querying new tables", async () => {
    delete process.env.BOF_REFERRAL_ENABLED;
    const r = await service.validate(
      () => {
        throw new Error("must not query");
      },
      { code: "BOFCASH-anything" },
    );
    expect(r.valid).toBe(false);
  });
  it("does not demand photos and makes the invitation and login distinct", () => {
    expect(email.content().text).toContain(
      "No photos, reviews, or public posts required.",
    );
    expect(email.content({ access: true }).text).toContain("15 minutes");
  });
  it("only follows known PayPal capture links", () => {
    expect(
      providerEvents.linkedCapture({
        links: [
          { rel: "up", href: "https://evil.test/v2/payments/captures/ABC" },
        ],
      }),
    ).toBe(null);
    expect(
      providerEvents.linkedCapture({
        links: [
          {
            rel: "up",
            href: "https://api-m.paypal.com/v2/payments/captures/ABC123",
          },
        ],
      }),
    ).toBe("ABC123");
  });
});

describe("Checkout integration", () => {
  it("binds a wallet quote to its verified owner and exact cart, then reserves and spends it once", async () => {
    process.env.BOF_REFERRAL_ENABLED = "true";
    try {
      const ownerEmail = "quote-owner@customer.com",
        m = await newPerson(ownerEmail),
        earned = await newOrder("quote-friend@customer.com");
      await reserve({
        order: earned,
        emailAddress: "quote-friend@customer.com",
        referrer: m,
        reward: 1000,
      });
      await db.query("UPDATE orders SET status='shipped' WHERE id=$1", [
        earned,
      ]);
      await db.query("SELECT bof_settle($1)", [earned]);
      await db.query(
        "UPDATE bof_cash_entries SET available_at=now()-interval '1 day' WHERE order_id=$1",
        [earned],
      );
      const q = await service.quote(
        sql,
        { id: m, email: ownerEmail, enabled: true },
        [banner()],
      );
      expect(q.usableCents).toBe(1000);
      const input = {
        code: q.discount.code,
        items: [banner()],
        email: ownerEmail,
        userId: m,
        authenticatedUserId: m,
      };
      expect((await service.validate(sql, input)).valid).toBe(true);
      expect(
        (
          await service.validate(sql, {
            ...input,
            authenticatedUserId: await newPerson(),
          })
        ).valid,
      ).toBe(false);
      expect(
        (await service.validate(sql, { ...input, items: [banner(72, 24)] }))
          .valid,
      ).toBe(false);
      const purchase = await newOrder(ownerEmail);
      await service.attach(
        sql,
        purchase,
        {
          items: [banner()],
          bofOriginalDiscountCode: q.discount.code,
          discountCode: q.discount,
          applied_discount_type: "promo",
          applied_discount_cents: 1000,
        },
        { email: ownerEmail, userId: m, authenticatedUserId: m },
      );
      expect((await service.wallet(sql, m)).reservedCents).toBe(1000);
      await db.query("UPDATE orders SET status='paid' WHERE id=$1", [purchase]);
      await service.settle(sql, { id: purchase });
      await service.settle(sql, { id: purchase });
      expect((await service.wallet(sql, m)).availableCents).toBe(0);
      await service.reverse(sql, purchase, 3975, 7950);
      expect((await service.wallet(sql, m)).availableCents).toBe(500);
    } finally {
      delete process.env.BOF_REFERRAL_ENABLED;
    }
  });
  it("does not reward a referral if another first order settles before it", async () => {
    const m = await newPerson(),
      o = await newOrder("racing-first@customer.com");
    await reserve({
      order: o,
      emailAddress: "racing-first@customer.com",
      referrer: m,
      reward: 500,
    });
    await newOrder("racing-first@customer.com", "paid");
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [o]);
    await db.query("SELECT bof_settle($1)", [o]);
    expect(
      (
        await db.query(
          "SELECT reward_eligible FROM bof_order_benefits WHERE order_id=$1",
          [o],
        )
      ).rows[0].reward_eligible,
    ).toBe(false);
    expect(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM bof_cash_entries WHERE order_id=$1 AND kind='reward'",
          [o],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("handles a refund arriving before the credit bookkeeping completed", async () => {
    const m = await newPerson();
    await seed(m, 1000);
    const o = await newOrder(),
      q = await quote(m, 1000);
    await reserve({
      order: o,
      emailAddress: "earlyrefund@customer.com",
      member: m,
      cash: 1000,
      quote: q,
    });
    await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [o]);
    await db.query("SELECT bof_reverse($1,7950,7950,false)", [o]);
    expect(
      (
        await db.query(
          "SELECT sum(amount_cents)::integer AS cents FROM bof_cash_entries WHERE order_id=$1",
          [o],
        )
      ).rows[0].cents,
    ).toBe(0);
    expect(
      (
        await db.query(
          "SELECT state FROM bof_order_benefits WHERE order_id=$1",
          [o],
        )
      ).rows[0].state,
    ).toBe("reversed");
  });
  it("lets an unapplied BOF quote yield to a better automatic offer without requiring a wallet debit", async () => {
    const order = await newOrder();
    expect(
      await service.assertHeld(sql, {
        id: order,
        discount_code: "BOFCASH-unused",
        applied_discount_type: "quantity",
        applied_discount_cents: 500,
      }),
    ).toEqual({ ok: true });
  });
});
