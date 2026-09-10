import type { CartItem, DiscountCode } from '@/store/cart';
import { writeStoredAbandonedCartRecoveryAttribution } from '@/lib/abandonedCartCapture';
import {
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_SCOPE,
} from '@/lib/discount-resolver';

export const ABANDONED_CART_RECOVERY_QUERY_PARAM = 'recovery';
export const ABANDONED_CART_RECOVERY_ENDPOINT = '/.netlify/functions/recover-abandoned-cart';
export const ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY = 'bof-abandoned-cart-recovery-retry-v1';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RecoveredDiscountStatus = 'none' | 'applied' | 'unavailable';

export type AbandonedCartRecoveryOutcome =
  | {
      ok: true;
      status: 'restored';
      itemCount: number;
      discountStatus: RecoveredDiscountStatus;
      message: string;
    }
  | {
      ok: false;
      status: 'not_requested' | 'invalid_link' | 'expired' | 'closed' | 'empty' | 'incomplete' | 'unavailable';
      message: string;
    };

interface RestoreAbandonedCartOptions {
  token: string | null | undefined;
  replaceCartItems: (items: CartItem[]) => void | Promise<void>;
  applyValidatedDiscount: (discount: DiscountCode) => void | Promise<void>;
  restoreCheckoutPreferences?: (state: RecoveredCheckoutState) => void | Promise<void>;
  fetchImpl?: FetchLike;
  recoveryEndpoint?: string;
  discountValidationEndpoint?: string;
  requestTimeoutMs?: number;
  shouldApply?: () => boolean;
}

interface RecoveryEndpointPayload {
  success?: boolean;
  complete?: unknown;
  cartId?: unknown;
  recoveryToken?: unknown;
  items?: unknown;
  sourceItemCount?: unknown;
  storedItemCount?: unknown;
  checkoutState?: unknown;
  discountCode?: unknown;
  error?: unknown;
}

export type RecoveredCheckoutState = {
  sameDayHitService: boolean;
  saturdayDelivery: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RECOVERY_REQUEST_TIMEOUT_MS = 8_000;
const MAX_RECOVERY_TOKEN_LENGTH = 2_048;
const MAX_RECOVERY_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

async function fetchWithAbortTimeout(
  fetchImpl: FetchLike,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(25, Math.min(30_000, Math.round(timeoutMs)))
    : DEFAULT_RECOVERY_REQUEST_TIMEOUT_MS;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('RECOVERY_REQUEST_TIMEOUT'));
    }, boundedTimeoutMs);
  });
  try {
    return await Promise.race([
      fetchImpl(input, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

interface DiscountValidationPayload {
  valid?: boolean;
  discount?: unknown;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCartItemArray(value: unknown): value is CartItem[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => {
    if (!isRecord(item)) return false;
    return typeof item.id === 'string'
      && Number.isFinite(Number(item.width_in))
      && Number.isFinite(Number(item.height_in))
      && Number.isFinite(Number(item.quantity))
      && Number.isFinite(Number(item.line_total_cents))
      && typeof item.material === 'string';
  });
}

function isDiscountCode(value: unknown): value is DiscountCode {
  if (!isRecord(value)) return false;
  const baseValid = typeof value.id === 'string'
    && typeof value.code === 'string'
    && Number.isFinite(Number(value.discountPercentage))
    && typeof value.expiresAt === 'string';
  if (!baseValid) return false;
  if (value.discountScope !== LARGE_BANNER_RECOVERY_SCOPE) return true;
  return value.campaign === LARGE_BANNER_RECOVERY_CAMPAIGN
    && typeof value.recoveryCartId === 'string'
    && UUID_PATTERN.test(value.recoveryCartId)
    && Array.isArray(value.eligibleCartItemIds)
    && value.eligibleCartItemIds.length > 0
    && value.eligibleCartItemIds.every((id) => typeof id === 'string' && id.trim().length > 0)
    && Number.isSafeInteger(Number(value.maxDiscountAmountCents))
    && Number(value.maxDiscountAmountCents) > 0
    && typeof value.activatedAt === 'string';
}

function recoveredCheckoutState(value: unknown): RecoveredCheckoutState | null {
  if (!isRecord(value)) return null;
  const sameDayHitService = value.sameDayHitService === true;
  return {
    sameDayHitService,
    saturdayDelivery: sameDayHitService && value.saturdayDelivery === true,
  };
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) ? payload : {};
  } catch {
    return {};
  }
}

interface RecoveryLocationCredentials {
  queryToken: string;
  fragmentToken: string;
  hasRecoveryParameter: boolean;
}

function recoveryLocationCredentials(search?: string | URLSearchParams): RecoveryLocationCredentials | null {
  let queryParams: URLSearchParams;
  let fragmentParams: URLSearchParams;
  if (search instanceof URLSearchParams) {
    queryParams = search;
    fragmentParams = new URLSearchParams();
  } else {
    const source = search ?? (typeof window !== 'undefined' ? window.location.href : '');
    try {
      if (/^https?:\/\//i.test(source)) {
        const url = new URL(source);
        queryParams = url.searchParams;
        fragmentParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
      } else if (source.startsWith('#')) {
        queryParams = new URLSearchParams();
        fragmentParams = new URLSearchParams(source.slice(1));
      } else {
        queryParams = new URLSearchParams(source.startsWith('?') ? source.slice(1) : source);
        fragmentParams = new URLSearchParams();
      }
    } catch {
      return null;
    }
  }
  const queryToken = queryParams.get(ABANDONED_CART_RECOVERY_QUERY_PARAM)?.trim() || '';
  const fragmentToken = fragmentParams.get(ABANDONED_CART_RECOVERY_QUERY_PARAM)?.trim() || '';
  return {
    queryToken,
    fragmentToken,
    hasRecoveryParameter: queryParams.has(ABANDONED_CART_RECOVERY_QUERY_PARAM)
      || fragmentParams.has(ABANDONED_CART_RECOVERY_QUERY_PARAM),
  };
}

export function readAbandonedCartRecoveryToken(search?: string | URLSearchParams): string | null {
  const credentials = recoveryLocationCredentials(search);
  if (!credentials) return null;
  const { queryToken, fragmentToken } = credentials;
  // Two different credentials in one URL are ambiguous and fail closed.
  if (queryToken && fragmentToken && queryToken !== fragmentToken) return null;
  const token = fragmentToken || queryToken;
  return token && token.length <= MAX_RECOVERY_TOKEN_LENGTH ? token : null;
}

function resolveRetryStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function recoveryTokenExpiresAt(token: string, nowMs = Date.now()): number | null {
  if (!token || token.length > MAX_RECOVERY_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !/^[A-Za-z0-9_-]+$/.test(parts[0])) return null;
  try {
    const normalized = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded)) as unknown;
    if (!isRecord(payload)) return null;
    const keys = Object.keys(payload);
    const exp = Number(payload.exp);
    const nowSeconds = Math.floor(nowMs / 1000);
    if (
      payload.v !== 1
      || typeof payload.c !== 'string'
      || !UUID_PATTERN.test(payload.c)
      || typeof payload.s !== 'number'
      || !Number.isInteger(payload.s)
      || payload.s < 1
      || payload.s > 3
      || typeof payload.exp !== 'number'
      || !Number.isSafeInteger(exp)
      || exp <= nowSeconds
      || exp - nowSeconds > MAX_RECOVERY_TOKEN_LIFETIME_SECONDS
      || keys.some((key) => !['v', 'c', 's', 'exp'].includes(key))
    ) return null;
    return exp;
  } catch {
    return null;
  }
}

export function isAbandonedCartRecoveryTokenRetryable(token: string, nowMs = Date.now()): boolean {
  return recoveryTokenExpiresAt(token.trim(), nowMs) !== null;
}

export function clearStoredAbandonedCartRecoveryRetryToken(storage?: Storage | null): void {
  const target = resolveRetryStorage(storage);
  try {
    target?.removeItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browsing contexts.
  }
}

export function readStoredAbandonedCartRecoveryRetryToken(
  storage?: Storage | null,
  nowMs = Date.now(),
): string | null {
  const target = resolveRetryStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as unknown;
    if (!isRecord(stored) || typeof stored.token !== 'string') {
      clearStoredAbandonedCartRecoveryRetryToken(target);
      return null;
    }
    const token = stored.token.trim();
    const expiresAt = recoveryTokenExpiresAt(token, nowMs);
    if (expiresAt === null || Number(stored.expiresAt) !== expiresAt) {
      clearStoredAbandonedCartRecoveryRetryToken(target);
      return null;
    }
    return token;
  } catch {
    clearStoredAbandonedCartRecoveryRetryToken(target);
    return null;
  }
}

/**
 * Captures only a structurally valid fragment bearer into sessionStorage before
 * Checkout scrubs browser history. Query credentials remain one-shot. When the
 * URL has already been scrubbed, a still-valid retry credential is returned.
 */
export function prepareAbandonedCartRecoveryToken(options: {
  locationHref?: string;
  storage?: Storage | null;
  nowMs?: number;
} = {}): string | null {
  const href = options.locationHref ?? (typeof window !== 'undefined' ? window.location.href : '');
  const storage = resolveRetryStorage(options.storage);
  const nowMs = options.nowMs ?? Date.now();
  const credentials = recoveryLocationCredentials(href);
  const directToken = readAbandonedCartRecoveryToken(href);

  if (credentials?.hasRecoveryParameter) {
    // A new URL credential supersedes any older retry entry, including when
    // the new URL is empty, overlong, or ambiguous.
    clearStoredAbandonedCartRecoveryRetryToken(storage);
    if (
      directToken
      && credentials.fragmentToken === directToken
      && recoveryTokenExpiresAt(directToken, nowMs) !== null
    ) {
      const expiresAt = recoveryTokenExpiresAt(directToken, nowMs);
      try {
        storage?.setItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY, JSON.stringify({
          token: directToken,
          expiresAt,
        }));
      } catch {
        // Recovery can still make its one immediate attempt without storage.
      }
    }
    return directToken;
  }

  return readStoredAbandonedCartRecoveryRetryToken(storage, nowMs);
}

export function clearAbandonedCartRecoveryQuery(options: {
  locationHref?: string;
  replaceState?: (data: unknown, unused: string, url?: string | URL | null) => void;
} = {}): string | null {
  const href = options.locationHref ?? (typeof window !== 'undefined' ? window.location.href : '');
  if (!href) return null;
  try {
    const url = new URL(href);
    url.searchParams.delete(ABANDONED_CART_RECOVERY_QUERY_PARAM);
    url.searchParams.delete('recovery_token');
    // Retired unsigned parameters must not linger and must never be treated as
    // authority to restore a cart or apply a discount.
    url.searchParams.delete('recover_cart');
    url.searchParams.delete('cart');
    url.searchParams.delete('discount');
    const rawFragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    if (rawFragment) {
      const retiredKeys = new Set(['recovery', 'recovery_token', 'recover_cart', 'cart', 'discount']);
      const remainingFragment = rawFragment.split('&').filter((segment) => {
        const rawKey = segment.split('=', 1)[0] || '';
        let key = rawKey;
        try { key = decodeURIComponent(rawKey.replace(/\+/g, ' ')); } catch { /* preserve malformed anchors */ }
        return !retiredKeys.has(key);
      }).join('&');
      url.hash = remainingFragment ? `#${remainingFragment}` : '';
    }
    const relativeUrl = `${url.pathname}${url.search}${url.hash}`;
    const replaceState = options.replaceState
      ?? (typeof window !== 'undefined' ? window.history.replaceState.bind(window.history) : null);
    const historyState = typeof window !== 'undefined' ? window.history.state : null;
    replaceState?.(historyState, '', relativeUrl);
    return relativeUrl;
  } catch {
    return null;
  }
}

function failureForRecoveryResponse(status: number, error: unknown): AbandonedCartRecoveryOutcome {
  if (status === 401 || error === 'INVALID_RECOVERY_LINK') {
    return { ok: false, status: 'invalid_link', message: 'This cart recovery link is invalid.' };
  }
  if (error === 'RECOVERY_LINK_EXPIRED') {
    return { ok: false, status: 'expired', message: 'This cart recovery link has expired.' };
  }
  if (error === 'RECOVERY_CART_CLOSED' || status === 404) {
    return { ok: false, status: 'closed', message: 'This cart is no longer available for recovery.' };
  }
  if (error === 'RECOVERY_CART_EMPTY' || status === 422) {
    return { ok: false, status: 'empty', message: 'There are no recoverable items in this cart.' };
  }
  if (error === 'RECOVERY_CART_COMPLETENESS_UNKNOWN') {
    return {
      ok: false,
      status: 'incomplete',
      message: 'We could not verify that this older saved cart is complete, so it was not restored. Please rebuild your cart or contact support.',
    };
  }
  if (error === 'RECOVERY_CART_INCOMPLETE') {
    return {
      ok: false,
      status: 'incomplete',
      message: 'This saved cart is incomplete, so it was not restored. Please rebuild your cart or contact support.',
    };
  }
  return { ok: false, status: 'unavailable', message: 'Cart recovery is temporarily unavailable.' };
}

export async function restoreAbandonedCartFromToken({
  token,
  replaceCartItems,
  applyValidatedDiscount,
  restoreCheckoutPreferences,
  fetchImpl = globalThis.fetch,
  recoveryEndpoint = ABANDONED_CART_RECOVERY_ENDPOINT,
  discountValidationEndpoint = '/.netlify/functions/validate-discount-code',
  requestTimeoutMs = DEFAULT_RECOVERY_REQUEST_TIMEOUT_MS,
  shouldApply = () => true,
}: RestoreAbandonedCartOptions): Promise<AbandonedCartRecoveryOutcome> {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) {
    return { ok: false, status: 'not_requested', message: 'No cart recovery link was provided.' };
  }
  if (normalizedToken.length > 2048 || typeof fetchImpl !== 'function') {
    return { ok: false, status: 'invalid_link', message: 'This cart recovery link is invalid.' };
  }

  let response: Response;
  let recoveryPayload: RecoveryEndpointPayload;
  try {
    response = await fetchWithAbortTimeout(fetchImpl, recoveryEndpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: normalizedToken }),
    }, requestTimeoutMs);
    recoveryPayload = await parseJson(response) as RecoveryEndpointPayload;
  } catch {
    return { ok: false, status: 'unavailable', message: 'Cart recovery is temporarily unavailable.' };
  }

  if (!response.ok) return failureForRecoveryResponse(response.status, recoveryPayload.error);
  const recoveredCartId = typeof recoveryPayload.cartId === 'string'
    ? recoveryPayload.cartId.trim().toLowerCase()
    : '';
  const sourceItemCount = Number(recoveryPayload.sourceItemCount);
  const storedItemCount = Number(recoveryPayload.storedItemCount);
  if (
    recoveryPayload.success !== true
    || recoveryPayload.complete !== true
    || !UUID_PATTERN.test(recoveredCartId)
    || recoveryPayload.recoveryToken !== normalizedToken
    || !isCartItemArray(recoveryPayload.items)
    || !Number.isSafeInteger(sourceItemCount)
    || !Number.isSafeInteger(storedItemCount)
    || sourceItemCount !== storedItemCount
    || storedItemCount !== recoveryPayload.items.length
  ) {
    return {
      ok: false,
      status: 'incomplete',
      message: 'We could not verify that every saved item is present, so this cart was not restored. Please rebuild your cart or contact support.',
    };
  }

  // Account changes, checkout navigation, or a winning payment can revoke the
  // startup attempt while its network request is in flight. Never let that
  // stale response replace the newly authoritative cart.
  if (!shouldApply()) {
    return { ok: false, status: 'closed', message: 'This cart recovery attempt was canceled.' };
  }

  // Establish signed ownership before replacing items. Replacement immediately
  // syncs a nonempty snapshot, including on a brand-new device/session; that
  // first request must carry the original emailed cart identity so the server
  // can reactivate/rebind it instead of creating a duplicate recovery row.
  writeStoredAbandonedCartRecoveryAttribution({
    cartId: recoveredCartId,
    token: normalizedToken,
  });
  try {
    await replaceCartItems(recoveryPayload.items);
    if (!shouldApply()) {
      writeStoredAbandonedCartRecoveryAttribution(null);
      return { ok: false, status: 'closed', message: 'This cart recovery attempt was canceled.' };
    }
    const checkoutState = recoveredCheckoutState(recoveryPayload.checkoutState);
    if (checkoutState && restoreCheckoutPreferences) {
      await restoreCheckoutPreferences(checkoutState);
    }
  } catch {
    writeStoredAbandonedCartRecoveryAttribution(null);
    return { ok: false, status: 'unavailable', message: 'The recovered cart could not be saved.' };
  }

  const discountCode = typeof recoveryPayload.discountCode === 'string'
    ? recoveryPayload.discountCode.trim()
    : '';
  if (!discountCode) {
    return {
      ok: true,
      status: 'restored',
      itemCount: recoveryPayload.items.length,
      discountStatus: 'none',
      message: 'Your cart has been restored.',
    };
  }

  try {
    const discountResponse = await fetchWithAbortTimeout(fetchImpl, discountValidationEndpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      // Bind UI auto-application to the exact cart proven by the signed
      // recovery endpoint. Payment repeats this check against the persisted
      // pending order; the browser is never price authority.
      body: JSON.stringify({ code: discountCode, cartId: recoveredCartId }),
    }, requestTimeoutMs);
    const validation = await parseJson(discountResponse) as DiscountValidationPayload;
    if (discountResponse.ok
        && validation.valid === true
        && isDiscountCode(validation.discount)
        && (!validation.discount.recoveryCartId
          || validation.discount.recoveryCartId.toLowerCase() === recoveredCartId)) {
      await applyValidatedDiscount(validation.discount);
      return {
        ok: true,
        status: 'restored',
        itemCount: recoveryPayload.items.length,
        discountStatus: 'applied',
        message: 'Your cart and recovery discount have been restored.',
      };
    }
  } catch {
    // The cart is still safe to restore when a linked code expires between
    // opening the email and validation at checkout.
  }

  return {
    ok: true,
    status: 'restored',
    itemCount: recoveryPayload.items.length,
    discountStatus: 'unavailable',
    message: 'Your cart was restored, but the recovery discount is no longer available.',
  };
}
