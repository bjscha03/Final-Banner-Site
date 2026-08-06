import { isProductionHost } from './environment';

export type TrackingExclusionReason =
  | 'server_render'
  | 'non_production_host'
  | 'non_https_production'
  | 'excluded_route'
  | 'internal_device'
  | 'automated_browser'
  | 'known_bot';

export type TrackingDecision = {
  allowed: boolean;
  reason: TrackingExclusionReason | null;
};

export type TrackingContext = {
  hostname: string;
  pathname: string;
  protocol: string;
  webdriver: boolean;
  userAgent: string;
};

const NON_CUSTOMER_PATHS = [
  '/admin',
  '/canva-test',
  '/logo-showcase',
  '/pdf-diagnostic',
] as const;

// Keep this deliberately conservative. Search crawlers and browser-based
// synthetic checks are not customer sessions; broad device/browser matching
// would risk excluding real shoppers.
const NON_CUSTOMER_USER_AGENT = /(?:headlesschrome|lighthouse|pagespeed|googlebot|bingbot|duckduckbot|baiduspider|yandexbot|crawler|spider)/i;
const INTERNAL_TRAFFIC_STORAGE_KEY = 'botf_internal_traffic_device';

export const markCurrentDeviceAsInternal = (): void => {
  try {
    localStorage.setItem(INTERNAL_TRAFFIC_STORAGE_KEY, '1');
  } catch (_error) {
    // GA4's office-IP filter remains the fallback when storage is unavailable.
  }
};

export const isCurrentDeviceInternal = (): boolean => {
  try {
    return localStorage.getItem(INTERNAL_TRAFFIC_STORAGE_KEY) === '1';
  } catch (_error) {
    return false;
  }
};

const isExcludedPath = (pathname: string): boolean => NON_CUSTOMER_PATHS.some(
  (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
);

const getBrowserContext = (): TrackingContext | null => {
  if (typeof window === 'undefined') return null;
  return {
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    protocol: window.location.protocol,
    webdriver: Boolean(window.navigator?.webdriver),
    userAgent: window.navigator?.userAgent || '',
  };
};

export const getTrackingDecision = (context: TrackingContext | null = getBrowserContext()): TrackingDecision => {
  if (!context) return { allowed: false, reason: 'server_render' };
  if (!isProductionHost(context.hostname)) return { allowed: false, reason: 'non_production_host' };
  if (context.protocol !== 'https:') return { allowed: false, reason: 'non_https_production' };
  if (isExcludedPath(context.pathname)) return { allowed: false, reason: 'excluded_route' };
  if (isCurrentDeviceInternal()) return { allowed: false, reason: 'internal_device' };
  if (context.webdriver) return { allowed: false, reason: 'automated_browser' };
  if (NON_CUSTOMER_USER_AGENT.test(context.userAgent)) return { allowed: false, reason: 'known_bot' };
  return { allowed: true, reason: null };
};

export const isCustomerTrackingAllowed = (): boolean => getTrackingDecision().allowed;

const SENSITIVE_QUERY_KEYS = new Set([
  'code',
  'email',
  'key',
  'orderid',
  'session',
  'token',
]);

/**
 * Remove identifiers and auth/payment tokens from analytics page URLs while
 * retaining campaign and product-selection parameters used for attribution.
 */
export const getSanitizedAnalyticsPath = (url: Pick<Location, 'pathname' | 'search'>): string => {
  let pathname = url.pathname || '/';
  if (pathname.startsWith('/orders/')) pathname = '/orders/[order-id]';

  const params = new URLSearchParams(url.search || '');
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) params.delete(key);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};
