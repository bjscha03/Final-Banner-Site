export type PayPalCheckoutSignatureInput = {
  totalCents: number;
  userId?: string | null;
  email?: string | null;
  items: Array<Record<string, unknown>>;
  discountCode?: Record<string, unknown> | null;
  sameDayHitService?: boolean;
  saturdayDelivery?: boolean;
};

const numberOrZero = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const stringOrEmpty = (value: unknown): string => (
  typeof value === 'string' ? value : value == null ? '' : String(value)
);

/**
 * Build a stable signature for the fields that make a prepared PayPal order
 * authoritative. Browser-only preview URLs are intentionally excluded so a
 * background thumbnail/web-preview upload cannot invalidate an already warm
 * payment session or create duplicate pending orders.
 */
export function buildPayPalCheckoutSignature(input: PayPalCheckoutSignatureInput): string {
  const items = (Array.isArray(input.items) ? input.items : []).map((item) => ({
    id: stringOrEmpty(item.id),
    product_type: stringOrEmpty(item.product_type || 'banner'),
    width_in: numberOrZero(item.width_in),
    height_in: numberOrZero(item.height_in),
    quantity: numberOrZero(item.quantity),
    material: stringOrEmpty(item.material),
    grommets: stringOrEmpty(item.grommets),
    pole_pockets: stringOrEmpty(item.pole_pockets),
    pole_pocket_position: stringOrEmpty(item.pole_pocket_position),
    pole_pocket_size: stringOrEmpty(item.pole_pocket_size),
    rounded_corners: stringOrEmpty(item.rounded_corners),
    rope_feet: numberOrZero(item.rope_feet),
    rope_placement: stringOrEmpty(item.rope_placement),
    unit_price_cents: numberOrZero(item.unit_price_cents),
    rope_cost_cents: numberOrZero(item.rope_cost_cents),
    pole_pocket_cost_cents: numberOrZero(item.pole_pocket_cost_cents),
    line_total_cents: numberOrZero(item.line_total_cents),
    file_key: stringOrEmpty(item.file_key),
    file_url: stringOrEmpty(item.file_url),
    is_pdf: Boolean(item.is_pdf),
    canvas_state_json: stringOrEmpty(item.canvas_state_json),
    design_service_enabled: Boolean(item.design_service_enabled),
    yard_sign_sidedness: stringOrEmpty(item.yard_sign_sidedness),
    yard_sign_step_stakes_enabled: Boolean(item.yard_sign_step_stakes_enabled),
    yard_sign_step_stakes_qty: numberOrZero(item.yard_sign_step_stakes_qty),
    yard_sign_design_count: numberOrZero(item.yard_sign_design_count),
  }));

  return JSON.stringify({
    totalCents: Math.max(0, Math.round(numberOrZero(input.totalCents))),
    userId: stringOrEmpty(input.userId),
    email: stringOrEmpty(input.email).trim().toLowerCase(),
    discountCode: input.discountCode || null,
    sameDayHitService: Boolean(input.sameDayHitService),
    saturdayDelivery: Boolean(input.saturdayDelivery),
    items,
  });
}
