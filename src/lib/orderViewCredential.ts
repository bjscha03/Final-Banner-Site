const ORDER_VIEW_FRAGMENT_PARAM = 'orderView';
const ORDER_VIEW_STORAGE_PREFIX = 'botf.order-view.';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 4096;
const memoryTokens = new Map<string, string>();

type BrowserLike = {
  location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  history: Pick<History, 'replaceState' | 'state'>;
  sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
};

const storageKey = (orderId: string) =>
  `${ORDER_VIEW_STORAGE_PREFIX}${String(orderId || '').trim()}`;

const validToken = (value: unknown): value is string => {
  const token = String(value || '').trim();
  return Boolean(token && token.length <= MAX_TOKEN_LENGTH && TOKEN_PATTERN.test(token));
};

/**
 * Consumes the signed credential from the email URL fragment. Fragments are
 * never sent in HTTP requests; after reading it we remove it from the address
 * bar and retain it only for this browser tab so refresh still works.
 */
export function consumeOrderViewCredential(
  orderId: string,
  browser: BrowserLike | null = typeof window === 'undefined' ? null : window,
): string | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!browser || !normalizedOrderId) return null;

  const key = storageKey(normalizedOrderId);
  const params = new URLSearchParams(String(browser.location.hash || '').replace(/^#/, ''));
  const fragmentValue = params.get(ORDER_VIEW_FRAGMENT_PARAM);

  if (fragmentValue !== null) {
    params.delete(ORDER_VIEW_FRAGMENT_PARAM);
    const remainingHash = params.toString();
    const cleanUrl = `${browser.location.pathname}${browser.location.search}${remainingHash ? `#${remainingHash}` : ''}`;
    browser.history.replaceState(browser.history.state, '', cleanUrl);

    if (validToken(fragmentValue)) {
      memoryTokens.set(key, fragmentValue);
      try { browser.sessionStorage.setItem(key, fragmentValue); } catch { /* storage is optional */ }
      return fragmentValue;
    }
    memoryTokens.delete(key);
    try { browser.sessionStorage.removeItem(key); } catch { /* storage is optional */ }
    return null;
  }

  try {
    const stored = browser.sessionStorage.getItem(key);
    if (validToken(stored)) {
      memoryTokens.set(key, stored);
      return stored;
    }
    if (stored) browser.sessionStorage.removeItem(key);
  } catch { /* storage is optional */ }
  const inMemory = memoryTokens.get(key);
  if (validToken(inMemory)) return inMemory;
  return null;
}

export function consumeOrderViewCredentialFromCurrentRoute(
  browser: BrowserLike | null = typeof window === 'undefined' ? null : window,
): string | null {
  if (!browser) return null;
  const match = /^\/orders\/([^/]+)\/?$/.exec(String(browser.location.pathname || ''));
  if (!match) return null;
  try {
    return consumeOrderViewCredential(decodeURIComponent(match[1]), browser);
  } catch {
    return null;
  }
}

export const _test = { ORDER_VIEW_FRAGMENT_PARAM, storageKey, validToken };
