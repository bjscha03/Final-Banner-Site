import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const handlerPath = require.resolve('../_shared/ai-designer/handler.cjs');
const localRequire = createRequire(handlerPath);
const { isUploadedLogoRemoval } = localRequire('./edit-intent.cjs');
const { normalizeBrief } = localRequire('./schema.cjs');

async function fixture() {
  const background = await sharp({ create: { width: 160, height: 80, channels: 3, background: '#f975a4' } }).png().toBuffer();
  const logoBuffer = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const brief = normalizeBrief({ description: 'Grand opening bakery banner', widthIn: 48, heightIn: 24, typographyMode: 'ai', structured: true, copy: { headline: 'Grand Opening', businessName: 'Bake My Day!' } });
  const editImage = vi.fn(async () => ({ buffer: background, model: 'mock', usage: null }));
  const verifyModelAccess = vi.fn(async () => ({ available: true }));
  const planDesignEdit = vi.fn(async () => ({ copy: brief.copy, layers: brief.layers, removeLogo: true, removePhotos: [], backgroundInstruction: '' }));
  const normalizeBackground = vi.fn(async buffer => buffer);
  const storeTemporaryArtwork = vi.fn(async () => 'new-artwork-ref');
  const compositeArtwork = vi.fn(localRequire('./compositor.cjs').compositeArtwork);
  const validateArtwork = vi.fn(async () => ({ passed: true, status: 'passed', checks: [] }));
  const overrides = {
    './provider.cjs': { editImage, planDesignEdit, verifyModelAccess },
    './storage.cjs': { readTemporaryArtwork: vi.fn(async () => ({ buffer: background, mimeType: 'image/png' })), storeTemporaryArtwork, isTemporaryStorageConfigured: () => true, createJob: vi.fn(async () => ({ record: { status: 'queued' }, reference: 'queued-ref' })) },
    './config.cjs': { ...localRequire('./config.cjs'), isEnabled: () => true },
    './security.cjs': { ...localRequire('./security.cjs'), authorize: () => ({ session: { sub: 'test-admin' } }), enforceBodyLimit: () => null, rateLimit: () => null, idempotencyKey: () => 'test-key', runIdempotent: (_key, task) => task() },
    './image-utils.cjs': { ...localRequire('./image-utils.cjs'), normalizeBackground, planCanvas: () => ({ finalWidth: 160, finalHeight: 80, providerWidth: 160, providerHeight: 80, providerSize: '160x80', strategy: 'test' }) },
    './compositor.cjs': { compositeArtwork },
    './validation.cjs': { validateArtwork },
  };
  // Execute the actual worker implementation with external boundaries replaced;
  // no credentials, network, storage writes or production export are required.
  const module = { exports: {} };
  vm.runInNewContext(`${fs.readFileSync(handlerPath, 'utf8')}\nmodule.exports.runEditRequest = runEditRequest;`, {
    module, exports: module.exports, require: id => overrides[id] || localRequire(id),
    Buffer, process: { env: { OPENAI_API_KEY: 'nonfunctional-test-placeholder' } }, console: { info() {}, error() {} },
  }, { filename: handlerPath });
  const request = {
    brief, editInstruction: 'remove logo', logoImage: `data:image/png;base64,${logoBuffer.toString('base64')}`,
    currentBackgroundRef: 'original-background-ref', previousCopy: brief.copy, previousValidation: { passed: true },
    generationId: 'generation', conceptId: 'concept',
  };
  return { run: overrides => module.exports.runEditRequest({ ...request, ...overrides }, { sub: 'test-admin' }), enqueue: overrides => module.exports.editHandler({ httpMethod: 'POST', body: JSON.stringify({ ...request, ...overrides }) }), background, brief, editImage, planDesignEdit, verifyModelAccess, normalizeBackground, storeTemporaryArtwork, compositeArtwork, validateArtwork };
}

describe('protected uploaded-logo removal', () => {
  it.each(['ai', 'remove-logo'])('queues %s logo removal without even probing the image model', async editMode => {
    const f = await fixture();
    const response = await f.enqueue({ editMode });
    expect(response.statusCode).toBe(202);
    expect(f.verifyModelAccess).not.toHaveBeenCalled();
  });

  it('still probes image model access before queuing a mixed artwork edit', async () => {
    const f = await fixture();
    const response = await f.enqueue({ editInstruction: 'remove logo and make background blue' });
    expect(response.statusCode).toBe(202);
    expect(f.verifyModelAccess).toHaveBeenCalledOnce();
  });
  it.each(['remove logo', 'Remove the uploaded logo.', 'Please remove my attached logo!', 'delete only the logo', 'remove the logo I attached', 'remove the logo overlay', 'could you remove the original logo please'])('recognizes standalone command: %s', instruction => {
    expect(isUploadedLogoRemoval(instruction, true)).toBe(true);
  });

  it.each(['do not remove logo', 'remove logo and make the background blue', 'remove the generated logo', 'remove the logo underneath the upload', 'make the logo bigger', 'remove the logo text'])('does not swallow a different or mixed request: %s', instruction => {
    expect(isUploadedLogoRemoval(instruction, true)).toBe(false);
  });

  it('does not interpret generated artwork as an uploaded layer when no upload exists', () => {
    expect(isUploadedLogoRemoval('remove logo', false)).toBe(false);
  });

  it.each(['ai', 'remove-logo'])('%s removal keeps the background bytes/reference and bypasses both planner and image editor', async editMode => {
    const f = await fixture();
    const result = await f.run({ editMode });
    expect(f.planDesignEdit).not.toHaveBeenCalled();
    expect(f.editImage).not.toHaveBeenCalled();
    expect(f.normalizeBackground).not.toHaveBeenCalled();
    expect(f.compositeArtwork).toHaveBeenCalledOnce();
    expect(f.compositeArtwork.mock.calls[0][0].background).toBe(f.background);
    expect(f.compositeArtwork.mock.calls[0][0].logo).toBeNull();
    expect(f.validateArtwork.mock.calls[0][0].background.equals(f.background)).toBe(true);
    expect(f.storeTemporaryArtwork).toHaveBeenCalledOnce();
    expect(result.backgroundUnchanged).toBe(true);
    expect(result.logoRemoved).toBe(true);
    expect(result.concept.backgroundRef).toBe('original-background-ref');
    expect(result.concept.logoLayer).toBeNull();
    expect(result.concept.diagnostics.estimatedCostUsd).toBe(0);
    expect(result.brief.copy).toEqual(f.brief.copy);
  });

  it('also protects the background when the planner identifies a differently worded layer-only removal', async () => {
    const f = await fixture();
    const result = await f.run({ editInstruction: 'Get rid of that uploaded brand mark' });
    expect(f.planDesignEdit).toHaveBeenCalledOnce();
    expect(f.editImage).not.toHaveBeenCalled();
    expect(result.backgroundUnchanged).toBe(true);
    expect(result.concept.backgroundRef).toBe('original-background-ref');
  });

  it('keeps the other requested visual edit without forwarding removal to the image model', async () => {
    const f = await fixture();
    f.planDesignEdit.mockResolvedValue({ copy: f.brief.copy, layers: {}, removeLogo: true, removePhotos: [], backgroundInstruction: 'Make the background blue.' });
    const result = await f.run({ editInstruction: 'remove logo and make the background blue' });
    expect(f.editImage).toHaveBeenCalledOnce();
    expect(f.editImage.mock.calls[0][0].prompt).toContain('Make the background blue.');
    expect(f.editImage.mock.calls[0][0].prompt).not.toContain('remove logo');
    expect(result.logoRemoved).toBe(true);
    expect(result.backgroundUnchanged).toBe(false);
  });

  it('keeps requested wording replacements in a mixed logo-removal edit', async () => {
    const f = await fixture();
    f.planDesignEdit.mockResolvedValue({ copy: { ...f.brief.copy, headline: 'Now Open' }, layers: {}, removeLogo: true, removePhotos: [], backgroundInstruction: '' });
    await f.run({ editInstruction: 'remove logo and change Grand Opening to Now Open' });
    expect(f.editImage).toHaveBeenCalledOnce();
    expect(f.editImage.mock.calls[0][0].prompt).toContain('Now Open');
    expect(f.editImage.mock.calls[0][0].prompt).not.toContain('remove logo');
  });

  it('leaves ordinary image edits routed through the image provider', async () => {
    const f = await fixture();
    f.planDesignEdit.mockResolvedValue({ copy: f.brief.copy, layers: {}, removeLogo: false, removePhotos: [], backgroundInstruction: 'Make background blue' });
    const result = await f.run({ editInstruction: 'Make background blue' });
    expect(f.editImage).toHaveBeenCalledOnce();
    expect(result.logoRemoved).toBe(false);
    expect(result.concept.logoLayer).toBeTruthy();
  });

  it('routes the visible Remove logo button through the reviewable edit when a design exists', () => {
    const source = fs.readFileSync(new URL('../../../src/components/design/ai/AIWorkspace.tsx', import.meta.url), 'utf8');
    expect(source).toContain("kind === 'logo' && selected?.logoImage");
    expect(source).toContain('void edit(true, true, true)');
    expect(source).toContain("editMode: removeLogo ? 'remove-logo'");
    expect(source).toContain('currentBackgroundRef: selected.backgroundRef');
    expect(source).toContain('setPendingEdit(');
    expect(source).toContain('Only your uploaded logo was removed; the AI-created artwork underneath stayed unchanged.');
  });
});
