export const SITE_ISSUE_KINDS = ['upload_error', 'upload_timeout', 'upload_preview_error', 'checkout_error', 'checkout_load_error', 'page_error', 'page_crash', 'monitor_test'] as const;
export type SiteIssueKind = typeof SITE_ISSUE_KINDS[number];
export type SiteIssue = {
  id: string; kind: SiteIssueKind; occurredAt: string; receivedAt: string;
  page: string; sessionId: string; traffic: 'customer' | 'test';
  device: string; browser: string; os: string; online: boolean;
  details: Record<string, string | number | boolean>;
  status: 'new' | 'reviewed'; reviewedAt?: string; deployId: string;
};
export type SiteIssueInput = Omit<SiteIssue, 'receivedAt' | 'status' | 'reviewedAt' | 'deployId' | 'device' | 'browser' | 'os'>;
export const ISSUE_LABELS: Record<SiteIssueKind, string> = {
  upload_error: 'Artwork upload failed', upload_timeout: 'Artwork upload stalled', upload_preview_error: 'Artwork preview failed',
  checkout_error: 'Checkout error', checkout_load_error: 'Payment form did not load',
  page_error: 'Page script error', page_crash: 'Page crashed', monitor_test: 'Monitoring test',
};
const PAGES = new Set(['/', '/design', '/google-ads-banner', '/large-banners-fast', '/halloween-banner', '/checkout', '/cart', '/yard-signs', '/yard-sign-designer', '/design/complete', '/admin/site-issues']);
export function issuePage(value: unknown): string {
  const path = typeof value === 'string' ? value.split(/[?#]/)[0].replace(/\/$/, '') || '/' : '/other';
  return PAGES.has(path) ? path : '/other';
}
// Deliberately accept codes only: never error messages, artwork names/URLs,
// customer input, query strings, payment IDs, stack text or credentials.
export function issueDetails(input: unknown): SiteIssue['details'] {
  const result: SiteIssue['details'] = {};
  if (!input || typeof input !== 'object') return result;
  const values = input as Record<string, unknown>;
  for (const key of ['phase', 'status', 'mimeType', 'sizeBucket', 'provider', 'method', 'stage', 'code', 'errorName', 'correlationId', 'transport']) {
    const value = values[key];
    if (typeof value === 'string' && /^[A-Za-z0-9_.<>+\/-]{1,100}$/.test(value)) result[key] = value;
    if (key === 'status' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 599) result[key] = value;
  }
  for (const key of ['durationMs', 'line', 'column']) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000) result[key] = Math.round(value);
  }
  if (typeof values.retryable === 'boolean') result.retryable = values.retryable;
  if (typeof values.source === 'string' && /^\/assets\/[A-Za-z0-9_.-]{1,140}\.js$/.test(values.source)) result.source = values.source;
  return result;
}
export function deviceInfo(agent: string) {
  return {
    device: /iPad|Tablet/i.test(agent) ? 'Tablet' : /Mobi|iPhone|Android/i.test(agent) ? 'Mobile' : 'Desktop',
    browser: /GSA\//.test(agent) ? 'Google app' : /Edg\//.test(agent) ? 'Edge' : /CriOS|Chrome/.test(agent) ? 'Chrome' : /FxiOS|Firefox/.test(agent) ? 'Firefox' : /Safari/.test(agent) ? 'Safari' : 'Other',
    os: /iPhone|iPad|iPod/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Windows/.test(agent) ? 'Windows' : /Macintosh/.test(agent) ? 'macOS' : 'Other',
  };
}
