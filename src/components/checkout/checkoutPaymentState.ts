export const ACTIVE_CHECKOUT_STORAGE_KEY = 'botf_active_checkout_v1';
export const ACTIVE_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

export type CheckoutPaymentProvider = 'stripe' | 'paypal';
export type CheckoutPaymentPhase = 'authorizing' | 'processing' | 'verifying' | 'requires_action';

/**
 * Provider-neutral payment marker. It is deliberately not keyed by the cart:
 * a cart sync, Back navigation, or a paid-order cart clear must not hide an
 * authorization whose outcome is still unknown.
 */
export type ActiveCheckoutMarker = {
  provider: CheckoutPaymentProvider;
  checkoutKey: string;
  phase: CheckoutPaymentPhase;
  orderId?: string | null;
  paymentIntentId?: string | null;
  totalCents?: number | null;
  updatedAt: number;
};

export type CheckoutPaymentStateEvent = Omit<ActiveCheckoutMarker, 'updatedAt'> & {
  active: boolean;
};

const isValidMarker = (value: Partial<ActiveCheckoutMarker>, now: number): value is ActiveCheckoutMarker => (
  (value.provider === 'stripe' || value.provider === 'paypal')
  && typeof value.checkoutKey === 'string'
  && value.checkoutKey.length >= 16
  && ['authorizing', 'processing', 'verifying', 'requires_action'].includes(String(value.phase))
  && typeof value.updatedAt === 'number'
  && now >= value.updatedAt
  && now - value.updatedAt <= ACTIVE_CHECKOUT_TTL_MS
);

export const readActiveCheckoutMarker = (
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof window !== 'undefined'
    ? window.sessionStorage
    : null,
  now = Date.now(),
): ActiveCheckoutMarker | null => {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(ACTIVE_CHECKOUT_STORAGE_KEY) || 'null') as Partial<ActiveCheckoutMarker> | null;
    if (!parsed || !isValidMarker(parsed, now)) {
      if (parsed) storage.removeItem(ACTIVE_CHECKOUT_STORAGE_KEY);
      return null;
    }
    return {
      provider: parsed.provider,
      checkoutKey: parsed.checkoutKey,
      phase: parsed.phase,
      orderId: typeof parsed.orderId === 'string' ? parsed.orderId : null,
      paymentIntentId: typeof parsed.paymentIntentId === 'string' ? parsed.paymentIntentId : null,
      totalCents: typeof parsed.totalCents === 'number'
        && Number.isInteger(parsed.totalCents)
        && parsed.totalCents > 0
        ? Number(parsed.totalCents)
        : null,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    storage.removeItem(ACTIVE_CHECKOUT_STORAGE_KEY);
    return null;
  }
};

export const writeActiveCheckoutMarker = (
  event: Omit<ActiveCheckoutMarker, 'updatedAt'>,
  storage: Pick<Storage, 'setItem'> | null = typeof window !== 'undefined'
    ? window.sessionStorage
    : null,
  now = Date.now(),
): ActiveCheckoutMarker => {
  const marker: ActiveCheckoutMarker = { ...event, updatedAt: now };
  try {
    storage?.setItem(ACTIVE_CHECKOUT_STORAGE_KEY, JSON.stringify(marker));
  } catch {
    // The in-memory Checkout lock remains active when storage is unavailable.
  }
  return marker;
};

export const clearActiveCheckoutMarker = (
  expectedCheckoutKey?: string | null,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof window !== 'undefined'
    ? window.sessionStorage
    : null,
): void => {
  if (!storage) return;
  try {
    if (expectedCheckoutKey) {
      const current = JSON.parse(storage.getItem(ACTIVE_CHECKOUT_STORAGE_KEY) || 'null');
      if (current?.checkoutKey && current.checkoutKey !== expectedCheckoutKey) return;
    }
    storage.removeItem(ACTIVE_CHECKOUT_STORAGE_KEY);
  } catch {
    storage.removeItem(ACTIVE_CHECKOUT_STORAGE_KEY);
  }
};
