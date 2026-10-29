export const SITE_ISSUE_KINDS = ['upload_error', 'upload_timeout', 'upload_preview_error', 'checkout_error', 'checkout_load_error', 'page_error', 'page_crash', 'monitor_test'] as const;
export type SiteIssueKind = typeof SITE_ISSUE_KINDS[number];
export type SiteIssue = {
  id: string; kind: SiteIssueKind; occurredAt: string; receivedAt: string;
  page: string; sessionId: string; traffic: 'customer' | 'test' | 'crawler';
  device: string; browser: string; os: string; online: boolean;
  details: Record<string, string | number | boolean>;
  status: 'new' | 'reviewed' | 'resolved' | 'archived'; reviewedAt?: string; resolvedAt?: string; resolution?: string; deployId: string;
};
export type SiteIssueInput = Omit<SiteIssue, 'receivedAt' | 'status' | 'reviewedAt' | 'resolvedAt' | 'resolution' | 'deployId' | 'device' | 'browser' | 'os'>;
export const ISSUE_LABELS: Record<SiteIssueKind, string> = {
  upload_error: 'Artwork upload failed', upload_timeout: 'Artwork upload stalled', upload_preview_error: 'Artwork preview failed',
  checkout_error: 'Checkout error', checkout_load_error: 'Payment form did not load',
  page_error: 'Page script error', page_crash: 'Page crashed', monitor_test: 'Monitoring test',
};
// Only explicit crawler product tokens qualify. Browser version, viewport,
// missing device information and headless mode cannot identify a crawler.
export function knownIssueCrawler(agent: string): string | null {
  const token = agent.match(/(?:^|[\s;(])((?:Googlebot(?:-\w+)?|GoogleOther(?:-\w+)?|AdsBot-Google(?:-Mobile)?|Mediapartners-Google|bingbot|BingPreview|DuckDuckBot|Applebot|facebookexternalhit|meta-externalads|meta-externalagent|Twitterbot|LinkedInBot))(?:[/\s;)]|$)/i)?.[1];
  return token?.toLowerCase() || null;
}
export function isOpenCustomerIssue(issue: Pick<SiteIssue, 'status' | 'traffic'>): boolean {
  return issue.traffic === 'customer' && (issue.status === 'new' || issue.status === 'reviewed');
}
// Preserve storefront routes without query strings or customer/order identifiers.
export function issuePage(value: unknown): string {
  const path = typeof value === 'string' ? value.split(/[?#]/)[0].replace(/\/$/, '') || '/' : '/other';
  if (!/^\/[A-Za-z0-9_./%-]{0,240}$/.test(path)) return '/other';
  return path.split('/').map(segment => /@|%40|%2f|%3f|%3d/i.test(segment) || /[a-f0-9]{20,}|\d{6,}|BOF-\d+/i.test(segment) ? 'redacted' : segment).join('/');
}
export function diagnosticText(value: unknown, limit = 1000): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, 16000)
    .replace(/(?:https?:\/\/|blob:|data:)[^\s)]+/gi, raw => {
      try { const url = new URL(raw); return /^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|mjs)(?::\d+:\d+)?$/.test(url.pathname) ? url.pathname : '[url]'; } catch { return '[url]'; }
    })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:Bearer\s+\S+|(?:sk|pk|pi|cs|seti|pm)_[A-Za-z0-9_]+)\b/gi, '[secret]')
    .replace(/\b(?:token|password|secret|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, '[secret]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[number]')
    .replace(/[?&][^\s)]+/g, '[query]')
    .slice(0, limit);
}
export function issueDetails(input: unknown): SiteIssue['details'] {
  const result: SiteIssue['details'] = {};
  if (!input || typeof input !== 'object') return result;
  const values = input as Record<string, unknown>;
  for (const key of ['phase', 'status', 'mimeType', 'reportedMimeType', 'fileExtension', 'sizeBucket', 'provider', 'method', 'stage', 'code', 'errorName', 'correlationId', 'transport', 'field', 'event', 'browserVersion', 'clientBuild', 'requestId', 'operation', 'recovery', 'assetHost', 'action', 'product', 'crawler']) {
    const value = values[key];
    if (typeof value === 'string' && /^[A-Za-z0-9_.<>+/-]{1,100}$/.test(value)) result[key] = value;
    if (key === 'status' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 599) result[key] = value;
  }
  for (const key of ['durationMs', 'line', 'column', 'attempt', 'chunkIndex', 'chunkCount', 'expectedTotalCents', 'serverTotalCents', 'viewportWidth', 'viewportHeight']) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000) result[key] = Math.round(value);
  }
  for (const key of ['fileBytes', 'fileLimitBytes']) {
    const value = values[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 5 * 1024 * 1024 * 1024) result[key] = value;
  }
  for (const [key, limit] of Object.entries({ errorMessage: 1000, stack: 3000, componentStack: 1500, breadcrumbs: 1500 })) {
    const text = diagnosticText(values[key], limit); if (text) result[key] = text;
  }
  for (const key of ['retryable', 'canonicalQuoteApplied', 'recoveryAttempted']) if (typeof values[key] === 'boolean') result[key] = values[key];
  if (typeof values.source === 'string' && /^\/assets\/[A-Za-z0-9_.-]{1,140}\.(?:js|css|mjs)$/.test(values.source)) result.source = values.source;
  return result;
}
export function deviceInfo(agent: string) {
  return {
    device: /iPad|Tablet/i.test(agent) ? 'Tablet' : /Mobi|iPhone|Android/i.test(agent) ? 'Mobile' : 'Desktop',
    browser: /GSA\//.test(agent) ? 'Google app' : /Edg\//.test(agent) ? 'Edge' : /CriOS|Chrome/.test(agent) ? 'Chrome' : /FxiOS|Firefox/.test(agent) ? 'Firefox' : /Safari/.test(agent) ? 'Safari' : 'Other',
    os: /iPhone|iPad|iPod/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Windows/.test(agent) ? 'Windows' : /Macintosh/.test(agent) ? 'macOS' : 'Other',
  };
}
