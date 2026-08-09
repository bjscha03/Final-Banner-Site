const STORAGE_PREFIX = 'botf_stripe_checkout_v2';

// Keep the server binding through long authentication/network interruptions.
// This prevents an overnight return from starting a second payment for the
// same cart while still expiring genuinely stale browser state.
export const STRIPE_CHECKOUT_STATE_TTL_MS = 24 * 60 * 60 * 1000;
export const KEY_ONLY_ABSENT_OBSERVATIONS_REQUIRED = 3;

export type StripeCheckoutPhase = 'idle' | 'confirming' | 'verifying' | 'requires_action';

export type StoredStripeCheckout = {
  signature: string;
  checkoutKey: string;
  orderId: string | null;
  paymentIntentId: string | null;
  phase: StripeCheckoutPhase;
  updatedAt: number;
};

export const isStripeKeyOnlyRecovery = (
  state: Pick<StoredStripeCheckout, 'phase' | 'orderId' | 'paymentIntentId'>,
): boolean => (
  state.phase !== 'idle'
  && !state.orderId
  && !state.paymentIntentId
);

export const observeStripeKeyOnlyAbsence = (previousObservations: number): {
  observations: number;
  safeToRetry: boolean;
} => {
  const observations = Math.max(0, Math.floor(previousObservations)) + 1;
  return {
    observations,
    safeToRetry: observations >= KEY_ONLY_ABSENT_OBSERVATIONS_REQUIRED,
  };
};

type SignatureInput = {
  total: number;
  discountCode?: { code?: string | null } | null;
  sameDayHitService?: boolean;
  saturdayDelivery?: boolean;
  items: any[];
};

const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

const compactArtwork = (item: any) => ({
  file_key: item.file_key || null,
  final_render_file_key: item.final_render_file_key || null,
  final_render_url: item.final_render_url || null,
  composition_signature: item.composition_signature || null,
  composition_revision: item.composition_revision ?? null,
  artwork: item.artwork_manifest ? {
    publicId: item.artwork_manifest.publicId || null,
    version: item.artwork_manifest.version ?? null,
    originalUrl: item.artwork_manifest.originalUrl || null,
  } : null,
  placement: item.placement_preview ? {
    sourceIdentity: item.placement_preview.sourceIdentity || null,
    compositionSignature: item.placement_preview.compositionSignature || null,
    compositionRevision: item.placement_preview.compositionRevision ?? null,
    previewPublicId: item.placement_preview.previewPublicId
      || item.placement_preview.publicId
      || null,
  } : null,
});

/**
 * Captures every cart value that can affect price, fulfillment, or artwork.
 * A changed cart therefore receives a fresh idempotency key rather than
 * accidentally reusing an older PaymentIntent.
 */
export const buildStripeCheckoutSignature = ({
  total,
  discountCode,
  sameDayHitService,
  saturdayDelivery,
  items,
}: SignatureInput): string => JSON.stringify({
  total,
  discount: discountCode?.code?.trim().toUpperCase() || null,
  sameDayHitService: Boolean(sameDayHitService),
  saturdayDelivery: Boolean(saturdayDelivery),
  items: items.map((item) => ({
    id: item.id,
    product_type: item.product_type || 'banner',
    width_in: item.width_in,
    height_in: item.height_in,
    quantity: item.quantity,
    material: item.material,
    grommets: item.grommets,
    pole_pockets: item.pole_pockets,
    pole_pocket_size: item.pole_pocket_size || null,
    pole_pocket_position: item.pole_pocket_position || null,
    pole_pocket_cost_cents: item.pole_pocket_cost_cents || 0,
    rope_feet: item.rope_feet || 0,
    rope_placement: item.rope_placement || null,
    rope_cost_cents: item.rope_cost_cents || 0,
    rounded_corners: item.rounded_corners || null,
    unit_price_cents: item.unit_price_cents,
    line_total_cents: item.line_total_cents,
    yard_sign_sidedness: item.yard_sign_sidedness || null,
    yard_sign_step_stakes_enabled: Boolean(item.yard_sign_step_stakes_enabled),
    yard_sign_step_stakes_qty: item.yard_sign_step_stakes_qty || 0,
    yard_sign_design_count: item.yard_sign_design_count || 0,
    yard_sign_designs: Array.isArray(item.yard_sign_designs)
      ? item.yard_sign_designs.map((design: any) => ({
          id: design.id,
          quantity: design.quantity,
          fileKey: design.fileKey || null,
          compositionSignature: design.compositionSignature
            || design.placementPreview?.compositionSignature
            || null,
          compositionRevision: design.placementPreview?.compositionRevision ?? null,
        }))
      : null,
    ...compactArtwork(item),
  })),
});

export const stripeCheckoutStorageKey = (signature: string): string => (
  `${STORAGE_PREFIX}:${hash(signature)}`
);

export const createCheckoutKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC 4122 v4 bits. This fallback exists for older Safari/WebViews.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }

  // Non-secure contexts are not eligible for wallet payments. This last
  // fallback keeps local development usable without weakening production.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const createStripeCheckoutState = (
  signature: string,
  now = Date.now(),
): StoredStripeCheckout => ({
  signature,
  checkoutKey: createCheckoutKey(),
  orderId: null,
  paymentIntentId: null,
  phase: 'idle',
  updatedAt: now,
});

export const readStripeCheckoutState = (
  signature: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof window !== 'undefined'
    ? window.sessionStorage
    : null,
  now = Date.now(),
): StoredStripeCheckout | null => {
  if (!storage) return null;
  const key = stripeCheckoutStorageKey(signature);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredStripeCheckout>;
    const valid = parsed.signature === signature
      && typeof parsed.checkoutKey === 'string'
      && parsed.checkoutKey.length >= 16
      && typeof parsed.updatedAt === 'number'
      && now - parsed.updatedAt <= STRIPE_CHECKOUT_STATE_TTL_MS
      && now >= parsed.updatedAt;
    if (!valid) {
      storage.removeItem(key);
      return null;
    }
    return {
      signature,
      checkoutKey: parsed.checkoutKey,
      orderId: typeof parsed.orderId === 'string' ? parsed.orderId : null,
      paymentIntentId: typeof parsed.paymentIntentId === 'string' ? parsed.paymentIntentId : null,
      phase: parsed.phase === 'confirming' || parsed.phase === 'verifying' || parsed.phase === 'requires_action'
        ? parsed.phase
        : 'idle',
      updatedAt: parsed.updatedAt,
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
};

export const writeStripeCheckoutState = (
  state: StoredStripeCheckout,
  storage: Pick<Storage, 'setItem'> | null = typeof window !== 'undefined'
    ? window.sessionStorage
    : null,
): void => {
  if (!storage) return;
  try {
    storage.setItem(stripeCheckoutStorageKey(state.signature), JSON.stringify(state));
  } catch {
    // Recovery persistence is best-effort; the server remains authoritative.
  }
};

export const clearStripeCheckoutState = (
  signature: string,
  storage: Pick<Storage, 'removeItem'> | null = typeof window !== 'undefined'
    ? window.sessionStorage
    : null,
): void => {
  try {
    storage?.removeItem(stripeCheckoutStorageKey(signature));
  } catch {
    // Nothing else is required when storage is unavailable.
  }
};
