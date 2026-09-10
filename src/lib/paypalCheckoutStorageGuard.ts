const STORAGE_PREFIX = 'paypal-checkout:';
const TAB_ID_KEY = 'bof-paypal-tab-id';
const VISIT_ID_KEY = 'bof-paypal-checkout-visit-id';
const CHECKOUT_ACTIVE_KEY = 'bof-paypal-checkout-active';
const STATE_VERSION = 2;
const RECEIVED_TTL_MS = 30 * 60 * 1000;

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isCheckoutPath = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/checkout';
};

const getTabId = (): string => {
  const existing = sessionStorage.getItem(TAB_ID_KEY);
  if (existing) return existing;
  const created = randomId();
  sessionStorage.setItem(TAB_ID_KEY, created);
  return created;
};

const syncCheckoutVisit = (): string | null => {
  const onCheckout = isCheckoutPath();
  const wasOnCheckout = sessionStorage.getItem(CHECKOUT_ACTIVE_KEY) === '1';

  if (!onCheckout) {
    if (wasOnCheckout) {
      sessionStorage.removeItem(VISIT_ID_KEY);
      sessionStorage.removeItem(CHECKOUT_ACTIVE_KEY);
    }
    return null;
  }

  let visitId = sessionStorage.getItem(VISIT_ID_KEY);
  if (!wasOnCheckout || !visitId) {
    visitId = randomId();
    sessionStorage.setItem(VISIT_ID_KEY, visitId);
  }
  sessionStorage.setItem(CHECKOUT_ACTIVE_KEY, '1');
  return visitId;
};

/**
 * Protects checkout payment state from leaking into a later cart that happens
 * to have the same dimensions and price. The legacy PayPal component stores
 * state under a cart-derived localStorage key and can remount at responsive
 * breakpoints. This guard adds tab + checkout-visit identity and removes legacy
 * values that cannot be proven to belong to the current checkout visit.
 */
export function installPayPalCheckoutStorageGuard(): void {
  if (typeof window === 'undefined' || typeof Storage === 'undefined') return;
  if ((window as any).__PAYPAL_CHECKOUT_STORAGE_GUARD__) return;
  (window as any).__PAYPAL_CHECKOUT_STORAGE_GUARD__ = true;

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const tabId = getTabId();

  const normalizeRouteState = () => {
    syncCheckoutVisit();
  };

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = ((...args: Parameters<History['pushState']>) => {
    const result = originalPushState(...args);
    queueMicrotask(normalizeRouteState);
    return result;
  }) as History['pushState'];

  history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    const result = originalReplaceState(...args);
    queueMicrotask(normalizeRouteState);
    return result;
  }) as History['replaceState'];

  window.addEventListener('popstate', normalizeRouteState);
  normalizeRouteState();

  Storage.prototype.setItem = function guardedSetItem(key: string, value: string): void {
    if (this === window.localStorage && key.startsWith(STORAGE_PREFIX)) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          const visitId = syncCheckoutVisit();
          value = JSON.stringify({
            ...parsed,
            __storageVersion: STATE_VERSION,
            __updatedAt: Date.now(),
            __tabId: tabId,
            __visitId: visitId,
          });
        }
      } catch {
        // Leave malformed values untouched; guarded getItem removes them.
      }
    }
    originalSetItem.call(this, key, value);
  };

  Storage.prototype.getItem = function guardedGetItem(key: string): string | null {
    const raw = originalGetItem.call(this, key);
    if (this !== window.localStorage || !key.startsWith(STORAGE_PREFIX) || !raw) {
      return raw;
    }

    try {
      const parsed = JSON.parse(raw);
      const visitId = syncCheckoutVisit();

      // All values created before this guard are untrusted. They are the source
      // of the false “payment received” state seen before payment entry.
      if (parsed?.__storageVersion !== STATE_VERSION) {
        originalRemoveItem.call(this, key);
        return null;
      }

      if (!visitId || parsed.__tabId !== tabId || parsed.__visitId !== visitId) {
        originalRemoveItem.call(this, key);
        return null;
      }

      const age = Date.now() - Number(parsed.__updatedAt || 0);
      if (!Number.isFinite(age) || age < 0) {
        originalRemoveItem.call(this, key);
        return null;
      }

      if (parsed.received === true) {
        if (!parsed.internalOrderId || age > RECEIVED_TTL_MS) {
          originalRemoveItem.call(this, key);
          return null;
        }
        return raw;
      }

      // The current component incorrectly treats “processing” as if PayPal
      // already confirmed receipt. Never restore that transient bit after a
      // responsive remount. Server-side capture idempotency remains authoritative.
      if (parsed.processing === true) {
        const sanitized = {
          ...parsed,
          processing: false,
          received: false,
          __updatedAt: Date.now(),
        };
        const serialized = JSON.stringify(sanitized);
        originalSetItem.call(this, key, serialized);
        return serialized;
      }

      return raw;
    } catch {
      originalRemoveItem.call(this, key);
      return null;
    }
  };

  // Purge legacy/untrusted keys immediately so the current page is clean even
  // before a responsive remount occurs.
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) {
      Storage.prototype.getItem.call(window.localStorage, key);
    }
  }
}
