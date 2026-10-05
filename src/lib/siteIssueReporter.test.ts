// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://bannersonthefly.com/design"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, '', '/design'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('operational issue reporter', () => {
  it('sends a sanitized error without waiting in the customer flow and deduplicates repeats', async () => {
    const { reportSiteIssue } = await import('./siteIssueReporter');
    reportSiteIssue('upload_error', { phase: 'direct_upload', mimeType: 'png', message: 'secret', file: 'private.png' });
    reportSiteIssue('upload_error', { phase: 'direct_upload', mimeType: 'png', message: 'secret', file: 'private.png' });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sent.details).toEqual({ phase: 'direct_upload', mimeType: 'png' });
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
