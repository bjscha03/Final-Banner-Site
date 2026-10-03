// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AIWorkspace from './AIWorkspace';
import type { AIConcept, AIDesignSession, CreativeBrief } from './types';

const mocks = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  save: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useAIAdminAccess', () => ({ useAIDesignerAccess: () => ({ authorized: true, ready: true, sessionKey: 'customer-test', loading: false }) }));
vi.mock('@/lib/serverAuth', () => ({ authorizedHeaders: (headers: unknown) => headers, authenticatedJsonBody: JSON.stringify }));
vi.mock('@/lib/aiAnalytics', () => ({ trackAIEvent: mocks.track }));
vi.mock('./draftStore', () => ({
  loadDraft: async (key: string) => mocks.records.get(key) || null,
  saveDraft: async (key: string, value: unknown) => { mocks.records.set(key, structuredClone(value)); mocks.save(key, value); },
}));

const brief: CreativeBrief = {
  structured: true, description: 'Fall festival banner', purpose: 'Event', targetAudience: 'Families',
  primaryMessage: 'Fall festival', visualStyle: 'Bold', brandPersonality: 'Friendly', colorPalette: 'Orange',
  subjectMatter: 'Leaves', composition: 'Centered', focalPoint: 'Title', usage: 'outdoor', viewingDistance: '20 feet',
  widthIn: 72, heightIn: 36, material: '13oz', quantity: 1, productType: 'banner',
  textPosition: 'center', logoPosition: 'upper-right', textColor: '#ffffff', accentColor: '#ff6600',
  typographyMode: 'ai', logoRendering: 'integrated',
  copy: { headline: 'Fall festival', supportingText: '', offer: '', callToAction: '', businessName: '', phone: '', website: '', address: '', date: '', other: '' },
};
function concept(n: number, overrides: Partial<AIConcept> = {}): AIConcept {
  return {
    id: 'same-concept-family', versionId: `v${n}`, generationId: 'generation', backgroundRef: `background-${n}`,
    imageBase64: btoa(`preview-${n}`), mimeType: 'image/jpeg', widthPx: 2000, heightPx: 1000,
    widthIn: 72, heightIn: 36, aspectRatio: 2, printReady: true, textLayers: [], logoLayer: null,
    brief: { ...brief, copy: { ...brief.copy, headline: `Version ${n} wording` } },
    logoImage: null, referenceImage: null, photoImages: [],
    validation: { status: 'passed', passed: true, reasons: [], checks: {
      dimensions: { passed: true, width: 2000, height: 1000, expectedWidth: 2000, expectedHeight: 1000 },
      aspectRatio: { passed: true, requested: 2, actual: 2 }, edgeCoverage: { passed: true, suspiciousEdges: [] },
      resolution: { passed: true, effectivePpi: 150, minimumPpi: 100 }, flatArtwork: { passed: true, flags: [], confidence: 1 },
      exactText: { passed: true, required: [], detected: [] },
    }, vision: { available: true, model: 'test', requestId: null } },
    diagnostics: { model: 'test', modelSnapshot: null, providerRequestId: null, durationMs: 100, outputDimensions: '2000x1000', requestedAspectRatio: 2, finalAspectRatio: 2, ratioStrategy: 'native', repaired: false, estimatedCostUsd: null },
    ...overrides,
  };
}
let host: HTMLDivElement;
let root: Root;
let generated: ReturnType<typeof vi.fn>;
let closed: ReturnType<typeof vi.fn>;
let editRequests: Record<string, unknown>[];
let nextVersion: number;
let failJob: boolean;
let fetchMock: ReturnType<typeof vi.fn>;
const session = (selected = concept(1), versions: AIConcept[] = []): AIDesignSession => ({
  selectedConcept: selected, versionHistory: versions, brief: selected.brief!, generationId: 'generation', referenceImage: null, logoImage: null, photoImages: [],
});
async function mount(initialSession?: AIDesignSession) {
  await act(async () => root.render(<AIWorkspace productType="banner" widthIn={72} heightIn={36} material="13oz" initialSession={initialSession} onGenerated={generated} onClose={closed} />));
}
function button(name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(item => (item.getAttribute('aria-label') || item.textContent?.trim()) === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function enterEdit(text: string) {
  const input = [...host.querySelectorAll('textarea')].find(item => item.closest('label')?.textContent?.startsWith('Edit with AI'))!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function finishJob() {
  // Wait for the actual WebCrypto digest before advancing the polling timer.
  await act(async () => { await new Promise<void>(resolve => setImmediate(resolve)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
}
async function edit(text = 'Make the background lighter') {
  await enterEdit(text);
  await click('Edit current design');
  await finishJob();
}
function selectedImage() { return host.querySelector('img[alt="Complete selected flat print artwork"]')?.getAttribute('src'); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.records.clear(); mocks.save.mockClear(); mocks.track.mockClear(); sessionStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  generated = vi.fn(async () => {}); closed = vi.fn(); editRequests = []; nextVersion = 2; failJob = false;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (url.endsWith('/ai-designer-edit')) {
      editRequests.push(body);
      return { ok: true, json: async () => ({ jobRef: `job-${nextVersion}`, pollAfterMs: 1 }) };
    }
    if (url.endsWith('/ai-designer-worker-background')) return { ok: true };
    if (url.endsWith('/ai-designer-job')) {
      if (failJob) return { ok: true, json: async () => ({ status: 'failed', message: 'Please retry this edit.' }) };
      const result = concept(nextVersion++);
      return { ok: true, json: async () => ({ status: 'completed', usedOriginalImage: true, concept: result, brief: result.brief }) };
    }
    if (url.endsWith('/ai-designer-export')) return { ok: false, json: async () => ({}) };
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('customer AI version selection and handoff', () => {
  it('keeps a new preview through an HTML gateway error and recovers the same edited result', async () => {
    await mount(session());
    const normal = fetchMock.getMockImplementation()!;
    let polls = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/ai-designer-job')) {
        polls += 1;
        if (polls === 1) return new Response(JSON.stringify({ status: 'processing', previewVersion: 'preview-2', preview: { mimeType: 'image/jpeg', imageBase64: concept(2).imageBase64 } }));
        if (polls === 2) return new Response('<html>Bad gateway</html>', { status: 502 });
      }
      return normal(url, init);
    });
    await edit();
    const preview = () => host.querySelector('img[alt="New artwork — print checks in progress"]');
    expect(preview()?.getAttribute('src')).toBe(`data:image/jpeg;base64,${concept(2).imageBase64}`);
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(host.textContent).toContain('Reconnecting to your design');
    expect(preview()).not.toBeNull();
    expect(selectedImage()).toContain(concept(1).imageBase64);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(selectedImage()).toContain(concept(2).imageBase64);
    expect(editRequests).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/ai-designer-worker-background'))).toHaveLength(1);
    await click('Use selected version & continue');
    expect(generated.mock.calls[0][0].imageBase64).toBe(concept(2).imageBase64);
  });
  it('preserves an interrupted preview across closing and reopening, then retrieves the same edit', async () => {
    await mount(session());
    const normal = fetchMock.getMockImplementation()!;
    let polls = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/ai-designer-job')) {
        polls += 1;
        if (polls === 1) return new Response(JSON.stringify({ status: 'processing', previewVersion: 'preview-2', preview: { mimeType: 'image/jpeg', imageBase64: concept(2).imageBase64 } }));
        return new Response('', { status: 503 });
      }
      return normal(url, init);
    });
    await edit();
    await act(async () => { await vi.advanceTimersByTimeAsync(95_000); });
    expect(host.querySelector('img[alt="Latest artwork preview — not yet finalized"]')?.getAttribute('src')).toContain(concept(2).imageBase64);
    expect(button('Check for finished design').disabled).toBe(false);
    expect(button('Create another design').disabled).toBe(true);
    await act(async () => root.unmount()); root = createRoot(host); await mount(session());
    expect(host.querySelector('img[alt="Latest artwork preview — not yet finalized"]')).not.toBeNull();
    fetchMock.mockImplementation(normal);
    await click('Check for finished design'); await finishJob();
    expect(selectedImage()).toContain(concept(2).imageBase64);
    expect(editRequests).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/ai-designer-worker-background'))).toHaveLength(1);
    expect(host.querySelector('img[alt="Latest artwork preview — not yet finalized"]')).toBeNull();
  });
  it('recovers after Stop waiting without regenerating or losing saved versions', async () => {
    await mount(session());
    await enterEdit('Change the headline'); await click('Edit current design');
    await act(async () => { await new Promise<void>(resolve => setImmediate(resolve)); });
    await click('Stop waiting');
    expect(selectedImage()).toContain(concept(1).imageBase64);
    await click('Check for finished design'); await finishJob();
    expect(selectedImage()).toContain(concept(2).imageBase64);
    expect(editRequests).toHaveLength(1);
  });
  it('allows a new request after a definitive worker failure, without approving its unfinished preview', async () => {
    await mount(session()); failJob = true;
    await edit('Change the headline');
    expect(host.textContent).toContain('Please retry this edit.');
    expect(host.textContent).not.toContain('Check for finished design');
    expect(button('Create another design').disabled).toBe(false);
    expect(selectedImage()).toContain(concept(1).imageBase64);
    failJob = false; await edit('Change the headline');
    expect(selectedImage()).toContain(concept(2).imageBase64);
    expect(editRequests).toHaveLength(2);
  });
  it('completes three edits from the latest source and continues with the third edited image', async () => {
    await mount(session());
    await edit('First edit'); await edit('Second edit'); await edit('Third edit');
    expect(editRequests.map(item => item.currentBackgroundRef)).toEqual(['background-1', 'background-2', 'background-3']);
    expect(button('Select version 4').getAttribute('aria-pressed')).toBe('true');
    expect(selectedImage()).toBe(`data:image/jpeg;base64,${concept(4).imageBase64}`);
    await click('Use selected version & continue');
    expect(generated).toHaveBeenCalledWith(expect.objectContaining({
      imageBase64: concept(4).imageBase64,
      session: expect.objectContaining({ selectedConcept: expect.objectContaining({ versionId: 'v4', backgroundRef: 'background-4' }), versionHistory: expect.arrayContaining([expect.objectContaining({ versionId: 'v1' }), expect.objectContaining({ versionId: 'v4' })]) }),
    }));
    expect(closed).toHaveBeenCalledOnce();
  });
  it('keeps all later versions selectable after selecting an older version and undo/redo', async () => {
    await mount(session(concept(4), [concept(1), concept(2), concept(3), concept(4)]));
    await click('Select version 2'); await click('Undo');
    expect(button('Select version 4').getAttribute('aria-pressed')).toBe('true');
    await click('Redo');
    expect(button('Select version 2').getAttribute('aria-pressed')).toBe('true');
    await click('Use selected version & continue');
    expect(generated.mock.calls[0][0].imageBase64).toBe(concept(2).imageBase64);
    expect(generated.mock.calls[0][0].session.versionHistory).toHaveLength(4);
  });
  it('edits an explicitly selected older version and keeps the newer alternatives', async () => {
    await mount(session(concept(3), [concept(1), concept(2), concept(3)])); nextVersion = 4;
    await click('Select version 1'); await edit();
    expect(editRequests[0].currentBackgroundRef).toBe('background-1');
    expect(button('Select version 4').getAttribute('aria-pressed')).toBe('true');
    expect(button('Select version 3')).toBeDefined();
  });
  it('locks version switching during a request and retains the original after failure', async () => {
    await mount(session(concept(2), [concept(1), concept(2)]));
    failJob = true; await enterEdit('Fail once'); await click('Edit current design');
    expect(button('Select version 1').disabled).toBe(true);
    expect(button('Please wait…').disabled).toBe(true);
    await click('Select version 1'); await finishJob();
    expect(selectedImage()).toBe(`data:image/jpeg;base64,${concept(2).imageBase64}`);
    expect(host.textContent).toContain('Please retry this edit.');
    expect(button('Use selected version & continue').disabled).toBe(false);
  });
  it('flushes a quick close and restores all versions and the selection in the same order', async () => {
    await mount(session(concept(3), [concept(1), concept(2), concept(3)]));
    await click('Select version 1');
    await act(async () => root.unmount());
    expect(mocks.save).toHaveBeenCalled();
    root = createRoot(host); await mount();
    expect(button('Select version 1').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('img[alt="Saved banner version 3"]')?.getAttribute('src')).toBe(`data:image/jpeg;base64,${concept(3).imageBase64}`);
  });
  it('recovers newer edits when reopening from the previously applied version', async () => {
    await mount(session()); await edit();
    await act(async () => root.unmount()); root = createRoot(host); await mount(session());
    expect(button('Select version 2').getAttribute('aria-pressed')).toBe('true');
  });
  it('requests the selected production artwork and preserves selection when export fails', async () => {
    const original = concept(1, { artworkRef: 'print-original' });
    const edited = concept(2, { artworkRef: 'print-edited' });
    await mount(session(edited, [original, edited]));
    await click('Use selected version & continue');
    const exportCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/ai-designer-export'))!;
    expect(JSON.parse(exportCall[1].body).artworkRef).toBe('print-edited');
    expect(generated).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled();
    expect(button('Select version 2').getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('production artwork could not be retrieved');
  });
});

describe('customer print review', () => {
  function flagged(flags: string[], unavailable = false) {
    const result = concept(1);
    result.validation.passed = false;
    result.validation.status = 'failed';
    result.validation.checks.flatArtwork = { passed: false, flags, confidence: 0.98 };
    result.validation.vision.available = !unavailable;
    if (unavailable) result.validation.checks.exactText.passed = false;
    result.validation.reasons = ['Internal checker diagnostic'];
    return result;
  }
  it('lets an existing margin-only design continue with a visible advisory and no override dialog', async () => {
    const original = flagged(['importantContentOutsideSafeMargins']);
    await mount(session(original));
    expect(host.querySelector('[data-testid="ai-print-review"]')?.textContent).toContain('close to the edge');
    expect(host.textContent).not.toContain('Internal checker diagnostic');
    expect(host.textContent).not.toContain('Review warning');
    await click('Use selected version & continue');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(generated.mock.calls[0][0].session.selectedConcept.validation.passed).toBe(false);
    expect(generated.mock.calls[0][0].imageBase64).toBe(original.imageBase64);
  });
  it('allows review and continuation when visual checking is unavailable without claiming it passed', async () => {
    await mount(session(flagged(['visionUnavailable'], true)));
    expect(host.textContent).toContain('automatic visual check could not finish');
    expect(host.textContent).not.toContain('Wording check: Failed');
    await click('Use selected version & continue');
    expect(generated).toHaveBeenCalledOnce();
    expect(generated.mock.calls[0][0].session.selectedConcept.validation.vision.available).toBe(false);
  });
  it.each(['clippedContent', 'unexpectedText'])('retains explicit review for %s even alongside a margin advisory', async flag => {
    await mount(session(flagged(['importantContentOutsideSafeMargins', flag])));
    await click('Review design & continue');
    expect(generated).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(flag === 'clippedContent' ? 'cut off at the edge' : 'extra wording');
    const approve = [...dialog.querySelectorAll('button')].find(item => item.textContent === 'Approve design & continue')!;
    await act(async () => (approve as HTMLButtonElement).click());
    expect(generated).toHaveBeenCalledOnce();
  });
  it('does not dismiss a real resolution failure when the visual checker is unavailable', async () => {
    const original = flagged(['visionUnavailable'], true);
    original.validation.checks.resolution.passed = false;
    await mount(session(original));
    expect(host.textContent).toContain('image may look soft');
    expect(button('Review design & continue')).toBeDefined();
  });
  it('creates a spacing edit from the selected version and preserves the original for undo', async () => {
    await mount(session(flagged(['importantContentOutsideSafeMargins'])));
    await click('Give text more space');
    await finishJob();
    expect(editRequests).toHaveLength(1);
    expect(editRequests[0]).toMatchObject({ currentBackgroundRef: 'background-1', previousCopy: concept(1).brief!.copy });
    expect(editRequests[0].editInstruction).toContain('Preserve every word');
    expect(selectedImage()).toContain(concept(2).imageBase64);
    await click('Undo');
    expect(selectedImage()).toContain(concept(1).imageBase64);
  });
  it('keeps the selected artwork usable when a spacing edit fails', async () => {
    await mount(session(flagged(['importantContentOutsideSafeMargins']))); failJob = true;
    await click('Give text more space'); await finishJob();
    expect(selectedImage()).toContain(concept(1).imageBase64);
    expect(button('Use selected version & continue').disabled).toBe(false);
  });
});
