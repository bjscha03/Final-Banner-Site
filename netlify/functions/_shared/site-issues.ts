import { createHash } from 'node:crypto';
import { SITE_ISSUE_KINDS, deviceInfo, issueDetails, issuePage, type SiteIssue } from '../../../src/lib/siteIssueSchema';

export const STORE_NAME = 'site-issues-v1';
export const MAX_REPORT_BYTES = 32768;
export const RETENTION_MS = 30 * 86_400_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const reply = (status: number, body?: unknown, extra: Record<string, string> = {}) => new Response(body === undefined ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});
export function validOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin === 'https://bannersonthefly.com' || origin === 'https://www.bannersonthefly.com';
}
export function normalizeReport(body: any, agent: string, deployId: string, now = Date.now()): SiteIssue | null {
  if (!body || !UUID.test(body.id) || !UUID.test(body.sessionId) || !SITE_ISSUE_KINDS.includes(body.kind)) return null;
  const occurred = Date.parse(body.occurredAt);
  if (!Number.isFinite(occurred) || occurred < now - 86_400_000 || occurred > now + 300_000) return null;
  return { id: body.id, sessionId: body.sessionId, kind: body.kind, occurredAt: new Date(occurred).toISOString(),
    receivedAt: new Date(now).toISOString(), page: issuePage(body.page),
    traffic: body.kind === 'monitor_test' || body.traffic === 'test' ? 'test' : 'customer',
    online: body.online !== false, details: issueDetails(body.details), ...deviceInfo(agent),
    status: 'new', deployId: /^[a-zA-Z0-9-]{1,80}$/.test(deployId) ? deployId : 'unknown' };
}
export function issueKey(issue: Pick<SiteIssue, 'occurredAt' | 'id'>) { return `events/${issue.occurredAt}/${issue.id}`; }
export function validIssueKey(value: unknown): value is string {
  return typeof value === 'string' && /^events\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/[a-f0-9-]{36}$/.test(value);
}
export async function saveIssue(store: any, issue: SiteIssue) {
  const key = issueKey(issue);
  // Queue retries are idempotent and cannot reopen a reviewed issue.
  await store.setJSON(key, issue, { onlyIfNew: true });
  return key;
}
export async function listIssues(store: any, ifNoneMatch: string | null, now = Date.now()) {
  const { blobs } = await store.list({ prefix: 'events/' });
  const available = blobs.filter((b: { key: string }) => validIssueKey(b.key) && Date.parse(b.key.split('/')[1]) >= now - RETENTION_MS)
    .sort((a: { key: string }, b: { key: string }) => b.key.localeCompare(a.key));
  const selected = available.slice(0, 200);
  const etag = '"' + createHash('sha256').update(JSON.stringify(selected.map((b: any) => [b.key, b.etag]))).digest('hex') + '"';
  if (etag === ifNoneMatch) return reply(304, undefined, { ETag: etag });
  const rows: any[] = [];
  for (let i = 0; i < selected.length; i += 10) {
    const batch = await Promise.all(selected.slice(i, i + 10).map(async (b: any) => {
      const issue = await store.get(b.key, { type: 'json' });
      return issue ? { ...issue, key: b.key } : null;
    }));
    rows.push(...batch.filter(Boolean));
  }
  return reply(200, { ok: true, issues: rows, truncated: available.length > selected.length, checkedAt: new Date(now).toISOString() }, { ETag: etag });
}
