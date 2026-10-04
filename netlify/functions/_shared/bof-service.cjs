"use strict";
const crypto = require("node:crypto");
const { getSession } = require("./server-auth.cjs");
const { linkVerifiedGuestOrders } = require("./verified-guest-orders.cjs");
const active = () => process.env.BOF_REFERRAL_ENABLED === "true";
const launched = () => active() || !!process.env.BOF_REFERRAL_LAUNCHED_AT;
const norm = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();
const isBofCode = (value) => /^BOF(?:REF|CASH)-/.test(norm(value));
const emailOf = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code, statusCode: 409 });
};
const policy = () => import("./bof-policy.mjs");

async function optional(sql, operation) {
  try {
    return await operation();
  } catch (error) {
    if (!active() && error?.code === "42P01") return null;
    throw error;
  }
}
async function memberForSession(sql, event) {
  const session = getSession(event);
  if (!session || session.preview || !session.sub)
    throw Object.assign(new Error("Sign in to see your BOF Cash."), {
      statusCode: 401,
    });
  // Password-only site administration uses "server-admin", not a profile ID.
  // It cannot own a customer wallet and must never reach Postgres' UUID cast.
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(session.sub))
    throw Object.assign(
      new Error("Open your BOF Cash invitation or sign in to your customer account."),
      { statusCode: 409 },
    );
  const rows =
    await sql`SELECT p.id,p.email,p.full_name,p.username,p.is_admin,p.email_verified,m.code,m.enabled
    FROM profiles p LEFT JOIN bof_members m ON m.user_id=p.id
    WHERE p.id=${session.sub}::uuid AND lower(btrim(p.email))=${emailOf(session.email)}`;
  if (!rows[0] || !rows[0].email_verified)
    throw Object.assign(new Error("Verify your email to use BOF Cash."), {
      statusCode: 401,
    });
  return rows[0];
}
async function sync(sql, memberId = null) {
  return optional(sql, async () => {
    const orders =
      await sql`SELECT b.order_id,o.status,o.total_cents FROM bof_order_benefits b JOIN orders o ON o.id=b.order_id
      WHERE (${memberId}::uuid IS NULL OR b.referrer_id=${memberId}::uuid OR b.wallet_member_id=${memberId}::uuid)
      AND ((b.state='held' AND o.status IN ('paid','in_production','shipped','delivered','fulfilled'))
        OR (b.state='paid' AND b.shipped_at IS NULL AND o.status IN ('shipped','delivered','fulfilled'))
        OR (b.state IN ('held','paid') AND o.status='refunded')) ORDER BY b.created_at LIMIT 200`;
    for (const order of orders) {
      if (order.status === "refunded")
        // The admin refund action only records a status; it does not verify
        // provider money movement. Revoke the reward and flag review now,
        // but only a canonical provider refund may return spent BOF Cash.
        await sql`SELECT bof_reverse(${order.order_id}::uuid,0,${Number(order.total_cents)},false)`;
      else await sql`SELECT bof_settle(${order.order_id}::uuid)`;
    }
  });
}
async function wallet(sql, memberId) {
  await sync(sql, memberId);
  const entries =
    await sql`SELECT e.kind,e.amount_cents,e.available_at,e.created_at,b.state,b.shipped_at
    FROM bof_cash_entries e JOIN bof_order_benefits b ON b.order_id=e.order_id
    WHERE e.member_id=${memberId}::uuid ORDER BY e.created_at DESC`;
  const reservations =
    await sql`SELECT order_id,wallet_cents,created_at FROM bof_order_benefits WHERE wallet_member_id=${memberId}::uuid AND state='held' ORDER BY created_at DESC`;
  const held = [
    { cents: reservations.reduce((n, r) => n + Number(r.wallet_cents), 0) },
  ];
  const now = Date.now();
  const balance = entries
    .filter((e) => e.available_at && new Date(e.available_at).getTime() <= now)
    .reduce((n, e) => n + Number(e.amount_cents), 0);
  const pending = entries
    .filter(
      (e) =>
        e.kind === "reward" &&
        e.state === "paid" &&
        (!e.available_at || new Date(e.available_at).getTime() > now),
    )
    .reduce((n, e) => n + Number(e.amount_cents), 0);
  return {
    availableCents: Math.max(0, balance - Number(held[0].cents)),
    pendingCents: pending,
    reservedCents: Number(held[0].cents),
    adjustmentCents: Math.min(0, balance),
    entries: entries.slice(0, 50),
    reservations,
  };
}
async function join(sql, person) {
  const paid =
    await sql`SELECT id FROM orders WHERE lower(btrim(email))=${emailOf(person.email)}
    AND NOT coalesce(is_test_order,false) AND status IN ('paid','in_production','shipped','delivered','fulfilled') LIMIT 1`;
  if (!paid.length)
    fail(
      "BOF_CUSTOMER_REQUIRED",
      "BOF Cash opens after your first paid order.",
    );
  await linkVerifiedGuestOrders(sql, person);
  const code = crypto.randomBytes(6).toString("hex").toUpperCase();
  const rows =
    await sql`INSERT INTO bof_members(user_id,code) VALUES(${person.id}::uuid,${code})
    ON CONFLICT(user_id) DO UPDATE SET user_id=excluded.user_id RETURNING *`;
  return rows[0];
}
async function validate(
  sql,
  {
    code,
    items,
    email,
    userId,
    authenticatedUserId = null,
    checkoutKey = null,
  },
) {
  if (!active())
    return { valid: false, error: "The BOF Cash program is not open yet." };
  const normalized = norm(code);
  const p = await policy();
  if (normalized.startsWith("BOFCASH-")) {
    if (!authenticatedUserId)
      return { valid: false, error: "Sign in to use your BOF Cash." };
    const quotes =
      await sql`SELECT q.*,p.email,m.enabled FROM bof_quotes q JOIN bof_members m ON m.user_id=q.member_id
      JOIN profiles p ON p.id=m.user_id WHERE q.code=${normalized} AND q.member_id=${authenticatedUserId}::uuid`;
    const q = quotes[0];
    if (
      !q ||
      !q.enabled ||
      emailOf(q.email) !== emailOf(email) ||
      (!q.order_id && new Date(q.expires_at) <= new Date())
    )
      return {
        valid: false,
        error: "Refresh your BOF Cash amount before paying.",
      };
    const result = p.evaluateCart(items, {
      kind: "wallet",
      balanceCents: Number(q.amount_cents),
    });
    if (
      !result.eligible ||
      result.cartHash !== q.cart_hash ||
      result.discountCents !== Number(q.amount_cents)
    )
      return {
        valid: false,
        error: "Your cart changed. Refresh your BOF Cash amount before paying.",
      };
    return {
      valid: true,
      discount: {
        id: normalized,
        code: normalized,
        discountPercentage: 0,
        discountAmountCents: Number(q.amount_cents),
        source: "bof_wallet",
        expiresAt: q.expires_at,
        discountScope: "order",
        displayLabel: "BOF Cash",
        walletMemberId: q.member_id,
      },
    };
  }
  const publicCode = normalized.replace(/^BOFREF-/, "");
  const rows =
    await sql`SELECT m.user_id,p.email FROM bof_members m JOIN profiles p ON p.id=m.user_id WHERE m.code=${publicCode} AND m.enabled`;
  if (!rows.length)
    return { valid: false, error: "That referral code is not available." };
  if (
    (emailOf(email) && emailOf(email) === emailOf(rows[0].email)) ||
    userId === rows[0].user_id
  )
    return {
      valid: false,
      error: "Your referral code is for friends placing their first order.",
    };
  if (email) {
    const previous =
      await sql`SELECT id FROM orders WHERE lower(btrim(email))=${emailOf(email)}
      AND NOT coalesce(is_test_order,false) AND (status IN ('paid','in_production','shipped','delivered','fulfilled','refunded')
        OR nullif(to_jsonb(orders)->>'paypal_capture_id','') IS NOT NULL OR payment_reconciliation_status IN ('complete','completed'))
      AND (${checkoutKey}::text IS NULL OR checkout_idempotency_key IS DISTINCT FROM ${checkoutKey}) LIMIT 1`;
    if (previous.length)
      return {
        valid: false,
        error: "Referral savings are available on your first order.",
      };
  }
  const result = p.evaluateCart(items);
  if (!result.eligible) return { valid: false, error: result.reason };
  return {
    valid: true,
    discount: {
      id: normalized,
      code: normalized,
      discountPercentage: 0,
      discountAmountCents: result.discountCents,
      source: "bof_referral",
      expiresAt: "2099-12-31T23:59:59Z",
      discountScope: "order",
      displayLabel: "Friend referral savings",
      referrerId: rows[0].user_id,
    },
  };
}
async function quote(
  sql,
  person,
  items,
  currentCode = null,
  extraChargedCents = 0,
) {
  if (!active() || !person.enabled)
    fail("BOF_PAUSED", "BOF Cash is currently paused.");
  const balance = await wallet(sql, person.id),
    p = await policy();
  let result = p.evaluateCart(items, {
    kind: "wallet",
    balanceCents: balance.availableCents,
    extraChargedCents,
  });
  if (
    !result.eligible &&
    result.reason ===
      "BOF Cash is not available for this combination of products and offers."
  ) {
    let low = 1,
      high = result.discountCents,
      best = null;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = p.evaluateCart(items, {
        kind: "wallet",
        balanceCents: mid,
        extraChargedCents,
      });
      if (candidate.eligible) {
        best = candidate;
        low = mid + 1;
      } else high = mid - 1;
    }
    if (best) result = best;
  }
  if (!result.eligible)
    return { ...balance, usableCents: 0, message: result.reason };
  // Compare the currently entered promotion as well as automatic/quantity offers.
  if (currentCode && !isBofCode(currentCode)) {
    const other =
      await require("./discount-validation.cjs").validateDiscountForCheckout({
        sql,
        code: currentCode,
        items: result.items,
        email: person.email,
        userId: person.id,
      });
    if (other.valid) {
      const calculated = require("./checkoutTotals.cjs").computeTotals(
        result.items,
        0.06,
        { freeShipping: true, minFloorCents: 0 },
        other.discount,
      );
      if (calculated.applied_discount_cents >= result.discountCents)
        result = { ...result, betterOffer: true };
    }
  }
  if (result.betterOffer)
    return {
      ...balance,
      usableCents: 0,
      message:
        "Your current offer saves at least as much. Keep your BOF Cash for another order.",
    };
  const code =
    "BOFCASH-" + crypto.randomBytes(16).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
  await sql`INSERT INTO bof_quotes(code,member_id,cart_hash,amount_cents,expires_at)
    VALUES(${code},${person.id}::uuid,${result.cartHash},${result.discountCents},${expiresAt}::timestamptz)`;
  return {
    ...balance,
    usableCents: result.discountCents,
    message: "Use BOF Cash instead of your current promotion.",
    discount: {
      id: code,
      code,
      discountPercentage: 0,
      discountAmountCents: result.discountCents,
      discountScope: "order",
      displayLabel: "BOF Cash",
      expiresAt,
    },
  };
}
async function attach(
  sql,
  orderId,
  data,
  { email, userId, authenticatedUserId = null },
) {
  const requested = norm(data.bofOriginalDiscountCode),
    ref = norm(
      data.bofReferralCode ||
        (requested.startsWith("BOFREF-") ? requested : ""),
    );
  if (
    !active() ||
    data.is_test_order ||
    (!ref && !requested.startsWith("BOFCASH-"))
  )
    return;
  const p = await policy();
  const extraChargedCents =
    Number(data.same_day_fee_cents || 0) + Number(data.saturday_fee_cents || 0);
  let referrer = null,
    reward = 0,
    walletMember = null,
    cash = 0,
    friendDiscount = 0;
  if (
    requested.startsWith("BOFCASH-") &&
    norm(data.discountCode?.code) === requested &&
    data.applied_discount_type === "promo"
  ) {
    const validation = await validate(sql, {
      code: requested,
      items: data.items,
      email,
      userId,
      authenticatedUserId,
      checkoutKey: data.checkout_idempotency_key || null,
    });
    if (!validation.valid) fail("BOF_QUOTE_CHANGED", validation.error);
    if (
      Number(data.applied_discount_cents) !==
      validation.discount.discountAmountCents
    )
      fail("BOF_QUOTE_CHANGED", "Refresh your BOF Cash amount.");
    walletMember = validation.discount.walletMemberId;
    cash = validation.discount.discountAmountCents;
  }
  let financial = p.evaluateCart(data.items, {
    kind: cash ? "wallet" : "friend",
    balanceCents: cash,
    discountCents: Number(data.applied_discount_cents || 0),
    rewardCents: 0,
    extraChargedCents,
  });
  if (ref && !cash) {
    const validation = await validate(sql, {
      code: ref.startsWith("BOFREF-") ? ref : "BOFREF-" + ref,
      items: data.items,
      email,
      userId,
      checkoutKey: data.checkout_idempotency_key || null,
    });
    if (validation.valid) {
      const potential = p.evaluateCart(data.items, {
        discountCents: Number(data.applied_discount_cents || 0),
        extraChargedCents,
      });
      if (potential.eligible) {
        financial = potential;
        referrer = validation.discount.referrerId;
        reward = potential.rewardCents;
        if (
          norm(data.discountCode?.code).startsWith("BOFREF-") &&
          data.applied_discount_type === "promo"
        )
          friendDiscount = Number(data.applied_discount_cents || 0);
      }
    } else if (requested.startsWith("BOFREF-"))
      fail("BOF_REFERRAL_UNAVAILABLE", validation.error);
  }
  if (!cash && !reward) return;
  if (!financial.eligible) fail("BOF_OFFER_UNAVAILABLE", financial.reason);
  const snapshot = { ...financial, items: undefined };
  try {
    await sql`SELECT bof_reserve(${orderId}::uuid,${emailOf(email)},${referrer}::uuid,${reward},${walletMember}::uuid,${cash},
      ${friendDiscount},${financial.contributionCents},${financial.netCents},${JSON.stringify(snapshot)}::jsonb,${cash ? requested : null})`;
  } catch (error) {
    if (String(error.message).includes("BOF_"))
      fail(
        "BOF_BALANCE_CHANGED",
        "This BOF offer changed or is reserved by another checkout. Refresh before paying.",
      );
    throw error;
  }
}
async function assertHeld(sql, order) {
  if (order.is_test_order) return { ok: true };
  const result = await optional(
    sql,
    () => sql`SELECT bof_begin_payment(${order.id}::uuid) AS ready`,
  );
  if (!result?.length || result[0].ready === null) {
    if (
      isBofCode(order.discount_code) &&
      order.applied_discount_type === "promo" &&
      Number(order.applied_discount_cents) > 0
    )
      return {
        ok: false,
        code: "BOF_RESERVATION_MISSING",
        message: "Refresh the BOF Cash offer before paying.",
      };
    return { ok: true };
  }
  return result[0].ready
    ? { ok: true }
    : {
        ok: false,
        code: "BOF_RESERVATION_RELEASED",
        message: "Refresh checkout to use this offer again.",
      };
}
async function settle(sql, order) {
  if (order.is_test_order) return;
  return optional(sql, () => sql`SELECT bof_settle(${order.id}::uuid)`);
}
async function release(sql, order) {
  if (order.is_test_order) return;
  return optional(sql, () => sql`SELECT bof_release(${order.id}::uuid)`);
}
async function reverse(sql, id, refunded, paid, dispute = false) {
  return optional(
    sql,
    () => sql`SELECT bof_reverse(${id}::uuid,${refunded},${paid},${dispute})`,
  );
}
module.exports = {
  active,
  launched,
  isBofCode,
  memberForSession,
  wallet,
  join,
  validate,
  quote,
  attach,
  assertHeld,
  settle,
  release,
  reverse,
  sync,
};
