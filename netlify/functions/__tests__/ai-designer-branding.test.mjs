import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const handlerPath = require.resolve('../_shared/ai-designer/handler.cjs');
const localRequire = createRequire(handlerPath);
const { normalizeBrief } = localRequire('./schema.cjs');
const { prepareLogo, logoPlacement, logoPlate, logoPrompt } = localRequire('./logo.cjs');

function loadModule(filename, overrides = {}, suffix = '', globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + suffix, {
    module, exports: module.exports, require: id => overrides[id] || localRequire(id), Buffer,
    process: { env: { OPENAI_API_KEY: 'nonfunctional-test-placeholder' } },
    console: { info() {}, error() {} }, AbortController, setTimeout, clearTimeout, ...globals,
  }, { filename });
  return module.exports;
}

async function fixture({ outpaint = false } = {}) {
  const background = await sharp({ create: { width: 320, height: 160, channels: 3, background: '#fff2de' } }).png().toBuffer();
  const logoBuffer = await sharp({ create: { width: 80, height: 50, channels: 3, background: '#fff2de' } })
    .composite([{ input: Buffer.from('<svg width="80" height="50"><circle cx="40" cy="25" r="20" fill="#ef92b5"/></svg>') }]).png().toBuffer();
  const logoImage = `data:image/png;base64,${logoBuffer.toString('base64')}`;
  const brief = normalizeBrief({ description: 'Create a coming soon bakery banner using brand colors from the logo.', widthIn: 48, heightIn: 24, colorPalette: 'Navy, white, and restrained orange accents', copyOverrides: { headline: 'COMING SOON', supportingText: '' } });
  const interpreted = { colorPalette: 'Pink #ef92b5 and cream #fff2de', textColor: '#653b46', accentColor: '#ef92b5', copy: { headline: 'Coming Soon', supportingText: 'Unwanted text' } };
  const structureCreativeBrief = vi.fn(async () => ({ brief: interpreted, model: 'mock' }));
  const generateImage = vi.fn(async () => ({ buffer: background, model: 'mock' }));
  const editImage = vi.fn(async () => ({ buffer: background, model: 'mock' }));
  const compositeArtwork = vi.fn(localRequire('./compositor.cjs').compositeArtwork);
  const overrides = {
    './provider.cjs': { structureCreativeBrief, generateImage, editImage },
    './storage.cjs': { storeTemporaryArtwork: vi.fn(async () => 'artwork-ref') },
    './image-utils.cjs': { ...localRequire('./image-utils.cjs'), normalizeBackground: async buffer => buffer, planCanvas: () => ({ finalWidth: 320, finalHeight: 160, providerSize: '320x160', strategy: outpaint ? 'gpt-image-2-outpainting' : 'native-exact-ratio' }), prepareOutpaintInput: async () => ({ image: background, mimeType: 'image/png', mask: background }) },
    './compositor.cjs': { compositeArtwork },
    './validation.cjs': { validateArtwork: vi.fn(async () => ({ passed: true, status: 'passed', checks: {} })) },
  };
  const handlers = loadModule(handlerPath, overrides, '\nmodule.exports.runGenerateRequest = runGenerateRequest; module.exports.runBriefRequest = runBriefRequest;');
  return { handlers, brief, logoImage, logoBuffer, background, structureCreativeBrief, generateImage, editImage, compositeArtwork };
}

describe('logo-aware brand planning and image generation', () => {
  it('plans an unstructured request with the actual logo, then generates once using that logo', async () => {
    const f = await fixture();
    const result = await f.handlers.runGenerateRequest({ brief: f.brief, logoImage: f.logoImage }, { sub: 'admin' }, 'job');
    expect(f.structureCreativeBrief).toHaveBeenCalledOnce();
    const planning = f.structureCreativeBrief.mock.calls[0][0];
    expect(planning.current.colorPalette).not.toMatch(/navy|orange/i);
    expect(planning.logoImage.buffer.equals((await prepareLogo({ buffer: f.logoBuffer })).buffer)).toBe(true);
    expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.editImage).toHaveBeenCalledOnce();
    const generation = f.editImage.mock.calls[0][0];
    expect(generation.currentImage.equals(planning.logoImage.buffer)).toBe(true);
    expect(generation.prompt).toContain('Pink #ef92b5 and cream #fff2de');
    expect(generation.prompt).toContain('BRAND COLOR PRIORITY');
    expect(generation.prompt).toContain('Never run a headline behind or underneath the logo');
    expect(generation.prompt).toContain('Do not draw, copy, recreate, or render that logo anywhere');
    expect(generation.prompt).not.toMatch(/navy|orange/i);
    expect(result.brief.copy.headline).toBe('COMING SOON');
    expect(result.brief.copy.supportingText).toBe('');
    expect(result.brief.accentColor).toBe('#ef92b5');
    expect(f.compositeArtwork.mock.calls[0][0].logo.buffer.equals(planning.logoImage.buffer)).toBe(true);
  });

  it('passes both distinct style reference and logo when the brief is already reviewed', async () => {
    const f = await fixture();
    await f.handlers.runGenerateRequest({ brief: { ...f.brief, structured: true, colorPalette: 'Pink and cream' }, logoImage: f.logoImage, referenceImage: `data:image/png;base64,${f.background.toString('base64')}` }, { sub: 'admin' }, 'job');
    expect(f.structureCreativeBrief).not.toHaveBeenCalled();
    const generation = f.editImage.mock.calls[0][0];
    expect(generation.currentImage.equals(f.background)).toBe(true);
    expect(generation.logoReferenceImage.buffer).toBeTruthy();
    expect(generation.prompt).toContain('second supplied image is the customer logo');
  });

  it('still uses text-only image generation when no upload exists', async () => {
    const f = await fixture();
    await f.handlers.runGenerateRequest({ brief: { ...f.brief, structured: true } }, { sub: 'admin' }, 'job');
    expect(f.generateImage).toHaveBeenCalledOnce();
    expect(f.editImage).not.toHaveBeenCalled();
  });

  it('keeps the logo reference through the additional extreme-ratio outpainting pass', async () => {
    const f = await fixture({ outpaint: true });
    await f.handlers.runGenerateRequest({ brief: { ...f.brief, structured: true }, logoImage: f.logoImage }, { sub: 'admin' }, 'job');
    expect(f.editImage).toHaveBeenCalledTimes(2);
    const outpainting = f.editImage.mock.calls[1][0];
    expect(outpainting.logoReferenceImage.buffer.equals((await prepareLogo({ buffer: f.logoBuffer })).buffer)).toBe(true);
    expect(outpainting.maskImage).toBe(f.background);
    expect(outpainting.prompt).toContain('Never run a headline behind or underneath the logo');
  });

  it('does not reassert original brand colors over a subsequent requested color edit', () => {
    const { buildEditPrompt } = localRequire('./prompt.cjs');
    const brief = { ...normalizeBrief({ description: 'Use brand colors from the logo', widthIn: 48, heightIn: 24 }), typographyMode: 'ai', hasProtectedLogo: true };
    const prompt = buildEditPrompt(brief, { strategy: 'native-exact-ratio' }, 'Change the background to blue');
    expect(prompt).toContain('Change the background to blue');
    expect(prompt).not.toContain('BRAND COLOR PRIORITY');
  });

  it('sends the logo to the real brief provider as a vision image and to image edits as a distinct input', async () => {
    const f = await fixture();
    const create = vi.fn(async () => ({ output_text: '{}' }));
    const edit = vi.fn(async () => ({ data: [{ b64_json: f.background.toString('base64') }] }));
    const client = { responses: { create }, images: { edit } };
    const toFile = vi.fn(async (buffer, name, options) => ({ buffer, name, ...options }));
    const providerPath = localRequire.resolve('./provider.cjs');
    const provider = loadModule(providerPath, {}, '\ncachedClient = { client: testClient, toFile: testToFile };', { testClient: client, testToFile: toFile });
    const logo = await prepareLogo({ buffer: f.logoBuffer });
    await provider.structureCreativeBrief({ description: f.brief.description, current: {}, logoImage: logo });
    const content = create.mock.calls[0][0].input[0].content;
    expect(content.find(item => item.type === 'input_image')).toMatchObject({ image_url: `data:image/png;base64,${logo.buffer.toString('base64')}`, detail: 'high' });
    await provider.editImage({ prompt: 'Edit the current banner', size: '320x160', currentImage: f.background, referenceImage: { buffer: f.background, mimeType: 'image/png' }, logoReferenceImage: logo });
    const request = edit.mock.calls[0][0];
    expect(request.image).toHaveLength(3);
    expect(request.image[2].buffer).toBe(logo.buffer);
    expect(request.image[2].name).toBe('customer-logo-brand-reference.png');
    expect(request.prompt).toContain('never as artwork to copy or redraw');
  });

  it('reserves the actual padded logo footprint used by the compositor', async () => {
    const f = await fixture();
    const mark = await sharp(Buffer.from('<svg width="80" height="50"><circle cx="40" cy="25" r="20" fill="#ef92b5"/></svg>')).png().toBuffer();
    const logo = await prepareLogo({ buffer: mark });
    const brief = { ...f.brief, typographyMode: 'ai', outputWidthPx: 320, outputHeightPx: 160, logoAspectRatio: logo.width / logo.height, logoNeedsContrastPlate: logo.needsContrastPlate };
    const composed = await localRequire('./compositor.cjs').compositeArtwork({ background: f.background, brief, logo });
    const plate = logoPlate(logoPlacement(brief, 320, 160, brief.logoAspectRatio), 320, 160);
    expect(composed.logoLayer.plate).toMatchObject(plate);
    const prompt = logoPrompt(brief);
    expect(prompt).toContain(`left ${(plate.left / 320 * 100).toFixed(1)}%`);
    expect(prompt).toContain(`width ${(plate.width / 320 * 100).toFixed(1)}%`);
    expect(prompt).toContain('at least 3% canvas breathing room');
  });
});
