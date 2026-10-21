import { normalizeEmail, isEndBuyer } from "./operations.mjs";
import { validateOpportunity } from "./policy.mjs";
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function text(v, label, max = 1000) {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(`${label} is required (maximum ${max} characters)`);
  return v.trim();
}
export function url(v, label = "Source URL") {
  const s = text(v, label, 2000);
  let u;
  try {
    u = new URL(s);
  } catch {
    fail(`${label} must be a valid website URL`);
  }
  if (!["https:", "http:"].includes(u.protocol))
    fail(`${label} must use https or http`);
  return u.href;
}
export function email(v) {
  const e = normalizeEmail(v);
  if (!e || e.length > 254) fail("Enter a valid email");
  return e;
}
export function date(v) {
  if (!v || !Number.isFinite(Date.parse(v)))
    fail("A valid date and time is required");
  return new Date(v).toISOString();
}
export function uuid(v) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v || "",
    )
  )
    fail("Invalid record ID");
  return v;
}
export function prospect(input) {
  const p = {
    name: text(input.name, "Company name", 200),
    segment: text(input.segment, "Segment", 100),
    website: url(input.website, "Company website"),
    source_url: url(input.source_url),
    contact_name: text(input.contact_name, "Contact name", 200),
    role: String(input.role || "").slice(0, 200),
    email: email(input.email),
    notes: String(input.notes || "").slice(0, 5000),
    location_count: input.location_count === null ? null : Number(input.location_count || 1),
    next_action: text(
      input.next_action || "Review account and prepare introduction",
      "Next action",
    ),
    next_action_at: date(input.next_action_at || new Date().toISOString()),
  };
  if (p.location_count !== null && (!Number.isInteger(p.location_count) || p.location_count < 1))
    fail("Location count must be positive");
  if (!isEndBuyer(p)) fail("Supplier and print vendor prospects are excluded");
  return p;
}
export function opportunity(input) {
  const o = {
    stage: input.stage,
    next_action: String(input.next_action || "").slice(0, 1000),
    next_action_at: input.next_action_at ? date(input.next_action_at) : null,
  };
  const result = validateOpportunity(o);
  if (!result.ok) fail(result.reason);
  return o;
}
export const escapeHtml = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
