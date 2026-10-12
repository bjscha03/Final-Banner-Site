// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logUx } from './uxAnalytics';
import { gtag } from './analytics';
import { sendClarity } from './trackingRuntime';
import { trackUploadIssue } from './siteIssueReporter';
import { isCustomerTrackingAllowed } from './trackingPolicy';

vi.mock('./analytics', () => ({ gtag: vi.fn() }));
vi.mock('./trackingRuntime', () => ({ sendClarity: vi.fn() }));
vi.mock('./siteIssueReporter', () => ({ trackUploadIssue: vi.fn() }));
vi.mock('./trackingPolicy', () => ({ isCustomerTrackingAllowed: vi.fn(() => true) }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); delete window.clarity; });

describe('upload operational evidence', () => {
  it('sends detailed evidence to admin reporting without including it in analytics or console replays', () => {
    window.clarity = vi.fn();
    const consoleLog = vi.spyOn(console, 'info').mockImplementation(() => {});
    const context = { phase: 'chunked', status: 503 };
    const evidence = { errorMessage: 'Detailed storage failure', fileBytes: 123456789 };
    logUx('upload_error', context, evidence);
    expect(trackUploadIssue).toHaveBeenCalledWith('upload_error', { ...context, ...evidence });
    expect(gtag).toHaveBeenCalledWith('event', 'upload_error', context);
    expect(sendClarity).toHaveBeenCalledWith('event', 'upload_error');
    expect(sendClarity).toHaveBeenCalledTimes(3);
    expect(consoleLog).toHaveBeenCalledWith('[ux] upload_error', context);
    const thirdParty = JSON.stringify([vi.mocked(gtag).mock.calls, vi.mocked(sendClarity).mock.calls, consoleLog.mock.calls]);
    expect(thirdParty).not.toContain(evidence.errorMessage);
    expect(thirdParty).not.toContain(String(evidence.fileBytes));
  });

  it('reports failures when optional customer tracking is disabled', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(isCustomerTrackingAllowed).mockReturnValueOnce(false);
    logUx('upload_timeout', undefined, { fileBytes: 300 });
    expect(trackUploadIssue).toHaveBeenCalledWith('upload_timeout', { fileBytes: 300 });
    expect(gtag).not.toHaveBeenCalled();
    expect(sendClarity).not.toHaveBeenCalled();
  });
});
