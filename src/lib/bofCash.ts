import { authorizedHeaders } from "./serverAuth";
export async function bofRequest(action: string, payload?: unknown) {
  const response = await fetch(
    `/.netlify/functions/bof-cash?action=${action}`,
    {
      method: payload === undefined ? "GET" : "POST",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please try again.");
  return result;
}
const REFERRAL_KEY = "bof_referral_v1";
export function saveBofReferral(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^BOFREF-[A-F0-9]{12}$/.test(normalized)) return false;
  try {
    localStorage.setItem(
      REFERRAL_KEY,
      JSON.stringify({ code: normalized, expires: Date.now() + 30 * 86400000 }),
    );
  } catch {
    return false;
  }
  return true;
}
export function readBofReferral(): string | null {
  try {
    const value = JSON.parse(localStorage.getItem(REFERRAL_KEY) || "null");
    if (value?.expires > Date.now() && /^BOFREF-[A-F0-9]{12}$/.test(value.code))
      return value.code;
    localStorage.removeItem(REFERRAL_KEY);
  } catch {
    /* Storage is optional. A code can still be entered at checkout. */
  }
  return null;
}
export const bofMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (Number(cents) || 0) / 100,
  );

/** Quotes need product selections, never multi-megabyte artwork or previews. */
export function bofPricingItems(items: unknown[]) {
  const fields = [
    "id",
    "product_type",
    "width_in",
    "height_in",
    "quantity",
    "material",
    "grommets",
    "rounded_corners",
    "rope_feet",
    "rope_placement",
    "pole_pockets",
    "pole_pocket_position",
    "pole_pocket_size",
    "yard_sign_sidedness",
    "yard_sign_step_stakes_enabled",
    "yard_sign_step_stakes_qty",
    "yard_sign_design_count",
    "design_service_enabled",
    "line_total_cents",
  ];
  return items.map((value) => {
    const item = value as Record<string, unknown>;
    const result = Object.fromEntries(
      fields
        .filter((field) => item[field] !== undefined)
        .map((field) => [field, item[field]]),
    );
    if (Array.isArray(item.yard_sign_designs))
      result.yard_sign_designs = item.yard_sign_designs.map((design) => ({
        quantity: design.quantity,
      }));
    return result;
  });
}
