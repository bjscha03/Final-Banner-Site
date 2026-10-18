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

it('starts on opening, shows only the completed preview, and saves with one approval', async () => {
  await render();
  expect(runBackgroundJob).toHaveBeenCalledOnce();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  expect(document.querySelector('img[alt="Your fitted design"]')).not.toBeNull();
  expect(document.body.textContent).not.toMatch(/Original artwork|Create fitted version|PPI|DPI|resolution|Please retry this design/i);
  expect(button('Approve design').disabled).toBe(false);
  await click('Approve design');
  expect(saveFittedArtwork).toHaveBeenCalledExactlyOnceWith(success);
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith(fitted, 'original-1|120|48');
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it.each([
  { passed: false, canApply: false, issues: ['The logo changed'] },
  { passed: false, canApply: false, blockingIssues: ['The admission price changed'], missing: ['5'], added: ['15'] },
])('lets the customer approve the preview despite internal analysis: %j', async checks => {
  const reviewable = { ...success, verification: { ...success.verification, ...checks } };
  vi.mocked(runBackgroundJob).mockResolvedValue({ fit: reviewable });
  await render();
  expect(document.body.textContent).not.toMatch(/logo changed|admission price|retry this design|PPI|DPI|resolution/i);
  await click('Approve design');
  expect(saveFittedArtwork).toHaveBeenCalledExactlyOnceWith(reviewable);
  expect(props.onApply).toHaveBeenCalledOnce();
});

it('lets the screenshot 53.3 PPI layout and unknown pixel dimensions be approved', async () => {
  for (const pixels of [1920, 0]) {
    props = { ...props, widthIn: 36, heightIn: 36, artwork: { ...artwork, editorIdentity: `source-${pixels}` } };
    const result = { ...success, widthIn: 36, heightIn: 36, widthPx: pixels, heightPx: pixels };
    vi.mocked(runBackgroundJob).mockResolvedValue({ fit: result });
    await render();
    expect(document.body.textContent).not.toMatch(/PPI|DPI|resolution|missing detail|minimum/i);
    await click('Approve design');
    expect(saveFittedArtwork).toHaveBeenLastCalledWith(result);
  }
});

it('keeps the original if saving fails and retries approval without technical errors', async () => {
  vi.mocked(saveFittedArtwork).mockRejectedValueOnce(new Error('Upload failed'));
  await render(); await click('Approve design');
  expect(document.body.textContent).not.toContain('Upload failed');
  expect(props.onApply).not.toHaveBeenCalled();
  expect(document.querySelector('img[alt="Your fitted design"]')).not.toBeNull();
  await click('Approve design');
  expect(props.onApply).toHaveBeenCalledOnce();
});

it('does not open a setup dialog or submit twice while work is running', async () => {
  let resolve!: (value: any) => void;
  vi.mocked(runBackgroundJob).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await render(); await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.textContent).toContain('Fitting your design');
  props = { ...props, open: false }; await render(); props = { ...props, open: true }; await render();
  expect(runBackgroundJob).toHaveBeenCalledOnce();
  await act(async () => resolve({ fit: success }));
  expect(button('Approve design')).toBeTruthy();
});

it('ignores an old result after a size change and automatically fits the new size', async () => {
  let resolve!: (value: any) => void;
  vi.mocked(runBackgroundJob).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await render();
  vi.mocked(runBackgroundJob).mockResolvedValue({ fit: { ...success, widthIn: 72 } });
  props = { ...props, widthIn: 72 }; await render();
  await act(async () => resolve({ fit: success }));
  expect(runBackgroundJob).toHaveBeenCalledTimes(2);
  expect(runBackgroundJob).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ widthIn: 72 }), expect.anything(), expect.anything(), expect.any(Function), undefined, undefined, 'original-1|72|48');
  await click('Approve design');
  expect(saveFittedArtwork).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ widthIn: 72 }));
});

it('automatically starts after retrying temporary readiness failure', async () => {
  vi.mocked(fetchAIJson).mockResolvedValueOnce({ response: new Response('{}'), body: { ready: false } });
  await render(); expect(runBackgroundJob).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await click('Try again');
  expect(runBackgroundJob).toHaveBeenCalledOnce();
  expect(button('Approve design')).toBeTruthy();
});

it('permits retry without exposing generation errors or claiming a missing result succeeded', async () => {
  vi.mocked(runBackgroundJob).mockRejectedValueOnce(new Error('Provider failed'));
  await render();
  expect(document.body.textContent).not.toContain('Provider failed');
  expect(button('Approve design')).toBeUndefined();
  expect(props.onApply).not.toHaveBeenCalled();
  await click('Try again');
  expect(runBackgroundJob).toHaveBeenCalledTimes(2);
  expect(button('Approve design')).toBeTruthy();
});

it('respects server cooldown without showing raw errors or allowing duplicate work', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  try {
    vi.mocked(runBackgroundJob).mockRejectedValueOnce(new AIRequestRateLimitError('Limit reached', '65'));
    await render();
    expect(document.body.textContent).not.toContain('Limit reached');
    expect(button('Please wait…').disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(65_000));
    await click('Try again');
    expect(runBackgroundJob).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it.each(['yard_sign', 'car_magnet'] as const)('automatically fits %s and saves its selected dimensions', async productType => {
  props = { ...props, productType, widthIn: 24, heightIn: 18 };
  vi.mocked(runBackgroundJob).mockResolvedValue({ fit: { ...success, productType, widthIn: 24, heightIn: 18 } });
  await render(); await click('Approve design');
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith(fitted, `original-1|24|18|${productType}`);
});
