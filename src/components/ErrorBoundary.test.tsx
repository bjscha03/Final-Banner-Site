// @vitest-environment jsdom
import React, { act, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { attemptChunkRecovery } from '@/lib/chunkRecovery';
import { reportPageIssue } from '@/lib/siteIssueReporter';

vi.mock('@/lib/chunkRecovery', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chunkRecovery')>(),
  attemptChunkRecovery: vi.fn(() => false),
}));
vi.mock('@/lib/siteIssueReporter', () => ({ reportPageIssue: vi.fn() }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it.each([
  ['Failed to fetch dynamically imported module: /assets/Terms-old.js', true],
  ['Unrelated application failure', false],
])('handles caught lazy rejection: %s', async (message, shouldRecover) => {
  // React catches lazy import rejections itself, so global rejection listeners
  // alone cannot recover these production failures.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new TypeError(message);
  const Page = lazy(() => Promise.reject(error));
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<ErrorBoundary><Suspense fallback="Loading"><Page /></Suspense></ErrorBoundary>);
    });
    expect(attemptChunkRecovery).toHaveBeenCalledTimes(shouldRecover ? 1 : 0);
    expect(reportPageIssue).toHaveBeenCalledWith('page_crash', error, undefined, undefined, undefined, expect.any(String));
    // If the guard refuses a reload, the customer still has a usable fallback.
    expect(container.querySelector('button')?.textContent).toBe('Reload page');
  } finally {
    act(() => root.unmount());
  }
});
