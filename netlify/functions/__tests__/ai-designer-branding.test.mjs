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
  const planDesignEdit = vi.fn(async () => ({ copy: brief.copy, layers: {}, removeLogo: false, removePhotos: [], backgroundInstruction: 'Make the background lighter' }));
  const compositeArtwork = vi.fn(localRequire('./compositor.cjs').compositeArtwork);
  const validateArtwork = vi.fn(async () => ({ passed: true, status: 'passed', checks: {} }));
  const overrides = {
    './provider.cjs': { structureCreativeBrief, generateImage, editImage, planDesignEdit },
    './storage.cjs': { storeTemporaryArtwork: vi.fn(async () => 'artwork-ref'), readTemporaryArtwork: vi.fn(async () => ({ buffer: background, mimeType: 'image/png' })) },
    './image-utils.cjs': { ...localRequire('./image-utils.cjs'), normalizeBackground: async buffer => buffer, planCanvas: () => ({ finalWidth: 320, finalHeight: 160, providerSize: '320x160', strategy: outpaint ? 'gpt-image-2-outpainting' : 'native-exact-ratio' }), prepareOutpaintInput: async () => ({ image: background, mimeType: 'image/png', mask: background }) },
    './compositor.cjs': { compositeArtwork },
    './validation.cjs': { validateArtwork },
  };
  const handlers = loadModule(handlerPath, overrides, '\nmodule.exports.runGenerateRequest = runGenerateRequest; module.exports.runBriefRequest = runBriefRequest; module.exports.runEditRequest = runEditRequest;');
  return { handlers, brief, logoImage, logoBuffer, background, structureCreativeBrief, generateImage, editImage, compositeArtwork, validateArtwork, planDesignEdit };
}

describe('logo-aware brand planning and image generation', () => {
  it('defaults legacy briefs to the original-logo treatment and preserves an explicit integrated choice', () => {
    const { freshPromptBrief } = localRequire('./schema.cjs');
    const input = { description: 'Coming soon', widthIn: 48, heightIn: 24 };
    expect(normalizeBrief(input).logoRendering).toBe('original');
    expect(freshPromptBrief({ ...input, logoRendering: 'integrated' }).logoRendering).toBe('integrated');
  });

  it('allows a conventional birthday headline but never an invented factual tagline', () => {
    const { groundedCopy } = localRequire('./schema.cjs');
    const brief = normalizeBrief({ description: 'A birthday banner for James', widthIn: 48, heightIn: 24 });
    expect(groundedCopy({ headline: 'Happy Birthday James!', supportingText: 'The best birthday parties in town' }, brief)).toMatchObject({ headline: 'Happy Birthday James!', supportingText: '' });
    expect(groundedCopy({ headline: 'Happy Birthday Thomas!' }, brief).headline).toBe('');
  });

  it('integrates one source logo without an overlay, fixed reservation, or duplicate logo wording in banner copy', async () => {
    const f = await fixture();
    f.structureCreativeBrief.mockResolvedValue({ brief: { copy: { headline: 'COMING SOON' }, logoWording: ['Bake My Day', 'Gluten Free Bakery'] } });
    const result = await f.handlers.runGenerateRequest({ brief: { ...f.brief, logoRendering: 'integrated' }, logoImage: f.logoImage }, { sub: 'admin' }, 'job');
    expect(f.structureCreativeBrief.mock.calls[0][0].logoRendering).toBe('integrated');
    const generation = f.editImage.mock.calls[0][0];
    expect(generation.logoRendering).toBe('integrated');
    expect(generation.prompt).toContain('Integrate the supplied customer logo ONCE');
    expect(generation.prompt).toContain('Gluten Free Bakery');
    expect(generation.prompt).not.toContain('will be placed afterward at');
    expect(generation.prompt).not.toContain('never reproduce the supplied logo');
    expect(result.brief.logoWording).toEqual(['Bake My Day', 'Gluten Free Bakery']);
    expect(result.brief.requiredText).toEqual(['COMING SOON']);
    expect(result.concepts[0].logoLayer).toBeNull();
    const validation = f.validateArtwork.mock.calls[0][0];
    expect(validation.logoReference.buffer.equals((await prepareLogo({ buffer: f.logoBuffer })).buffer)).toBe(true);
    const withoutLogo = await localRequire('./compositor.cjs').compositeArtwork({ background: f.background, brief: f.compositeArtwork.mock.calls[0][0].brief });
    expect(validation.artwork.equals(withoutLogo.buffer)).toBe(true);
  });

  it.each(['original', 'integrated'])('routes %s logo removal according to where the pixels live', async logoRendering => {
    const f = await fixture();
    const result = await f.handlers.runEditRequest({ brief: { ...f.brief, structured: true, typographyMode: 'ai', logoRendering, logoWording: ['Bake My Day'] }, logoImage: f.logoImage, currentBackgroundRef: 'original-ref', editMode: 'remove-logo', editInstruction: 'Remove logo', previousValidation: { passed: true } }, { sub: 'admin' }, 'job');
    expect(f.planDesignEdit).not.toHaveBeenCalled();
    expect(result.logoRemoved).toBe(true);
    expect(result.brief.logoWording).toEqual([]);
    expect(result.concept.logoLayer).toBeNull();
    expect(result.backgroundUnchanged).toBe(logoRendering === 'original');
    if (logoRendering === 'integrated') {
      expect(f.editImage).toHaveBeenCalledOnce();
      expect(f.editImage.mock.calls[0][0].prompt).toContain('Remove the integrated customer logo');
      expect(f.editImage.mock.calls[0][0].prompt).not.toContain('Integrate the supplied customer logo ONCE');
      expect(f.editImage.mock.calls[0][0].logoReferenceImage).toBeNull();
      expect(f.validateArtwork.mock.calls[0][0].reuseVisualValidation).toBeNull();
    } else expect(f.editImage).not.toHaveBeenCalled();
  });

  it('keeps integrated treatment through ordinary edits without introducing an overlay', async () => {
    const f = await fixture();
    const result = await f.handlers.runEditRequest({ brief: { ...f.brief, structured: true, typographyMode: 'ai', logoRendering: 'integrated', logoWording: ['Bake My Day'] }, logoImage: f.logoImage, currentBackgroundRef: 'original-ref', editInstruction: 'Make the background lighter' }, { sub: 'admin' }, 'job');
    expect(f.editImage.mock.calls[0][0].logoRendering).toBe('integrated');
    expect(f.editImage.mock.calls[0][0].prompt).toContain('Integrate the supplied customer logo ONCE');
    expect(result.concept.logoLayer).toBeNull();
    expect(f.validateArtwork.mock.calls[0][0].logoReference).toBeTruthy();
    expect(f.structureCreativeBrief).not.toHaveBeenCalled();
  });

  it.each([{ oldLogoWording: ['Old Bakery'] }, { oldLogoWording: [] }])('refreshes only source wording when replacing/adding an integrated logo: %j', async ({ oldLogoWording }) => {
    const f = await fixture();
    const brief = normalizeBrief({ ...f.brief, structured: true, typographyMode: 'ai', logoRendering: 'integrated', logoWording: oldLogoWording, colorPalette: 'Pink and cream', visualStyle: 'Watercolor', copy: { headline: 'COMING SOON' } });
    f.planDesignEdit.mockResolvedValue({ copy: brief.copy, layers: {}, removeLogo: false, removePhotos: [], backgroundInstruction: '' });
    f.structureCreativeBrief.mockResolvedValue({ brief: { logoWording: ['NEW BAKERY', 'Fresh Daily'], copy: { headline: 'UNWANTED HEADLINE' }, colorPalette: 'Blue and green', visualStyle: 'Unwanted style' } });
    const result = await f.handlers.runEditRequest({ brief, logoImage: f.logoImage, logoSourceChanged: true, currentBackgroundRef: 'original-ref', editInstruction: 'Use this new logo' }, { sub: 'admin' }, 'job');
    expect(f.structureCreativeBrief).toHaveBeenCalledOnce();
    expect(f.structureCreativeBrief.mock.calls[0][0].logoImage.buffer.equals((await prepareLogo({ buffer: f.logoBuffer })).buffer)).toBe(true);
    expect(result.brief).toMatchObject({ logoWording: ['NEW BAKERY', 'Fresh Daily'], colorPalette: 'Pink and cream', visualStyle: 'Watercolor', copy: { headline: 'COMING SOON' } });
    expect(f.editImage.mock.calls[0][0].prompt).toContain('Replace the old integrated logo');
    expect(f.editImage.mock.calls[0][0].prompt).toContain('If the artwork has no logo, add this logo once');
    expect(f.editImage.mock.calls[0][0].prompt).toContain('NEW BAKERY');
    expect(f.editImage.mock.calls[0][0].prompt).toContain(`old logo-specific lettering ${JSON.stringify(oldLogoWording)}`);
    expect(f.validateArtwork.mock.calls[0][0].brief.logoWording).toEqual(['NEW BAKERY', 'Fresh Daily']);
    expect(result.concept.logoLayer).toBeNull();
  });

  it('does not transcribe changed sources during original-logo replacement or logo removal', async () => {
    for (const [logoRendering, editMode] of [['original', 'logo'], ['integrated', 'remove-logo']]) {
      const f = await fixture();
      await f.handlers.runEditRequest({ brief: { ...f.brief, structured: true, typographyMode: 'ai', logoRendering }, logoImage: f.logoImage, logoSourceChanged: true, currentBackgroundRef: 'original-ref', editMode, editInstruction: editMode === 'remove-logo' ? 'Remove logo' : 'Apply logo changes' }, { sub: 'admin' }, 'job');
      expect(f.structureCreativeBrief).not.toHaveBeenCalled();
    }
  });

  it('makes accepted AI wording changes and deletions authoritative for future planning', async () => {
    const f = await fixture();
    const brief = normalizeBrief({ ...f.brief, structured: true, typographyMode: 'ai', copy: { headline: 'COMING SOON', supportingText: 'OPEN THIS FALL', phone: '555-1234' }, copyOverrides: { headline: 'COMING SOON', supportingText: 'OPEN THIS FALL', phone: '555-1234', website: '' } });
    f.planDesignEdit.mockResolvedValue({ copy: { ...brief.copy, headline: 'NOW OPEN', supportingText: '' }, layers: {}, removeLogo: false, removePhotos: [], backgroundInstruction: '' });
    const result = await f.handlers.runEditRequest({ brief, currentBackgroundRef: 'original-ref', editInstruction: 'Change the headline to NOW OPEN and remove supporting text' }, { sub: 'admin' }, 'job');
    expect(result.brief.copyOverrides).toMatchObject({ headline: 'NOW OPEN', supportingText: '', phone: '555-1234', website: '' });
    const fresh = localRequire('./schema.cjs').freshPromptBrief(result.brief);
    expect(fresh.copy).toMatchObject({ headline: 'NOW OPEN', supportingText: '', phone: '555-1234' });
    expect(f.structureCreativeBrief).not.toHaveBeenCalled();
  });

  it('discards stale inferred copy and art direction and blocks an invented supporting claim', async () => {
    const f = await fixture();
    f.structureCreativeBrief.mockResolvedValue({ brief: {
      colorPalette: 'Pink and cream', copy: { headline: 'COMING SOON', supportingText: 'Neighborhood bakery — freshly baked gluten-free pastries' },
    } });
    const result = await f.handlers.runBriefRequest({ brief: {
      ...f.brief, copyOverrides: {}, copy: { headline: 'OLD OPENING', supportingText: 'Old brand claims' },
      subjectMatter: 'Gluten-free bakery pastries', visualStyle: 'Old navy storefront',
    }, logoImage: f.logoImage }, { sub: 'admin' }, 'job');
    const source = f.structureCreativeBrief.mock.calls[0][0].current;
    expect(JSON.stringify(source)).not.toMatch(/Old|gluten-free|navy|OLD OPENING/i);
    expect(result.brief.copy.headline).toBe('COMING SOON');
    expect(result.brief.copy.supportingText).toBe('');
    expect(result.brief.requiredText).toEqual(['COMING SOON']);
  });

  it('preserves explicit style and exact wording overrides through fresh planning', async () => {
    const f = await fixture();
    const result = await f.handlers.runBriefRequest({ brief: {
      ...f.brief, directionOverrides: { visualStyle: 'Watercolor illustration', colorPalette: 'Pink and cream', textPosition: 'right' },
      copyOverrides: { headline: 'OPENING THIS FALL', supportingText: 'Locally owned', offer: '' },
    } }, { sub: 'admin' }, 'job');
    expect(f.structureCreativeBrief.mock.calls[0][0].current).toMatchObject({ visualStyle: 'Watercolor illustration', colorPalette: 'Pink and cream', textPosition: 'right' });
    expect(result.brief).toMatchObject({ visualStyle: 'Watercolor illustration', colorPalette: 'Pink and cream', textPosition: 'right' });
    expect(result.brief.copy).toMatchObject({ headline: 'OPENING THIS FALL', supportingText: 'Locally owned', offer: '' });
  });

  it('does not carry rejected invented copy into an improved prompt', async () => {
    const f = await fixture();
    f.structureCreativeBrief.mockResolvedValue({ brief: { copy: { headline: 'COMING SOON', supportingText: 'Gluten-free pastries' }, improvedPrompt: 'Create a COMING SOON banner with the slogan Gluten-free pastries.' } });
    const result = await f.handlers.runBriefRequest({ brief: { ...f.brief, copyOverrides: {} }, improvePrompt: true }, { sub: 'admin' }, 'job');
    expect(result.improvedPrompt).toContain('COMING SOON');
    expect(result.improvedPrompt).not.toContain('Gluten-free');
  });

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

describe('integrated logo validation', () => {
  it.each([
    { samples: ['NOW OPEN'], expected: true },
    { samples: [' now\nopen. '], expected: true },
    { samples: ['NOW OPEN', 'Bake My Day'], expected: true },
    { samples: ['Best Bakery In Town'], expected: false },
    { samples: ['NOW OPEN', 'Best Bakery In Town'], expected: false },
    { samples: ['OPEN'], expected: false },
    { samples: [], expected: false },
    { samples: undefined, expected: false },
    { samples: ['NOW OPEN'], overlapping: true, expected: false },
  ])('reconciles only exactly authorized unexpected-text samples: %j', async ({ samples, overlapping = false, expected }) => {
    const f = await fixture();
    const create = vi.fn(async () => ({ output_text: JSON.stringify({ requiredTextExact: true, logoMatchesReference: true, duplicateLogo: false, unexpectedText: true, unexpectedTextSamples: samples, illegibleOrOverlappingText: overlapping, detectedText: ['NOW OPEN', 'Bake My Day'], reasons: ['Flagged text'], confidence: 0.98 }) }));
    const validation = loadModule(localRequire.resolve('./validation.cjs'), { './provider.cjs': { getClient: async () => ({ client: { responses: { create } } }), getValidationModel: () => 'mock', withTimeout: task => task(undefined) } });
    const artwork = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#fff2de' } }).png().toBuffer();
    const brief = normalizeBrief({ description: 'Coming soon', widthIn: 6, heightIn: 6, typographyMode: 'ai', logoRendering: 'integrated', logoWording: ['Bake My Day'], copy: { headline: 'NOW OPEN' } });
    const result = await validation.validateArtwork({ artwork, background: artwork, brief, plan: { finalWidth: 600, finalHeight: 600 }, logoReference: await prepareLogo({ buffer: f.logoBuffer }) });
    expect(create).toHaveBeenCalledOnce();
    const request = create.mock.calls[0][0];
    expect(request.input[0].content[0].text).toContain('(A) Approved banner copy: ["NOW OPEN"]');
    expect(request.input[0].content[0].text).toContain('(B) Original source-logo lettering: ["Bake My Day"]');
    expect(request.text.format.schema.properties.unexpectedTextSamples).toEqual({ type: 'array', items: { type: 'string' } });
    expect(result.passed).toBe(expected);
    expect(result.checks.logoIdentity.passed).toBe(true);
    if (overlapping) expect(result.checks.flatArtwork.flags).toContain('illegibleOrOverlappingText');
    else expect(result.checks.flatArtwork.flags.includes('unexpectedText')).toBe(!expected);
  });

  it.each([
    { logoMatchesReference: true, duplicateLogo: false, expected: true },
    { logoMatchesReference: false, duplicateLogo: false, expected: false },
    { logoMatchesReference: true, duplicateLogo: true, expected: false },
  ])('compares original source and rejects mismatch/duplicates: %j', async ({ logoMatchesReference, duplicateLogo, expected }) => {
    const f = await fixture();
    const create = vi.fn(async () => ({ output_text: JSON.stringify({ requiredTextExact: true, logoMatchesReference, duplicateLogo, detectedText: ['COMING SOON', 'Bake My Day', 'Gluten Free Bakery'], reasons: [], confidence: 0.98 }) }));
    const validationPath = localRequire.resolve('./validation.cjs');
    const validation = loadModule(validationPath, { './provider.cjs': { getClient: async () => ({ client: { responses: { create } } }), getValidationModel: () => 'mock', withTimeout: task => task(undefined) } });
    const artwork = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#fff2de' } }).png().toBuffer();
    const logo = await prepareLogo({ buffer: f.logoBuffer });
    const brief = normalizeBrief({ description: 'Coming soon', widthIn: 6, heightIn: 6, typographyMode: 'ai', logoRendering: 'integrated', logoWording: ['Bake My Day', 'Gluten Free Bakery'], copy: { headline: 'COMING SOON' } });
    const result = await validation.validateArtwork({ artwork, background: artwork, brief, plan: { finalWidth: 600, finalHeight: 600 }, logoReference: logo, reuseVisualValidation: { passed: true, vision: { available: true } } });
    expect(create).toHaveBeenCalledOnce();
    const content = create.mock.calls[0][0].input[0].content;
    expect(content.filter(item => item.type === 'input_image')).toHaveLength(2);
    expect(content[2].image_url).toBe(`data:image/png;base64,${logo.buffer.toString('base64')}`);
    expect(content[0].text).toContain('Source logo wording');
    expect(content[0].text).toContain('including its small tagline');
    expect(result.checks.exactText.required).toEqual(['COMING SOON', 'Bake My Day', 'Gluten Free Bakery']);
    expect(result.checks.logoIdentity.passed).toBe(expected);
    expect(result.passed).toBe(expected);
  });
});
