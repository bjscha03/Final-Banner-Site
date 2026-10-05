import { isProductionHost } from './environment';
import { isCurrentDeviceInternal } from './trackingPolicy';
import { issueDetails, issuePage, type SiteIssueInput, type SiteIssueKind } from './siteIssueSchema';

const QUEUE_KEY = 'bof_issue_queue_v1';
const SESSION_KEY = 'bof_issue_session_v1';
const ENDPOINT = '/.netlify/functions/report-site-issue';
let queue: SiteIssueInput[] | null = null;
let sessionId = '';
let flushing = false;
let installed = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
let lastWindow = 0;
let sentInWindow = 0;
const recent = new Map<string, number>();
let uploadStartedAt = 0;

function enabled() { return typeof window !== 'undefined' && isProductionHost(window.location.hostname) && window.location.protocol === 'https:'; }
function persist() { try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* Memory queue still works. */ } }
function getQueue() {
  if (!queue) {
    try { const saved = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]'); queue = Array.isArray(saved) ? saved.slice(-20) : []; }
    catch { queue = []; }
    queue = queue.filter(item => item && Date.parse(item.occurredAt) > Date.now() - 86_400_000);
  }
  return queue;
}
function getSessionId() {
  if (sessionId) return sessionId;
  try { sessionId = sessionStorage.getItem(SESSION_KEY) || ''; } catch { /* No storage in some private browsers. */ }
  if (!/^[a-f0-9-]{36}$/.test(sessionId)) sessionId = crypto.randomUUID();
  try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch { /* Memory ID is sufficient. */ }
  return sessionId;
}
export async function flushSiteIssues(): Promise<void> {
  if (!enabled() || flushing || navigator.onLine === false) return;
  flushing = true;
  try {
    const pending = getQueue();
    while (pending.length) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(ENDPOINT, { method: 'POST', credentials: 'omit', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending[0]), signal: controller.signal });
        if (!response.ok && (response.status >= 500 || response.status === 429)) break;
        // Invalid reports are discarded; never retry a permanent validation failure.
        pending.shift(); persist(); retries = 0;
      } catch { break; }
      finally { clearTimeout(timeout); }
    }
    if (pending.length && retries < 3 && !retryTimer) {
      retries += 1;
      retryTimer = setTimeout(() => { retryTimer = undefined; void flushSiteIssues(); }, retries * 15_000);
    }
  } catch { /* Monitoring must never interrupt the storefront. */ }
  finally { flushing = false; }
}
export function reportSiteIssue(kind: SiteIssueKind, details: Record<string, unknown> = {}): void {
  try {
    if (!enabled() || window.location.pathname.startsWith('/admin')) return;
    const now = Date.now();
    if (now - lastWindow > 300_000) { lastWindow = now; sentInWindow = 0; recent.clear(); }
    if (sentInWindow >= 10) return;
    const safeDetails = issueDetails(details);
    const page = issuePage(window.location.pathname);
    const fingerprint = JSON.stringify([kind, page, safeDetails]);
    if (now - (recent.get(fingerprint) || 0) < 5000) return;
    recent.set(fingerprint, now); sentInWindow += 1;
    getQueue().push({ id: crypto.randomUUID(), kind, occurredAt: new Date(now).toISOString(), page,
      sessionId: getSessionId(), traffic: isCurrentDeviceInternal() || navigator.webdriver ? 'test' : 'customer',
      online: navigator.onLine, details: safeDetails });
    if (queue!.length > 20) queue!.shift();
    persist(); void flushSiteIssues();
  } catch { /* Never throw into an upload or checkout. */ }
}
export function trackUploadIssue(event: string, details?: Record<string, unknown>): void {
  if (event === 'upload_start') { uploadStartedAt = Date.now(); return; }
  if (event === 'upload_success') { uploadStartedAt = 0; return; }
  if (event === 'upload_error' || event === 'upload_timeout' || event === 'upload_preview_error') {
    reportSiteIssue(event, { ...details, ...(uploadStartedAt ? { durationMs: Date.now() - uploadStartedAt } : {}) });
  }
}
export function reportPageIssue(kind: 'page_error' | 'page_crash', error: unknown, source?: string, line?: number, column?: number) {
  try {
    const err = error instanceof Error ? error : null;
    const errorName = err && ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'ChunkLoadError'].includes(err.name) ? err.name : 'Error';
    const frame = (err?.stack || '').match(/(\/assets\/[A-Za-z0-9_.-]+\.js):(\d+):(\d+)/);
    const sourcePath = source ? new URL(source, window.location.origin).pathname : frame?.[1];
    reportSiteIssue(kind, { errorName, source: sourcePath, line: line || Number(frame?.[2] || 0), column: column || Number(frame?.[3] || 0) });
  } catch { /* Error reporting itself must remain safe. */ }
}
export function installSiteIssueMonitoring() {
  if (!enabled() || installed) return;
  installed = true;
  window.addEventListener('error', event => {
    // Ignore image loading failures, extensions, and opaque third-party errors.
    if (!(event instanceof ErrorEvent) || !event.error) return;
    if (event.filename && !event.filename.startsWith(window.location.origin + '/')) return;
    reportPageIssue('page_error', event.error, event.filename, event.lineno, event.colno);
  });
  window.addEventListener('unhandledrejection', event => {
    if (event.reason instanceof Error && event.reason.name !== 'AbortError') reportPageIssue('page_error', event.reason);
  });
  window.addEventListener('online', () => { retries = 0; void flushSiteIssues(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { retries = 0; void flushSiteIssues(); } });
  void flushSiteIssues();
}
