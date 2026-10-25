import { beforeEach, describe, expect, it, vi } from 'vitest';
import report from '../report-site-issue.mts';
import admin from '../admin-site-issues.mts';
import { issueKey, listIssues, normalizeReport, saveIssue } from '../_shared/site-issues';

const mocks = vi.hoisted(() => {
  const records = new Map<string, any>();
  return { records, store: {
    setJSON: vi.fn(async (key, value, options) => { if (!options?.onlyIfNew || !records.has(key)) records.set(key, value); }),
    get: vi.fn(async key => records.get(key) || null),
    list: vi.fn(async () => ({ blobs: [...records.keys()].map(key => ({ key, etag: JSON.stringify(records.get(key)) })) })),
  }, getStore: vi.fn() };
});
vi.mock('@netlify/blobs', () => ({ getStore: (...args: any[]) => { mocks.getStore(...args); return mocks.store; } }));
vi.mock('../_shared/server-auth.cjs', () => ({ default: { requireAdmin: (e: any) => ({ ok: e.headers.authorization === 'test-token', session: { preview: e.headers.preview === '1' } }) } }));
const context = { deploy: { context: 'production', id: 'deploy-test-123' } } as any;
const body = () => ({ id: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222', kind: 'upload_error', occurredAt: new Date().toISOString(), page: '/design?token=private', traffic: 'customer', online: true, details: { mimeType: 'png', status: 503, message: 'customer@example.com', filename: 'private.png', email: 'customer@example.com' } });
const request = (method: string, payload?: any, headers: Record<string, string> = {}) => new Request('https://bannersonthefly.com/.netlify/functions/site-issues', { method, headers: { origin: 'https://bannersonthefly.com', 'content-type': 'application/json', 'user-agent': 'iPhone Mobile Safari', ...headers }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
beforeEach(() => { mocks.records.clear(); vi.clearAllMocks(); });

describe('first-party issue capture', () => {
  it('retains crawler evidence separately even from an old client labeling itself customer', async () => {
    const response = await report(request('POST', { ...body(), kind: 'page_error' }, { 'user-agent': 'GoogleOther' }), context);
    expect(response.status).toBe(202);
    expect([...mocks.records.values()][0]).toMatchObject({ traffic: 'crawler', status: 'new', details: { crawler: 'googleother' } });
  });
  it('does not allow client crawler flags to remove real-browser errors from the open count', () => {
    const event = normalizeReport({ ...body(), traffic: 'crawler', details: { crawler: 'googlebot', errorMessage: 'Real failure' } }, 'iPhone Mobile Safari', 'deploy-test')!;
    expect(event.traffic).toBe('customer');
    expect(event.details.crawler).toBeUndefined();
    expect(event.details.errorMessage).toBe('Real failure');
  });
  it('stores diagnostics while stripping query strings, filenames and customer data', async () => {
    const response = await report(request('POST', body()), context);
    expect(response.status).toBe(202);
    const saved = [...mocks.records.values()][0];
    expect(saved).toMatchObject({ kind: 'upload_error', device: 'Mobile', browser: 'Safari', page: '/design', details: { mimeType: 'png', status: 503 } });
    expect(JSON.stringify(saved)).not.toMatch(/private|customer@example/);
  });
  it('rejects foreign origins, unsupported events, oversized bodies and non-production writes', async () => {
    expect((await report(request('POST', body(), { origin: 'https://attacker.example' }), context)).status).toBe(403);
    expect((await report(request('POST', { ...body(), kind: 'made_up' }), context)).status).toBe(400);
    expect((await report(request('POST', { ...body(), extra: 'x'.repeat(33000) }), context)).status).toBe(413);
    expect((await report(request('POST', body()), { deploy: { context: 'deploy-preview' } } as any)).status).toBe(503);
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it('requires admin authorization for an explicit test report and separates it from customer issues', async () => {
    const event = { ...body(), kind: 'monitor_test' };
    expect((await report(request('POST', event), context)).status).toBe(401);
    expect((await report(request('POST', event, { authorization: 'test-token' }), context)).status).toBe(202);
    expect([...mocks.records.values()][0].traffic).toBe('test');
  });
  it('does not duplicate or reopen a report when a queued request is retried', async () => {
    const event = normalizeReport(body(), '', 'deploy-test')!;
    await saveIssue(mocks.store, event);
    mocks.records.set(issueKey(event), { ...event, status: 'reviewed' });
    await saveIssue(mocks.store, event);
    expect(mocks.records.size).toBe(1);
    expect(mocks.records.get(issueKey(event)).status).toBe('reviewed');
    expect(mocks.store.setJSON).toHaveBeenLastCalledWith(issueKey(event), event, { onlyIfNew: true });
  });
});
describe('protected issue log', () => {
  it('archives unverified historical incidents honestly, preserves evidence, and supports reopening', async () => {
    const event = normalizeReport(body(), '', 'deploy-test')!; await saveIssue(mocks.store, event);
    const update = { key: issueKey(event), status: 'archived' };
    expect((await admin(request('PATCH', update, { authorization: 'test-token' }), context)).status).toBe(400);
    const resolution = 'Historical browser report lacks diagnostic evidence; cause remains unconfirmed.';
    expect((await admin(request('PATCH', { ...update, resolution }, { authorization: 'test-token' }), context)).status).toBe(200);
    expect(mocks.records.get(update.key)).toMatchObject({ status: 'archived', resolvedAt: null, resolution, details: event.details });
    await admin(request('PATCH', { ...update, status: 'new' }, { authorization: 'test-token' }), context);
    expect(mocks.records.get(update.key)).toMatchObject({ status: 'new', resolution, details: event.details });
  });
  it('requires protected admin evidence to correct an old crawler classification', async () => {
    const event = normalizeReport(body(), '', 'deploy-test')!; await saveIssue(mocks.store, event);
    const update = { key: issueKey(event), status: 'resolved', traffic: 'crawler', resolution: 'Verified Googlebot request in the hosting request logs.' };
    expect((await admin(request('PATCH', update), context)).status).toBe(401);
    expect((await admin(request('PATCH', { ...update, resolution: '' }, { authorization: 'test-token' }), context)).status).toBe(400);
    expect((await admin(request('PATCH', { ...update, traffic: 'test' }, { authorization: 'test-token' }), context)).status).toBe(400);
    expect((await admin(request('PATCH', update, { authorization: 'test-token' }), context)).status).toBe(200);
    expect(mocks.records.get(update.key)).toMatchObject({ traffic: 'crawler', status: 'resolved', details: event.details });
  });
  it('paginates every retained report and invalidates the cache when an older report changes', async () => {
    const now = Date.now();
    for (let i = 0; i < 205; i++) {
      const event = { ...normalizeReport(body(), '', 'deploy-test')!, occurredAt: new Date(now - i * 1000).toISOString() };
      await saveIssue(mocks.store, event);
    }
    const first = await listIssues(mocks.store, null, now);
    const page = await first.json();
    expect(page.issues).toHaveLength(200);
    const rest = await (await listIssues(mocks.store, null, now, page.nextCursor)).json();
    expect(rest.issues).toHaveLength(5);
    expect(rest.nextCursor).toBeNull();
    expect(new Set([...page.issues, ...rest.issues].map(i => i.key)).size).toBe(205);
    const key = rest.issues[0].key;
    mocks.records.set(key, { ...mocks.records.get(key), status: 'resolved' });
    expect((await listIssues(mocks.store, first.headers.get('etag'), now)).status).toBe(200);
    expect((await listIssues(mocks.store, null, now, '../invalid')).status).toBe(400);
  });
  it('denies anonymous access and preview admin sessions before reading storage', async () => {
    expect((await admin(request('GET'), context)).status).toBe(401);
    expect((await admin(request('GET', undefined, { authorization: 'test-token', preview: '1' }), context)).status).toBe(503);
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it('returns stored issues and skips record reads when the ETag has not changed', async () => {
    const event = normalizeReport(body(), '', 'deploy-test')!; await saveIssue(mocks.store, event);
    const response = await admin(request('GET', undefined, { authorization: 'test-token' }), context);
    expect(response.status).toBe(200); expect((await response.json()).issues).toHaveLength(1);
    mocks.store.get.mockClear();
    const unchanged = await admin(request('GET', undefined, { authorization: 'test-token', 'if-none-match': response.headers.get('etag')! }), context);
    expect(unchanged.status).toBe(304); expect(mocks.store.get).not.toHaveBeenCalled();
  });
  it('allows review without deleting evidence, and rejects invalid keys or cross-origin changes', async () => {
    const event = normalizeReport(body(), '', 'deploy-test')!; await saveIssue(mocks.store, event);
    const update = { key: issueKey(event), status: 'reviewed' };
    expect((await admin(request('PATCH', update, { authorization: 'test-token', origin: 'https://attacker.example' }), context)).status).toBe(403);
    expect((await admin(request('PATCH', { ...update, key: '../artwork' }, { authorization: 'test-token' }), context)).status).toBe(400);
    expect((await admin(request('PATCH', update, { authorization: 'test-token' }), context)).status).toBe(200);
    expect(mocks.records.get(update.key)).toMatchObject({ status: 'reviewed', details: event.details });
  });
});

it('preserves bounded crash evidence through storage normalization and redacts secrets', () => {
  const saved = normalizeReport({ ...body(), page: '/banner-finishing?token=secret', details: {
    errorMessage: 'Failed for customer@example.com token=abc sk_test_123456',
    stack: 'TypeError: failed\n at render (https://bannersonthefly.com/assets/main-abc.js:9:3572)',
    componentStack: '\n at Preview', breadcrumbs: 'upload_success',
  } }, 'Chrome/130.0 Windows', 'deploy-test')!;
  expect(saved.page).toBe('/banner-finishing');
  expect(saved.details.stack).toContain('/assets/main-abc.js:9:3572');
  expect(saved.details.componentStack).toContain('Preview');
  expect(JSON.stringify(saved)).not.toMatch(/customer@example|token=abc|sk_test_123456/);
});

it('preserves exact upload sizes and validation evidence through the admin report', () => {
  const saved = normalizeReport({ ...body(), details: { phase: 'validation', status: 413, fileBytes: 400000000, fileLimitBytes: 314572800, errorMessage: 'File exceeds upload limit' } }, 'Mobile Safari', 'deploy-test')!;
  expect(saved.details).toEqual({ phase: 'validation', status: 413, fileBytes: 400000000, fileLimitBytes: 314572800, errorMessage: 'File exceeds upload limit' });
});

it('requires fix evidence to resolve and preserves it when reopened', async () => {
  const event = normalizeReport(body(), '', 'deploy-test')!; await saveIssue(mocks.store, event);
  const update = { key: issueKey(event), status: 'resolved' };
  expect((await admin(request('PATCH', update, { authorization: 'test-token' }), context)).status).toBe(400);
  const resolution = 'Compatible PDF API and worker; real PDF verified without Promise.withResolvers.';
  expect((await admin(request('PATCH', { ...update, resolution }, { authorization: 'test-token' }), context)).status).toBe(200);
  expect(mocks.records.get(update.key)).toMatchObject({ status: 'resolved', resolution, details: event.details });
  expect(mocks.records.get(update.key).resolvedAt).toBeTruthy();
  await admin(request('PATCH', { ...update, status: 'new' }, { authorization: 'test-token' }), context);
  expect(mocks.records.get(update.key)).toMatchObject({ status: 'new', resolution, resolvedAt: null });
});
