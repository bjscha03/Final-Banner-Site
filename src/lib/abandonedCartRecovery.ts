import type { CartItem, DiscountCode } from '@/store/cart';
import { writeStoredAbandonedCartRecoveryAttribution } from '@/lib/abandonedCartCapture';

export const ABANDONED_CART_RECOVERY_QUERY_PARAM = 'recovery';
export const ABANDONED_CART_RECOVERY_ENDPOINT = '/.netlify/functions/recover-abandoned-cart';

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
  fetchImpl?: FetchLike;
  recoveryEndpoint?: string;
  discountValidationEndpoint?: string;
  requestTimeoutMs?: number;
}

interface RecoveryEndpointPayload {
  success?: boolean;
  complete?: unknown;
  cartId?: unknown;
  recoveryToken?: unknown;
  items?: unknown;
  sourceItemCount?: unknown;
  storedItemCount?: unknown;
  discountCode?: unknown;
  error?: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RECOVERY_REQUEST_TIMEOUT_MS = 8_000;

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
  return typeof value.id === 'string'
    && typeof value.code === 'string'
    && Number.isFinite(Number(value.discountPercentage))
    && typeof value.expiresAt === 'string';
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) ? payload : {};
  } catch {
    return {};
  }
}

export function readAbandonedCartRecoveryToken(search?: string | URLSearchParams): string | null {
  let params: URLSearchParams;
  if (search instanceof URLSearchParams) {
    params = search;
  } else {
    const source = search ?? (typeof window !== 'undefined' ? window.location.search : '');
    try {
      if (/^https?:\/\//i.test(source)) params = new URL(source).searchParams;
      else params = new URLSearchParams(source.startsWith('?') ? source.slice(1) : source);
    } catch {
      return null;
    }
  }
  const token = params.get(ABANDONED_CART_RECOVERY_QUERY_PARAM)?.trim() || '';
  return token && token.length <= 2048 ? token : null;
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
  fetchImpl = globalThis.fetch,
  recoveryEndpoint = ABANDONED_CART_RECOVERY_ENDPOINT,
  discountValidationEndpoint = '/.netlify/functions/validate-discount-code',
  requestTimeoutMs = DEFAULT_RECOVERY_REQUEST_TIMEOUT_MS,
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
      // The signed recovery endpoint is the only authority for this code. Do
      // not forward URL parameters, an email address, or a user id here.
      body: JSON.stringify({ code: discountCode }),
    }, requestTimeoutMs);
    const validation = await parseJson(discountResponse) as DiscountValidationPayload;
    if (discountResponse.ok && validation.valid === true && isDiscountCode(validation.discount)) {
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
