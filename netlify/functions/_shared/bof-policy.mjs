import { createHash } from "node:crypto";
import { estimateOrderProfit } from "../../../src/lib/admin-profit-estimate.ts";
import pricing from "./stripe-server-pricing.cjs";
import totals from "./checkoutTotals.cjs";

export const POLICY_VERSION = "bof-cash-v1";
export const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
export const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();
export const isBofCode = (value) =>
  /^BOF(?:REF|CASH)-/.test(normalizeCode(value));
export function enabled(env = process.env) {
  return env.BOF_REFERRAL_ENABLED === "true";
}
export function canonicalCart(input) {
  const items = pricing.repriceStripeCart(input);
  return items;
}
export function cartHash(items) {
  // Excludes artwork URLs; includes every priced option, quantity, and cart line id.
  const keys = [
    "id",
    "product_type",
    "width_in",
    "height_in",
    "material",
    "quantity",
    "line_total_cents",
    "rope_feet",
    "rope_pricing_mode",
    "pole_pocket_position",
    "pole_pockets",
    "yard_sign_sidedness",
    "yard_sign_step_stakes_enabled",
    "yard_sign_step_stakes_qty",
    "yard_sign_stakes_subtotal_cents",
  ];
  return createHash("sha256")
    .update(JSON.stringify(items.map((i) => keys.map((k) => i[k] ?? null))))
    .digest("hex");
}
export function evaluateCart(
  input,
  {
    kind = "friend",
    balanceCents = 0,
    discountCents = null,
    rewardCents = null,
    extraChargedCents = 0,
  } = {},
) {
  const items = canonicalCart(input);
  const estimate = estimateOrderProfit({
    id: "bof-quote",
    items,
    applied_discount_cents: 0,
  });
  const gross = items.reduce((n, i) => n + i.line_total_cents, 0);
  // Finishing is costed but is not eligible merchandise.
  const eligible = items.reduce(
    (n, i) =>
      n +
      Math.max(
        0,
        i.line_total_cents -
          (i.rope_cost_cents || 0) -
          (i.pole_pocket_cost_cents || 0) -
          (i.yard_sign_stakes_subtotal_cents || 0),
      ),
    0,
  );
  const hasMagnet = items.some((i) => i.product_type === "car_magnet");
  const minimum = kind === "friend" && hasMagnet ? 7500 : 5000;
  const cap = items.reduce((n, i) => {
    const merchandise = Math.max(
      0,
      i.line_total_cents -
        (i.rope_cost_cents || 0) -
        (i.pole_pocket_cost_cents || 0) -
        (i.yard_sign_stakes_subtotal_cents || 0),
    );
    return (
      n +
      Math.floor(
        merchandise *
          (i.product_type === "car_magnet"
            ? kind === "friend"
              ? 0.1
              : 0.15
            : 0.25),
      )
    );
  }, 0);
  const reward =
    rewardCents ?? (kind === "friend" ? (eligible >= 10000 ? 1000 : 500) : 0);
  const requested =
    discountCents ??
    (kind === "friend"
      ? Math.min(cap, 2500)
      : Math.min(cap, Math.max(0, balanceCents)));
  const base = totals.computeTotals(items, 0.06, {
    freeShipping: true,
    minFloorCents: 0,
  });
  const applied = Math.max(requested, base.applied_discount_cents);
  const net = gross - applied;
  const fees =
    Math.ceil(
      (net + Math.round(net * 0.06) + Math.max(0, extraChargedCents)) * 0.05,
    ) + 50;
  const reserve = Math.ceil(net * 0.02);
  const contribution = net - estimate.totalCostCents - fees - reserve - reward;
  const common = {
    version: POLICY_VERSION,
    items,
    cartHash: cartHash(items),
    eligibleCents: eligible,
    grossCents: gross,
    minimumCents: minimum,
    capCents: kind === "friend" ? Math.min(cap, 2500) : cap,
    discountCents: requested,
    automaticDiscountCents: base.applied_discount_cents,
    rewardCents: reward,
    netCents: net,
    productionCents: estimate.productionCostCents,
    supplierShippingCents: estimate.shippingCostCents,
    feeAllowanceCents: fees,
    riskReserveCents: reserve,
    contributionCents: contribution,
  };
  if (estimate.needsReview)
    return {
      ...common,
      eligible: false,
      reason: "This cart includes an option that needs a supplier cost review.",
    };
  if (eligible < minimum)
    return {
      ...common,
      eligible: false,
      reason: `Add eligible products to reach the $${minimum / 100} minimum.`,
    };
  if (requested <= 0)
    return {
      ...common,
      eligible: false,
      reason: "No BOF Cash is available to use yet.",
    };
  if (discountCents !== null && discountCents > cap && kind === "wallet")
    return {
      ...common,
      eligible: false,
      reason: "This discount exceeds the BOF Cash limit.",
    };
  if (contribution < 500 || contribution < Math.ceil(net * 0.15))
    return {
      ...common,
      eligible: false,
      reason:
        "BOF Cash is not available for this combination of products and offers.",
    };
  return {
    ...common,
    eligible: true,
    reason: null,
    betterOffer: base.applied_discount_cents >= requested,
  };
}
