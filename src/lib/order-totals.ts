export type OrderTotalsInput = {
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  total_cents?: number | null;
  applied_discount_cents?: number | null;
  shipping_cents?: number | null;
  same_day_fee_cents?: number | null;
  saturday_fee_cents?: number | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function getExpectedOrderTotalCents(input: OrderTotalsInput): number {
  const subtotal = n(input.subtotal_cents);
  const discount = n(input.applied_discount_cents);
  const tax = n(input.tax_cents);
  const shipping = n(input.shipping_cents);
  const sameDay = n(input.same_day_fee_cents);
  const saturday = n(input.saturday_fee_cents);
  return Math.max(0, subtotal - discount + tax + shipping + sameDay + saturday);
}

export function getDisplayOrderTotalCents(input: OrderTotalsInput): number {
  const stored = n(input.total_cents);
  // The stored total is the amount validated against and captured by the
  // payment processor. Reconstruct only genuinely legacy rows that have no
  // authoritative total; never display or report more than was charged.
  return stored > 0 ? stored : getExpectedOrderTotalCents(input);
}
