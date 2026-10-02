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

async function setValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function describeDesign(value: string) {
  await setValue(host.querySelector<HTMLTextAreaElement>('#ai-description')!, value);
}
function labeledInput(label: string): HTMLInputElement {
  return [...host.querySelectorAll('input')].find(input => input.closest('label')?.textContent?.startsWith(label))!;
}
function editedBrief(index = 0) { return editRequests[index].brief as CreativeBrief; }
const draftKey = 'customer:customer-test:banner:72:36';
function draft(selected: AIConcept, pendingBrief: CreativeBrief) {
  return { versionGallery: true, brief: pendingBrief, concepts: [selected], selectedId: selected.versionId,
    history: [], redo: [], logoImage: selected.logoImage, referenceImage: null, photoImages: [], editInstruction: 'Make the background lighter' };
}

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


describe('editing with a cleared original description', () => {
  it.each(['', '   \n  '])('recovers the selected description and approved wording for %j', async description => {
    const original = concept(1, { brief: { ...brief, copy: { ...brief.copy, businessName: 'Example Cafe', offer: '20% OFF' } } });
    await mount(session(original));
    await describeDesign(description);
    expect(labeledInput('Headline').value).toBe('');
    await edit('Make the background lighter');
    expect(editedBrief()).toMatchObject({ description: original.brief!.description, copy: original.brief!.copy, structured: true });
    expect(editRequests[0]).toMatchObject({ currentBackgroundRef: original.backgroundRef, editInstruction: 'Make the background lighter', previousCopy: original.brief!.copy });
    expect(selectedImage()).toBe(`data:image/jpeg;base64,${concept(2).imageBase64}`);
  });

  it.each(['before', 'after'])('keeps explicit wording edits and deletions made %s clearing the description', async timing => {
    await mount(session());
    if (timing === 'after') await describeDesign('');
    await setValue(labeledInput('Business name'), 'New Business');
    await click('Remove this text');
    if (timing === 'before') await describeDesign('');
    await edit();
    expect(editedBrief().copy).toMatchObject({ headline: '', businessName: 'New Business' });
    expect(editedBrief().copyOverrides).toMatchObject({ headline: '', businessName: 'New Business' });
    expect(editRequests[0].previousCopy).toMatchObject({ headline: 'Version 1 wording' });
  });

  it('preserves direction and layer settings when applying manual changes', async () => {
    await mount(session());
    await describeDesign('');
    await setValue(labeledInput('Text color'), '#123456');
    await setValue(host.querySelector<HTMLInputElement>('[aria-label="Element size"]')!, '1.5');
    await setValue(host.querySelector<HTMLInputElement>('[aria-label="Horizontal position"]')!, '0.65');
    await click('Apply changes'); await finishJob();
    expect(editRequests[0].editMode).toBe('layers');
    expect(editedBrief()).toMatchObject({ description: brief.description, textColor: '#123456', directionOverrides: { textColor: '#123456' }, layers: { headline: { scale: 1.5, x: 0.65 } }, copy: concept(1).brief!.copy });
  });

  it('recovers from the explicitly selected older version, not the latest version', async () => {
    const first = concept(1, { brief: { ...brief, description: 'First version description', copy: { ...brief.copy, headline: 'First wording' } } });
    const last = concept(3, { brief: { ...brief, description: 'Latest description', copy: { ...brief.copy, headline: 'Latest wording' } } });
    await mount(session(last, [first, concept(2), last])); nextVersion = 4;
    await click('Select version 1'); await describeDesign(''); await edit();
    expect(editedBrief()).toMatchObject({ description: 'First version description', copy: { headline: 'First wording' } });
    expect(editRequests[0].currentBackgroundRef).toBe('background-1');
    expect(button('Select version 3')).toBeDefined();
  });

  it('keeps a new nonempty description and explicit copy instead of restoring the saved brief', async () => {
    await mount(session()); await describeDesign('Use a blue background');
    await setValue(labeledInput('Headline'), 'Updated headline'); await edit();
    expect(editedBrief()).toMatchObject({ description: 'Use a blue background', copy: { headline: 'Updated headline' } });
  });

  it('recovers saved context while retaining pending changes in a restored draft', async () => {
    const original = concept(1);
    mocks.records.set(draftKey, draft(original, { ...original.brief!, description: '', copy: { ...original.brief!.copy, headline: '' }, copyOverrides: { headline: '' }, layers: { headline: { scale: 1.75 } } }));
    await mount();
    expect(button('Apply your changes before continuing').disabled).toBe(true);
    await click('Edit current design'); await finishJob();
    expect(editedBrief()).toMatchObject({ description: brief.description, copy: { headline: '' }, layers: { headline: { scale: 1.75 } } });
  });

  it('retains the dirty form and original artwork after failure and recovers on retry', async () => {
    await mount(session()); await describeDesign('');
    failJob = true; await edit('Make the background lighter');
    expect(selectedImage()).toBe(`data:image/jpeg;base64,${concept(1).imageBase64}`);
    expect(host.querySelector<HTMLTextAreaElement>('#ai-description')!.value).toBe('');
    expect(button('Apply your changes before continuing').disabled).toBe(true);
    expect(host.textContent).toContain('Please retry this edit.');
    failJob = false; await click('Edit current design'); await finishJob();
    expect(editRequests).toHaveLength(2);
    expect(editedBrief(1)).toEqual(editedBrief(0));
    expect(selectedImage()).toBe(`data:image/jpeg;base64,${concept(2).imageBase64}`);
    expect(host.textContent).not.toContain('Please retry this edit.');
  });

  it('flushes an unfinished edit on close and recovers its context after reopening', async () => {
    const initial = session();
    await mount(initial); await describeDesign(''); await enterEdit('Make the background lighter');
    await act(async () => root.unmount()); root = createRoot(host); await mount(initial);
    expect(host.querySelector<HTMLTextAreaElement>('#ai-description')!.value).toBe('');
    await click('Edit current design'); await finishJob();
    expect(editedBrief()).toMatchObject({ description: initial.brief.description, copy: initial.brief.copy });
  });

  it.each(['missing', 'blank'])('blocks locally when the selected description is %s and lets the customer fix it', async condition => {
    const original = concept(1, { brief: condition === 'missing' ? undefined : { ...brief, description: ' ' } });
    mocks.records.set(draftKey, draft(original, { ...brief, description: '' }));
    await mount(); await click('Edit current design');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.track.mock.calls.some(([event]) => event === 'ai_edit_started')).toBe(false);
    expect(host.textContent).toContain('Add a description in “Describe the design you want”');
    expect(document.activeElement).toBe(host.querySelector('#ai-description'));
    expect(selectedImage()).toBe(`data:image/jpeg;base64,${original.imageBase64}`);
    await describeDesign('Recovered banner description'); await click('Edit current design'); await finishJob();
    expect(editedBrief().description).toBe('Recovered banner description');
  });

  it('continues to block handoff until unapplied changes are applied or discarded', async () => {
    await mount(session()); await describeDesign('');
    expect(button('Apply your changes before continuing').disabled).toBe(true);
    await click('Apply your changes before continuing');
    expect(fetchMock).not.toHaveBeenCalled(); expect(generated).not.toHaveBeenCalled();
    await click('Discard unapplied changes');
    expect(host.querySelector<HTMLTextAreaElement>('#ai-description')!.value).toBe(brief.description);
    await click('Use selected version & continue');
    expect(generated).toHaveBeenCalledWith(expect.objectContaining({ imageBase64: concept(1).imageBase64, prompt: brief.description }));
  });

  it('does not allow blank descriptions for a new generation', async () => {
    await mount(); await describeDesign('  ');
    expect(button('Create my banner').disabled).toBe(true);
    await click('Create my banner');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe('repairing missing context for isolated logo actions', () => {
  it.each(['Apply logo changes', 'Remove uploaded logo'])('lets the customer repair the description before %s without applying unrelated copy edits', async action => {
    const original = concept(1, { brief: { ...brief, description: '', logoRendering: 'original' }, logoImage: 'data:image/png;base64,dGVzdA==' });
    const snapshot = structuredClone(original);
    await mount(session(original));
    await click(action);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Add a description');
    await describeDesign('Recovered logo banner description');
    await setValue(labeledInput('Headline'), 'Pending wording must not apply');
    await click(action); await finishJob();
    expect(editedBrief()).toMatchObject({ description: 'Recovered logo banner description', copy: original.brief!.copy });
    expect(editRequests[0].editMode).toBe(action === 'Apply logo changes' ? 'logo' : 'remove-logo');
    expect(original).toEqual(snapshot);
    await click('Select version 1');
    expect(host.querySelector<HTMLTextAreaElement>('#ai-description')!.value).toBe('');
    expect(labeledInput('Headline').value).toBe(original.brief!.copy.headline);
  });
});
