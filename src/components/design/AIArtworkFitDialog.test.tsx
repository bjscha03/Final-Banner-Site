// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AIArtworkFitDialog from './AIArtworkFitDialog';
import { prepareArtworkFitSource, saveFittedArtwork, type ArtworkFitResult } from './ai/artworkFit';
import { AIRequestRateLimitError, runBackgroundJob } from './ai/backgroundJob';
import { fetchAIJson } from './ai/jobRequest';
import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';

vi.mock('./ai/artworkFit', async original => ({ ...await original<typeof import('./ai/artworkFit')>(), prepareArtworkFitSource: vi.fn(), saveFittedArtwork: vi.fn() }));
vi.mock('./ai/backgroundJob', async original => ({ ...await original<typeof import('./ai/backgroundJob')>(), runBackgroundJob: vi.fn() }));
vi.mock('./ai/jobRequest', () => ({ fetchAIJson: vi.fn() }));
vi.mock('@/lib/serverAuth', () => ({ authorizedHeaders: (value: unknown) => value, authenticatedJsonBody: JSON.stringify }));
vi.mock('@/lib/uxAnalytics', () => ({ logUx: vi.fn() }));
const artwork = { editorIdentity: 'original-1', name: 'original.pdf', url: 'https://source.test/original.pdf', fileKey: 'original', size: 100, isPdf: true } as UploadedArtworkFile;
const fitted = { ...artwork, editorIdentity: 'ai-fit:result-1', isPdf: false, url: 'https://source.test/fitted.jpg' };
const success = { id: 'result-1', imageBase64: 'AAAA', mimeType: 'image/jpeg', widthIn: 120, heightIn: 48, widthPx: 2000, heightPx: 800, verification: { passed: true, originalText: ['Acme'], detectedText: ['Acme'], missing: [], added: [], issues: [], confidence: .99 } } as ArtworkFitResult;
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
let props: React.ComponentProps<typeof AIArtworkFitDialog>;
const button = (label: string) => [...document.querySelectorAll('button')].find(el => el.textContent === label) as HTMLButtonElement;
async function click(label: string) { const el = button(label); expect(el).toBeTruthy(); await act(async () => el.click()); }
async function render() { await act(async () => root.render(<AIArtworkFitDialog {...props} />)); }
async function checkReview() { await act(async () => (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click()); }

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  props = { open: true, onOpenChange: vi.fn(), artwork, widthIn: 120, heightIn: 48, onApply: vi.fn() };
  vi.mocked(prepareArtworkFitSource).mockResolvedValue('data:image/jpeg;base64,AAAA');
  vi.mocked(fetchAIJson).mockResolvedValue({ response: new Response('{}'), body: { ready: true } });
  vi.mocked(runBackgroundJob).mockResolvedValue({ fit: success });
  vi.mocked(saveFittedArtwork).mockResolvedValue(fitted);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('compares first, requires customer review, and saves before applying', async () => {
  await render(); await click('Create fitted version');
  expect(props.onApply).not.toHaveBeenCalled();
  expect(button('Use this version').disabled).toBe(true);
  await checkReview(); await click('Use this version');
  expect(saveFittedArtwork).toHaveBeenCalledExactlyOnceWith(success);
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith(fitted, 'original-1|120|48');
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it('prevents using a result with changed wording or design elements', async () => {
  vi.mocked(runBackgroundJob).mockResolvedValue({ fit: { ...success, verification: { ...success.verification, passed: false, issues: ['The logo changed'] } } });
  await render(); await click('Create fitted version');
  expect(document.body.textContent).toContain('The logo changed');
  expect(button('Use this version').disabled).toBe(true);
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  await click('Use this version');
  expect(saveFittedArtwork).not.toHaveBeenCalled(); expect(props.onApply).not.toHaveBeenCalled();
});

it('leaves the original intact when saving fails and permits retry', async () => {
  vi.mocked(saveFittedArtwork).mockRejectedValueOnce(new Error('Upload failed'));
  await render(); await click('Create fitted version'); await checkReview(); await click('Use this version');
  expect(document.body.textContent).toContain('Upload failed'); expect(props.onApply).not.toHaveBeenCalled();
  await click('Use this version'); expect(props.onApply).toHaveBeenCalledOnce();
});

it('ignores a late result after the selected size changes and prepares the new size', async () => {
  let resolve!: (value: any) => void;
  vi.mocked(runBackgroundJob).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await render(); await click('Create fitted version');
  props = { ...props, widthIn: 72 }; await render();
  await act(async () => resolve({ fit: success }));
  expect(button('Use this version')).toBeUndefined();
  expect(button('Create fitted version').disabled).toBe(false);
  await click('Create fitted version');
  expect(runBackgroundJob).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ widthIn: 72 }), expect.anything(), expect.anything(), expect.anything(), undefined, undefined, 'original-1|72|48');
});

it('keeps one request running when the dialog closes and reopens', async () => {
  let resolve!: (value: any) => void;
  vi.mocked(runBackgroundJob).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await render();
  const create = button('Create fitted version');
  await act(async () => { create.click(); create.click(); });
  props = { ...props, open: false }; await render(); props = { ...props, open: true }; await render();
  expect(runBackgroundJob).toHaveBeenCalledOnce();
  await act(async () => resolve({ fit: success }));
  expect(button('Use this version')).toBeTruthy(); expect(props.onApply).not.toHaveBeenCalled();
});

it('offers a working retry after readiness temporarily fails', async () => {
  vi.mocked(fetchAIJson).mockResolvedValueOnce({ response: new Response('{}'), body: { ready: false } });
  await render(); await click('Try opening AI fit again');
  expect(button('Create fitted version').disabled).toBe(false);
});

it('lets the customer review and apply the cosmetic differences from the petting-zoo report', async () => {
  const reviewable = { ...success, verification: { ...success.verification, passed: false, canApply: true, blockingIssues: [], confidence: .8, issues: ['The lettering appears wider.', 'The divider has two additional decorative dots.', 'The wood grain and knot pattern differ.'] } };
  vi.mocked(runBackgroundJob).mockResolvedValue({ fit: reviewable });
  await render(); await click('Create fitted version');
  expect(document.body.textContent).toContain('Review the visual changes');
  expect(document.body.textContent).not.toContain('This version needs another attempt');
  expect(document.body.textContent).toContain('The wood grain and knot pattern differ.');
  expect(button('Use this version').disabled).toBe(true);
  await checkReview();
  expect(button('Use this version').disabled).toBe(false);
  await click('Use this version');
  expect(saveFittedArtwork).toHaveBeenCalledExactlyOnceWith(reviewable);
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith(fitted, 'original-1|120|48');
});

it('keeps a changed admission price blocked even when cosmetic review would be available', async () => {
  vi.mocked(runBackgroundJob).mockResolvedValue({ fit: { ...success, verification: { ...success.verification, passed: false, canApply: false, blockingIssues: ['The admission price changed'], missing: ['5'], added: ['15'] } } });
  await render(); await click('Create fitted version');
  expect(button('Use this version').disabled).toBe(true);
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  expect(document.body.textContent).toContain('The admission price changed');
  expect(saveFittedArtwork).not.toHaveBeenCalled();
});

it('keeps the last preview and retries the same attempt after a failed replacement', async () => {
  await render(); await click('Create fitted version');
  vi.mocked(runBackgroundJob).mockRejectedValueOnce(new Error('Temporary connection failure'));
  await click('Try another layout');
  expect(document.querySelector('img[alt="AI layout at your selected banner dimensions"]')).not.toBeNull();
  expect(button('Retry same request')).toBeTruthy();
  await click('Retry same request');
  expect(vi.mocked(runBackgroundJob).mock.calls.slice(1).map(call => call[1].attempt)).toEqual([1, 1]);
});

it('shows the server cooldown and prevents repeated retry clicks until it expires', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  try {
    await render(); await click('Create fitted version');
    vi.mocked(runBackgroundJob).mockRejectedValueOnce(new AIRequestRateLimitError('Limit reached', '65'));
    await click('Try another layout');
    expect(document.body.textContent).toContain('Please wait 1:05');
    expect(button('Retry same request').disabled).toBe(true);
    await click('Retry same request'); expect(runBackgroundJob).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(65_000));
    expect(button('Retry same request').disabled).toBe(false);
    await click('Retry same request');
    expect(runBackgroundJob).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ attempt: 1 }), expect.anything(), expect.anything(), expect.anything(), undefined, undefined, 'original-1|120|48');
  } finally { vi.useRealTimers(); }
});
