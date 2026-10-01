import { expect, test, type Page } from '@playwright/test';
import type { AIConcept, AIDesignSession, CreativeBrief } from '../../src/components/design/ai/types';

const brief: CreativeBrief = {
  structured: true, description: 'A fall festival banner with warm orange leaves', purpose: 'Event', targetAudience: 'Families',
  primaryMessage: 'Fall festival', visualStyle: 'Bold', brandPersonality: 'Friendly', colorPalette: 'Orange', subjectMatter: 'Leaves',
  composition: 'Centered', focalPoint: 'Title', usage: 'outdoor', viewingDistance: '20 feet', widthIn: 72, heightIn: 36,
  material: '13oz', quantity: 1, productType: 'banner', textPosition: 'center', logoPosition: 'upper-right',
  textColor: '#ffffff', accentColor: '#ff6600', typographyMode: 'ai', logoRendering: 'integrated',
  copy: { headline: 'FALL FESTIVAL', supportingText: 'EVERYONE WELCOME', businessName: 'Example Community Center', offer: '', callToAction: '', phone: '', website: '', address: '', date: '', other: '' },
};
function concept(version: number, savedBrief = brief): AIConcept {
  return {
    id: 'test-concept', versionId: `v${version}`, generationId: 'test-generation', backgroundRef: `test-background-${version}`,
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nE8AAAAASUVORK5CYII=',
    mimeType: 'image/png', widthPx: 2000, heightPx: 1000, widthIn: 72, heightIn: 36, aspectRatio: 2, printReady: true,
    textLayers: [], logoLayer: null, brief: savedBrief, logoImage: null, referenceImage: null, photoImages: [],
    validation: { status: 'passed', passed: true, reasons: [], checks: {
      dimensions: { passed: true, width: 2000, height: 1000, expectedWidth: 2000, expectedHeight: 1000 },
      aspectRatio: { passed: true, requested: 2, actual: 2 }, edgeCoverage: { passed: true, suspiciousEdges: [] },
      resolution: { passed: true, effectivePpi: 150, minimumPpi: 100 }, flatArtwork: { passed: true, flags: [], confidence: 1 },
      exactText: { passed: true, required: [], detected: [] },
    }, vision: { available: true, model: 'mock', requestId: null } },
    diagnostics: { model: 'mock', modelSnapshot: null, providerRequestId: null, durationMs: 1, outputDimensions: '2000x1000', requestedAspectRatio: 2, finalAspectRatio: 2, ratioStrategy: 'test', repaired: false, estimatedCostUsd: null },
  };
}
async function setup(page: Page, savedBrief = brief) {
  const selected = concept(1, savedBrief);
  const initial: AIDesignSession = { selectedConcept: selected, versionHistory: [selected], brief: savedBrief, generationId: selected.generationId, referenceImage: null, logoImage: null, photoImages: [] };
  await page.addInitScript(session => { Object.assign(window, { __aiEditSession: session }); }, initial);
  const edits: Array<{ brief: CreativeBrief; currentBackgroundRef: string; editInstruction: string; editMode: string }> = [];
  const state = { fail: false };
  // The harness never contacts providers, storage, analytics, or production APIs.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/.netlify/functions/')) return route.continue();
    let body: unknown = {};
    if (url.pathname.endsWith('/ai-designer-status')) body = { authorized: true, enabled: true, ready: true, sessionKey: 'edit-browser-test' };
    else if (url.pathname.endsWith('/ai-designer-edit')) {
      edits.push(route.request().postDataJSON());
      body = { jobRef: `job-${edits.length}`, pollAfterMs: 1 };
    } else if (url.pathname.endsWith('/ai-designer-worker-background')) body = {};
    else if (url.pathname.endsWith('/ai-designer-job')) {
      const edited = concept(edits.length + 1, edits.at(-1)!.brief);
      body = state.fail ? { status: 'failed', message: 'Please retry this edit.' } : { status: 'completed', usedOriginalImage: true, concept: edited, brief: edited.brief };
    } else return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/tests/browser/ai-edit-recovery.html');
  await expect(page.getByText('Ready to create', { exact: true })).toBeVisible();
  if (savedBrief.description) await expect(page.getByRole('button', { name: 'Improve prompt with AI' })).toBeEnabled();
  return { edits, state };
}

test('cleared description recovers wording, preserves deletion, retries, and continues with the edited version', async ({ page }) => {
  const { edits, state } = await setup(page);
  await page.getByLabel('Describe the design you want').fill('');
  await expect(page.getByRole('button', { name: 'Apply your changes before continuing' })).toBeDisabled();
  await page.getByText('Edit text, fonts & placement', { exact: true }).click();
  await page.getByRole('button', { name: 'Remove this text' }).click();
  await page.getByLabel(/^Edit with AI/).fill('Make the background lighter');
  state.fail = true;
  await page.getByRole('button', { name: 'Edit current design', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Please retry this edit.');
  expect(edits).toHaveLength(1);
  expect(edits[0]).toMatchObject({ currentBackgroundRef: 'test-background-1', brief: { description: brief.description, copy: { ...brief.copy, headline: '' }, copyOverrides: { headline: '' } } });
  await expect(page.getByLabel('Describe the design you want')).toHaveValue('');
  state.fail = false;
  await page.getByRole('button', { name: 'Edit current design', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select version 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(edits[1].brief).toEqual(edits[0].brief);
  await page.getByRole('button', { name: 'Use selected version & continue', exact: true }).click();
  await expect(page.getByTestId('applied-version')).toHaveText('v3');
  await expect(page.getByTestId('ai-workspace')).toHaveCount(0);
});

test('quick close and reopen preserves a pending edit and restores its selected context', async ({ page }) => {
  const { edits } = await setup(page);
  await page.getByLabel('Describe the design you want').fill('');
  await page.getByLabel(/^Edit with AI/).fill('Make the background lighter');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen banner studio' }).click();
  await expect(page.getByLabel('Describe the design you want')).toHaveValue('');
  await expect(page.getByLabel(/^Edit with AI/)).toHaveValue('Make the background lighter');
  await page.getByRole('button', { name: 'Edit current design', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select version 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(edits[0].brief).toMatchObject({ description: brief.description, copy: brief.copy });
});

test('missing saved description focuses the local repair field without submitting a job', async ({ page }) => {
  const { edits } = await setup(page, { ...brief, description: '' });
  await page.getByLabel(/^Edit with AI/).fill('Make the background lighter');
  await page.getByRole('button', { name: 'Edit current design', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add a description');
  await expect(page.getByLabel('Describe the design you want')).toBeFocused();
  expect(edits).toHaveLength(0);
  await expect(page.getByLabel(/^Edit with AI/)).toHaveValue('Make the background lighter');
});
