const PREFIX = 'botf_order_confirmation_v1';
export const ORDER_CONFIRMATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const keyFor = (orderId: string) => `${PREFIX}:${orderId}`;

export const storeOrderConfirmationToken = (
  orderId: string,
  token: string,
  storage: Pick<Storage, 'setItem'> | null = typeof window !== 'undefined' ? window.sessionStorage : null,
  now = Date.now(),
): void => {
  if (!orderId || !token) return;
  try {
    storage?.setItem(keyFor(orderId), JSON.stringify({ token, updatedAt: now }));
  } catch {
    // Navigation state remains the immediate fallback when storage is blocked.
  }
};

export const readOrderConfirmationToken = (
  orderId: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof window !== 'undefined' ? window.sessionStorage : null,
  now = Date.now(),
): string | null => {
  if (!orderId || !storage) return null;
  const key = keyFor(orderId);
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    const valid = typeof parsed?.token === 'string'
      && parsed.token.length >= 16
      && typeof parsed.updatedAt === 'number'
      && now >= parsed.updatedAt
      && now - parsed.updatedAt <= ORDER_CONFIRMATION_TOKEN_TTL_MS;
    if (!valid) {
      if (parsed) storage.removeItem(key);
      return null;
    }
    return parsed.token;
  } catch {
    storage.removeItem(key);
    return null;
  }
};

export const removeOrderConfirmationToken = (
  orderId: string,
  storage: Pick<Storage, 'removeItem'> | null = typeof window !== 'undefined' ? window.sessionStorage : null,
): void => {
  if (!orderId) return;
  try {
    storage?.removeItem(keyFor(orderId));
  } catch {
    // Expiry remains a bounded fallback.
  }
};
