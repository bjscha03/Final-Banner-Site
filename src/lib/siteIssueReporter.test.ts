// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://bannersonthefly.com/design"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, '', '/design'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('operational issue reporter', () => {
  it('includes our deploy-pinned JavaScript without accepting unrelated remote scripts', async () => {
    const { isFirstPartyScriptSource } = await import('./siteIssueReporter');
    const page = 'https://bannersonthefly.com';
    const deploy = 'https://6acd5524dc72013d7b6fa4de--bannersonthefly.netlify.app/';
    expect(isFirstPartyScriptSource(page + '/assets/index.js', page, deploy)).toBe(true);
    expect(isFirstPartyScriptSource(deploy + 'assets/index.js', page, deploy)).toBe(true);
    expect(isFirstPartyScriptSource('https://example.com/assets/index.js', page, deploy)).toBe(false);
    expect(isFirstPartyScriptSource(deploy + 'unrelated.js', page, deploy)).toBe(false);
    expect(isFirstPartyScriptSource('', page, deploy)).toBe(true);
  });
  it('sends a sanitized error without waiting in the customer flow and deduplicates repeats', async () => {
    const { reportSiteIssue } = await import('./siteIssueReporter');
    reportSiteIssue('upload_error', { phase: 'direct_upload', mimeType: 'png', message: 'secret', file: 'private.png' });
    reportSiteIssue('upload_error', { phase: 'direct_upload', mimeType: 'png', message: 'secret', file: 'private.png' });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sent.details).toMatchObject({ phase: 'direct_upload', mimeType: 'png' });
    expect(sent.page).toBe('/design'); expect(JSON.stringify(sent)).not.toContain('secret');
  });
  it('retains a failed report and retries it without throwing or changing the report ID', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    const { reportSiteIssue, flushSiteIssues } = await import('./siteIssueReporter');
    expect(() => reportSiteIssue('upload_timeout')).not.toThrow();
    await vi.advanceTimersByTimeAsync(1);
    const first = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(JSON.parse(sessionStorage.getItem('bof_issue_queue_v1')!)).toHaveLength(1);
    await flushSiteIssues();
    const second = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(first.id).toBe(second.id); expect(JSON.parse(sessionStorage.getItem('bof_issue_queue_v1')!)).toEqual([]);
  });
  it('marks known internal traffic as tests and keeps admin requests out of the reporter', async () => {
    localStorage.setItem('botf_internal_traffic_device', '1');
    const { reportSiteIssue } = await import('./siteIssueReporter');
    reportSiteIssue('page_crash'); await vi.advanceTimersByTimeAsync(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).traffic).toBe('test');
    window.history.replaceState({}, '', '/admin/site-issues'); reportSiteIssue('page_error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds a burst of distinct errors so broken pages cannot flood the logger', async () => {
    const { reportSiteIssue } = await import('./siteIssueReporter');
    for (let i = 0; i < 100; i++) reportSiteIssue('page_error', { line: i });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(10);
  });
  it('records elapsed upload time and only reports failure events', async () => {
    const { trackUploadIssue } = await import('./siteIssueReporter');
    trackUploadIssue('upload_start'); await vi.advanceTimersByTimeAsync(45_000); trackUploadIssue('upload_timeout');
    await vi.advanceTimersByTimeAsync(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).details.durationMs).toBe(45_000);
    trackUploadIssue('upload_success'); expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it('captures actionable crash evidence and redacts sensitive URL data', async () => {
  const { reportPageIssue, recordIssueAction } = await import('./siteIssueReporter');
  window.history.replaceState({}, '', '/banner-finishing?token=private');
  recordIssueAction('upload_success');
  const error = new TypeError("Cannot read properties of undefined (reading 'width')");
  error.stack = error.message + '\n at render (https://bannersonthefly.com/assets/designer-abc.js:9:3572)';
  reportPageIssue('page_crash', error, undefined, undefined, undefined, '\n at BannerPreview');
  await vi.advanceTimersByTimeAsync(1);
  const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(sent.page).toBe('/banner-finishing');
  expect(sent.details.errorMessage).toContain("reading 'width'");
  expect(sent.details.stack).toContain('/assets/designer-abc.js:9:3572');
  expect(sent.details.componentStack).toContain('BannerPreview');
  expect(sent.details.breadcrumbs).toContain('upload_success');
  expect(JSON.stringify(sent)).not.toContain('token=private');
});

it('deduplicates crashes despite intervening breadcrumbs', async () => {
  const { reportSiteIssue, recordIssueAction } = await import('./siteIssueReporter');
  reportSiteIssue('page_crash', { errorMessage: 'Unable to preload CSS for /assets/page.css' });
  recordIssueAction('button_clicked');
  reportSiteIssue('page_crash', { errorMessage: 'Unable to preload CSS for /assets/page.css' });
  await vi.advanceTimersByTimeAsync(300);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('coalesces resource, preload and boundary failures while retaining crash evidence', async () => {
  const { reportSiteIssue, reportPageIssue } = await import('./siteIssueReporter');
  reportSiteIssue('page_error', { phase: 'asset_load', source: '/assets/checkout-old.css', errorMessage: 'A required site asset failed to load.' });
  const stored = JSON.parse(sessionStorage.getItem('bof_issue_queue_v1')!);
  expect(stored).toHaveLength(1); // persisted before the coalescing delay/navigation
  const error = new Error('Unable to preload CSS for /assets/checkout-old.css');
  error.stack = 'Error: failed\n at preload (/assets/index-current.js:2:2199)';
  reportPageIssue('page_error', error);
  reportPageIssue('page_crash', error, undefined, undefined, undefined, 'at Checkout\nat Lazy');
  await vi.advanceTimersByTimeAsync(300);
  expect(fetch).toHaveBeenCalledTimes(1);
  const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(sent.id).toBe(stored[0].id);
  expect(sent.kind).toBe('page_crash');
  expect(sent.details).toMatchObject({ source: '/assets/checkout-old.css', phase: 'asset_load', componentStack: 'at Checkout\nat Lazy' });
  expect(sent.details.stack).toContain('/assets/index-current.js:2:2199');
  reportPageIssue('page_error', error);
  await vi.advanceTimersByTimeAsync(300);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  reportPageIssue('page_error', error);
  await vi.advanceTimersByTimeAsync(300);
  expect(fetch).toHaveBeenCalledTimes(2); // a later recurrence remains visible
});

it('keeps distinct files, opaque Safari errors and checkout failures visible', async () => {
  const { reportSiteIssue, reportPageIssue } = await import('./siteIssueReporter');
  reportPageIssue('page_error', new TypeError('Failed to fetch dynamically imported module: /assets/a.js'));
  reportPageIssue('page_error', new TypeError('Failed to fetch dynamically imported module: /assets/b.js'));
  reportPageIssue('page_error', 'Script error.');
  reportSiteIssue('checkout_error', { code: 'STRIPE_CHECKOUT_ERROR', provider: 'stripe' });
  await vi.advanceTimersByTimeAsync(300);
  const sent = vi.mocked(fetch).mock.calls.map(call => JSON.parse(call[1]!.body as string));
  expect(sent).toHaveLength(4);
  expect(sent.some(item => item.details.recovery === 'browser_details_withheld')).toBe(true);
  expect(sent.some(item => item.kind === 'checkout_error')).toBe(true);
});

it('flushes a persisted asset incident before the recovery navigation', async () => {
  const { reportSiteIssue, flushSiteIssues } = await import('./siteIssueReporter');
  reportSiteIssue('page_error', { phase: 'asset_load', source: '/assets/a.js' });
  expect(fetch).not.toHaveBeenCalled();
  await flushSiteIssues(); // same path as the pagehide recovery hook
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][1]!.keepalive).toBe(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('preserves asset/request evidence and strips secrets', async () => {
  const { issueDetails } = await import('./siteIssueSchema');
  const details = issueDetails({ source: '/assets/page-123.css', requestId: '01M532TRJ5XEWWYC17T0V802B2', attempt: 3, chunkIndex: 4, canonicalQuoteApplied: true, password: 'secret', errorMessage: 'Unable to preload CSS for https://deploy.netlify.app/assets/page-123.css?token=secret' });
  expect(details).toMatchObject({ source: '/assets/page-123.css', attempt: 3, chunkIndex: 4, canonicalQuoteApplied: true });
  expect(details.errorMessage).toContain('/assets/page-123.css');
  expect(JSON.stringify(details)).not.toMatch(/secret|password|token=/);
});
