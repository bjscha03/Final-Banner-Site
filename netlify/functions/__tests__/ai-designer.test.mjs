import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { withDesignerRuntime } from '../_shared/ai-designer/netlify-modern.mjs';
import { shouldShowAIAdminEntry } from '../../../src/lib/aiAdminVisibility.ts';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { createSessionToken } = require('../_shared/server-auth.cjs');
const { statusHandler, briefHandler, generateHandler, editHandler, exportHandler, workerHandler, retiredHandler } = require('../_shared/ai-designer/handler.cjs');
const { normalizeLayers, mergeLayerEdits, removePhotoLayers } = require('../_shared/ai-designer/layers.cjs');
const { temporaryArtworkUrl } = require('../_shared/ai-designer/storage.cjs');
const { planCanvas, prepareOutpaintInput, PROVIDER_MAX_EDGE, PROVIDER_MAX_PIXELS } = require('../_shared/ai-designer/image-utils.cjs');
const { compositeArtwork, wrapText } = require('../_shared/ai-designer/compositor.cjs');
const { logoPlacement, prepareLogo, logoPrompt } = require('../_shared/ai-designer/logo.cjs');
const { normalizeBrief, validateImprovedPrompt, fitInterpretedDirection, buildImprovedPrompt, groundedCopy } = require('../_shared/ai-designer/schema.cjs');
const { buildGenerationPrompt, buildEditPrompt, buildCopyChangeInstruction } = require('../_shared/ai-designer/prompt.cjs');
const { MODEL_ALIAS, MODEL_SNAPSHOT, getImageModel, isEnabled } = require('../_shared/ai-designer/config.cjs');
const { classifyProviderError, isTransientConnectionError } = require('../_shared/ai-designer/provider.cjs');
const { safeErrorPayload } = require('../_shared/ai-designer/security.cjs');
const { matchesDetectedWording, validateArtwork } = require('../_shared/ai-designer/validation.cjs');

const originalEnvironment = { ...process.env };

function adminEvent(method = 'POST', body = {}) {
  const token = createSessionToken({ id: 'test-admin', email: 'admin@example.test', is_admin: true });
  return {
    httpMethod: method,
    headers: {
      authorization: `Bearer ${token}`,
      origin: 'https://preview.example.test',
      host: 'preview.example.test',
      'x-idempotency-key': 'test-request-123456',
    },
    body: JSON.stringify(body),
  };
}

function productionBrief(overrides = {}) {
  return normalizeBrief({
    description: 'A polished restaurant grand-opening design with appetizing food photography and strong contrast.',
    purpose: 'Grand opening',
    targetAudience: 'Local families',
    primaryMessage: 'Grand opening',
    visualStyle: 'Clean and professional',
    brandPersonality: 'Friendly and trustworthy',
    colorPalette: 'Navy, white, and orange',
    subjectMatter: 'A fresh hamburger and fries',
    composition: 'Food on the right with a clean text zone on the left',
    focalPoint: 'Hamburger',
    usage: 'outdoor',
    viewingDistance: '20–50 feet',
    widthIn: 48,
    heightIn: 24,
    material: '13oz vinyl',
    quantity: 1,
    productType: 'banner',
    textPosition: 'left',
    logoPosition: 'upper-right',
    copy: {
      businessName: 'Molly & Moe’s Café',
      headline: 'GRAND OPENING',
      supportingText: 'Fresh food. Friendly service.',
      offer: '20% OFF THIS WEEK',
      callToAction: 'VISIT US TODAY',
      phone: '(502) 555-0123',
      website: 'mollyandmoes.example',
      address: '123 Main Street',
      date: 'AUGUST 15, 2026',
      other: 'BURGERS • FRIES • SHAKES',
    },
    ...overrides,
  });
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'ai-designer-test-session-secret';
  delete process.env.AI_DESIGNER_ENABLED;
  delete process.env.CONTEXT;
  delete process.env.VITE_AI_BANNER_ENABLED;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_IMAGE_MODEL;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

describe('AI designer authorization and fail-closed controls', () => {
  it('uses the modern Netlify runtime for every new endpoint', () => {
    const functionNames = ['status', 'brief', 'generate', 'edit', 'job', 'worker-background', 'cleanup'];
    for (const name of functionNames) {
      const source = fs.readFileSync(
        path.resolve(`netlify/functions/ai-designer-${name}.mjs`),
        'utf8',
      );
      expect(source).toContain('export default');
      expect(source).not.toMatch(/export\s+(?:const|function)\s+handler\b/);
    }
  });

  it('fails closed when the feature flag is absent', () => {
    expect(isEnabled()).toBe(false);
  });

  it('enables approved Netlify preview and production contexts with an explicit kill switch', () => {
    expect(isEnabled()).toBe(false);
    expect(isEnabled('deploy-preview')).toBe(true);
    expect(isEnabled('production')).toBe(true);
    expect(isEnabled('branch-deploy')).toBe(false);
    process.env.AI_DESIGNER_ENABLED = 'false';
    expect(isEnabled('deploy-preview')).toBe(false);
    expect(isEnabled('production')).toBe(false);
    process.env.AI_DESIGNER_ENABLED = 'true';
    expect(isEnabled('branch-deploy')).toBe(true);
  });

  it('threads Netlify deploy metadata through the status handler', async () => {
    const event = adminEvent('GET');
    event.netlify = { deployContext: 'deploy-preview', deployId: 'preview-test' };
    const response = await statusHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      enabled: true,
      ready: false,
      blocker: 'AI_NOT_CONFIGURED',
    });
  });

  it('takes deploy context from the modern Netlify runtime, not request data', async () => {
    let receivedEvent;
    const wrapped = withDesignerRuntime(async (event) => {
      receivedEvent = event;
      return { statusCode: 200, body: 'ok' };
    });
    const response = await wrapped(
      new Request('https://preview.example.test/api/test'),
      { requestId: 'request-test', deploy: { context: 'deploy-preview', id: 'deploy-test' } },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(receivedEvent.netlify).toEqual({
      deployContext: 'deploy-preview',
      deployId: 'deploy-test',
    });
  });

  it('preserves admin authentication when the protected deploy owns Authorization', async () => {
    const token = createSessionToken({ id: 'test-admin', email: 'admin@example.test', is_admin: true });
    const wrapped = withDesignerRuntime(statusHandler);
    const response = await wrapped(
      new Request('https://preview.example.test/.netlify/functions/ai-designer-status', {
        headers: {
          Authorization: 'Basic netlify-preview-protection',
          'X-Banners-Admin-Session': token,
          Cookie: `banners_admin_session=${encodeURIComponent(token)}`,
        },
      }),
      { requestId: 'request-auth-transport', deploy: { context: 'deploy-preview', id: 'deploy-test' } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ authorized: true, enabled: true });
  });

  it('accepts the same-site session cookie when authorization headers are unavailable', async () => {
    const token = createSessionToken({ id: 'test-admin', email: 'admin@example.test', is_admin: true });
    const response = await statusHandler({
      ...adminEvent('GET'),
      headers: {
        authorization: 'Basic netlify-preview-protection',
        cookie: `banners_admin_session=${encodeURIComponent(token)}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ authorized: true });
  });

  it('accepts the JSON session fallback when the preview proxy rewrites the forwarded host', async () => {
    const token = createSessionToken({ id: 'test-admin', email: 'admin@example.test', is_admin: true });
    const wrapped = withDesignerRuntime(statusHandler);
    const response = await wrapped(
      new Request('https://preview.example.test/.netlify/functions/ai-designer-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://preview.example.test',
          'X-Forwarded-Host': 'deploy-preview-drawer.example.test',
          'X-Forwarded-Proto': 'https',
        },
        body: JSON.stringify({ adminSessionToken: token }),
      }),
      { requestId: 'request-body-auth', deploy: { context: 'deploy-preview', id: 'deploy-test' } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ authorized: true, enabled: true });
  });

  it('rejects unauthenticated generation and editing before provider work', async () => {
    const event = { httpMethod: 'POST', headers: { origin: 'https://preview.example.test', host: 'preview.example.test' }, body: '{}' };
    expect((await generateHandler(event)).statusCode).toBe(401);
    expect((await editHandler(event)).statusCode).toBe(401);
    expect((await briefHandler(event)).statusCode).toBe(401);
    expect((await workerHandler(event)).statusCode).toBe(401);
  });

  it('rejects cross-origin requests even with an admin token', async () => {
    const event = adminEvent();
    event.headers.origin = 'https://attacker.example.test';
    expect((await generateHandler(event)).statusCode).toBe(403);
    expect((await editHandler(event)).statusCode).toBe(403);
  });

  it('accepts this site deploy-preview origin when the Netlify drawer rewrites the forwarded host', async () => {
    process.env.SITE_NAME = 'bannersonthefly';
    const event = adminEvent();
    event.headers.origin = 'https://deploy-preview-424--bannersonthefly.netlify.app';
    event.headers['x-forwarded-host'] = 'deploy-preview-drawer.netlify.app';
    const response = await generateHandler(event);
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'AI_NOT_CONFIGURED' });
  });

  it('returns a safe configuration error instead of falling back', async () => {
    const response = await generateHandler(adminEvent());
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'AI_NOT_CONFIGURED' });
  });

  it('does not report ready without private temporary storage', async () => {
    process.env.AI_DESIGNER_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'configured-but-not-used-in-this-test';
    const response = await statusHandler(adminEvent('GET'));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ready: false,
      temporaryStorageConfigured: false,
      blocker: 'TEMP_STORAGE_NOT_CONFIGURED',
    });
  });

  it('quarantines retired experimental endpoints behind admin authorization', async () => {
    const unauthorized = retiredHandler({ httpMethod: 'GET', headers: {} });
    expect(unauthorized.statusCode).toBe(401);
    const authorized = retiredHandler(adminEvent('GET'));
    expect(authorized.statusCode).toBe(410);
  });
});

describe('GPT Image provider contract', () => {
  it('defaults to the pinned fast, high-quality GPT Image 2.5 Flare snapshot', () => {
    expect(MODEL_ALIAS).toBe('gpt-image-2.5-flare');
    expect(MODEL_SNAPSHOT).toBe('gpt-image-2.5-flare-2026-09-08');
    expect(getImageModel()).toBe(MODEL_SNAPSHOT);
    process.env.OPENAI_IMAGE_MODEL = 'gpt-image-1';
    expect(() => getImageModel()).toThrow(/approved GPT Image/i);
  });

  it('uses the official generation and edit methods and supplies the current image first', () => {
    const provider = fs.readFileSync(path.resolve(__dirname, '../_shared/ai-designer/provider.cjs'), 'utf8');
    expect(provider).toContain('client.images.generate');
    expect(provider).toContain('client.images.edit');
    expect(provider).toContain("toFile(currentImage, 'current-artwork.jpg'");
    expect(provider).toMatch(/const images = \[sourceFile\]/);
    expect(provider).toContain('image: images');
    expect(provider).not.toContain("input_fidelity: 'high'");
    expect(provider).toMatch(/Preserve the complete source image as the first input/i);
    expect(provider).toContain("toFile(maskImage, 'outpaint-mask.png'");
    expect(provider.match(/moderation: 'low'/g)).toHaveLength(2);
  });

  it('classifies SDK aborts as timeouts instead of a generic failure', () => {
    try {
      classifyProviderError({ name: 'APIUserAbortError' });
      throw new Error('Expected provider classification to throw.');
    } catch (error) {
      expect(error.code).toBe('PROVIDER_TIMEOUT');
    }
  });

  it('classifies exhausted SDK and Undici connection failures as temporarily unavailable', () => {
    for (const providerError of [
      { name: 'APIConnectionError', cause: { code: 'ECONNRESET' } },
      { name: 'Error', cause: { code: 'EAI_AGAIN' } },
      { name: 'Error', cause: { code: 'UND_ERR_SOCKET' } },
    ]) {
      expect(isTransientConnectionError(providerError)).toBe(true);
      try {
        classifyProviderError(providerError);
        throw new Error('Expected provider classification to throw.');
      } catch (error) {
        expect(error.code).toBe('PROVIDER_UNAVAILABLE');
        expect(error.originalName).toBeTruthy();
      }
    }
  });

  it('distinguishes missing credits from ordinary rate limiting', () => {
    for (const providerError of [
      { status: 429, code: 'insufficient_quota', message: 'You exceeded your current quota.' },
      { status: 429, error: { type: 'insufficient_quota', message: 'No available API credits.' } },
      { status: 400, code: 'billing_not_active', message: 'Billing is required.' },
    ]) {
      try {
        classifyProviderError(providerError);
        throw new Error('Expected provider classification to throw.');
      } catch (error) {
        expect(error.code).toBe('PROVIDER_BILLING_REQUIRED');
      }
    }
    try {
      classifyProviderError({ status: 429, code: 'rate_limit_exceeded' });
      throw new Error('Expected provider classification to throw.');
    } catch (error) {
      expect(error.code).toBe('PROVIDER_RATE_LIMITED');
    }
  });

  it('uses one bounded provider retry with the queued job idempotency key', () => {
    const provider = fs.readFileSync(path.resolve(__dirname, '../_shared/ai-designer/provider.cjs'), 'utf8');
    const handler = fs.readFileSync(path.resolve(__dirname, '../_shared/ai-designer/handler.cjs'), 'utf8');
    expect(provider).toMatch(/attempt < 2/);
    expect(provider).toContain("headers: { 'Idempotency-Key': idempotencyKey }");
    expect(provider).toContain('isTransientConnectionError(error)');
    expect(handler).toContain("providerRequestKey(jobId, 'generate')");
    expect(handler).toContain("providerRequestKey(jobId, 'edit')");
    expect(handler).not.toContain("providerRequestKey(providerKey, 'repair')");
    expect(provider).toContain('maxRetries: 0');
  });

  it('retries one transient connection with the same provider request options', async () => {
    const { requestWithTransientRetry } = require('../_shared/ai-designer/provider.cjs');
    const received = [];
    const result = await requestWithTransientRetry(async (options) => {
      received.push(options);
      if (received.length === 1) {
        const failure = new Error('fetch failed');
        failure.name = 'APIConnectionError';
        throw failure;
      }
      return 'recovered';
    }, { idempotencyKey: 'stable-provider-key', timeoutMs: 15000 });
    expect(result).toBe('recovered');
    expect(received).toHaveLength(2);
    expect(received[0].headers['Idempotency-Key']).toBe('stable-provider-key');
    expect(received[1].headers['Idempotency-Key']).toBe('stable-provider-key');
  });

  it('does not restart a slow failed image request', async () => {
    const { requestWithTransientRetry } = require('../_shared/ai-designer/provider.cjs');
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(1000);
    let calls = 0;
    try {
      await expect(requestWithTransientRetry(async () => {
        calls += 1;
        clock.mockReturnValue(21000);
        const error = new Error('connection dropped after processing');
        error.name = 'APIConnectionError';
        throw error;
      }, { timeoutMs: 165000 })).rejects.toThrow('connection dropped');
      expect(calls).toBe(1);
    } finally { clock.mockRestore(); }
  });

  it('aborts the provider at its deadline without another image call', async () => {
    const { requestWithTransientRetry } = require('../_shared/ai-designer/provider.cjs');
    let calls = 0;
    await expect(requestWithTransientRetry(({ signal, maxRetries }) => {
      calls += 1;
      expect(maxRetries).toBe(0);
      return new Promise((_, reject) => signal.addEventListener('abort', () => {
        const error = new Error('deadline reached');
        error.name = 'AbortError';
        reject(error);
      }, { once: true }));
    }, { timeoutMs: 20 })).rejects.toThrow('deadline reached');
    expect(calls).toBe(1);
  });

  it('returns a safe stage, category, and request reference for production diagnosis', () => {
    const error = new Error('OpenAI image request timed out.');
    error.code = 'PROVIDER_TIMEOUT';
    error.pipelineStage = 'generating the artwork';
    error.providerRequestId = 'req_safe_123456';
    expect(safeErrorPayload(error)).toMatchObject({
      statusCode: 504,
      error: 'PROVIDER_TIMEOUT',
      stage: 'generating the artwork',
      providerRequestId: 'req_safe_123456',
    });
  });

  it('contains no legacy provider, stock fallback, or model downgrade in the active path', () => {
    const activeRoot = path.resolve(__dirname, '../_shared/ai-designer');
    const source = fs.readdirSync(activeRoot)
      .filter((name) => name.endsWith('.cjs'))
      .map((name) => fs.readFileSync(path.join(activeRoot, name), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/gpt-image-1|dall-e|imagen|gemini/i);
    expect(source).not.toMatch(/stock fallback|placeholder image/i);
  });
});

describe('flat-artwork structured prompts', () => {
  it('tells image edits exactly which words to replace without restoring the original request', () => {
    const instruction = buildCopyChangeInstruction({ headline: 'CUSTOM BANNERS', offer: 'FAST DELIVERY' }, { headline: 'CUSTOM SIGNS', offer: 'FAST DELIVERY' });
    expect(instruction).toContain('"replace":"CUSTOM BANNERS","with":"CUSTOM SIGNS"');
    expect(instruction).not.toContain('FAST DELIVERY');
    const brief = productionBrief({ typographyMode: 'ai' });
    expect(buildEditPrompt(brief, planCanvas(48, 24), instruction)).not.toContain(brief.description);
  });
  it('accepts artistic capitalization and line breaks but rejects changed words and numbers', () => {
    expect(matchesDetectedWording(['Happy Birthday Bryson!'], ['HAPPY', 'BIRTHDAY', 'BRYSON!'])).toBe(true);
    expect(matchesDetectedWording(['CUSTOM BANNERS.'], ['CUSTOM BANNERS'])).toBe(true);
    expect(matchesDetectedWording(['Happy Birthday Bryson!'], ['HAPPY BIRTHDAY BRYON!'])).toBe(false);
    expect(matchesDetectedWording(['September 19'], ['SEPTEMBER 20'])).toBe(false);
    expect(matchesDetectedWording(['SALE'], ['WHOLESALE'])).toBe(false);
    expect(matchesDetectedWording(['$8.99'], ['$899'])).toBe(false);
    expect(matchesDetectedWording(['example.com'], ['examplecom'])).toBe(false);
  });
  it('recovers a verbose rewrite using AI direction without losing names or dates', () => {
    const brief = productionBrief({ copy: { headline: 'Happy Birthday Bryson!', date: 'September 19' }, subjectMatter: 'Playful rescue pups' });
    const result = buildImprovedPrompt('too long '.repeat(300), brief);
    expect(result.length).toBeLessThanOrEqual(1200);
    expect(result).toContain('Happy Birthday Bryson!');
    expect(result).toContain('September 19');
    expect(result).toContain('Playful rescue pups');
    expect(buildImprovedPrompt('Happy Birthday Bryson! September 20', brief)).not.toContain('September 20');
  });
  it('grounds a requested name from possessive wording and never writes "No text" as literal copy', () => {
    const source = normalizeBrief({ description: "Celebrate Makenzie's volleyball season with a large Makenzie headline", widthIn: 96, heightIn: 48 });
    expect(groundedCopy({ headline: 'Makenzie' }, source).headline).toBe('Makenzie');
    const noCopy = normalizeBrief({ description: 'A scenic background with no wording', widthIn: 96, heightIn: 48, subjectMatter: 'School volleyball' });
    const improved = buildImprovedPrompt('', noCopy);
    expect(improved).toContain('no written words');
    expect(improved).not.toContain('wording: No text');
  });
  it('fits verbose AI planning without truncating customer wording', () => {
    const copy = { headline: 'Happy Birthday Bryson!' };
    const result = fitInterpretedDirection({ composition: 'Detailed direction '.repeat(40), copy, description: 'Exact request', improvedPrompt: 'Exact rewrite' });
    expect(result.composition.length).toBeLessThanOrEqual(100);
    expect(result.copy).toEqual(copy);
    expect(result.description).toBe('Exact request');
    expect(result.improvedPrompt).toBe('Exact rewrite');
    expect(() => normalizeBrief({ ...productionBrief(), ...result })).not.toThrow();
  });
  it('rejects prompt rewrites that lose or change exact customer wording', () => {
    const wording = ['Happy Birthday Bryson!', 'September 19'];
    expect(validateImprovedPrompt('Create playful lettering: Happy Birthday Bryson! Date: September 19.', wording)).toContain('Bryson!');
    expect(() => validateImprovedPrompt('Happy Birthday Bryson! September 20', wording)).toThrow(/original prompt is unchanged/);
    expect(() => validateImprovedPrompt('', wording)).toThrow();
    expect(() => validateImprovedPrompt('x'.repeat(1201), [])).toThrow();
  });
  it('art-directs complete AI lettering without contradictory no-text instructions', () => {
    const brief = productionBrief({ typographyMode: 'ai', copy: { headline: 'Happy Birthday Bryson!' } });
    const plan = planCanvas(brief.widthIn, brief.heightIn);
    for (const prompt of [buildGenerationPrompt(brief, plan), buildEditPrompt(brief, plan, 'Make the lettering playful and dimensional')]) {
      expect(prompt).toContain('Happy Birthday Bryson!');
      expect(prompt).toMatch(/COMPLETE finished banner/);
      expect(prompt).not.toMatch(/Do not render words|Do not add any words|deterministic typography/);
      expect(prompt).toMatch(/5% safe margins/);
    }
    expect(normalizeBrief(brief).typographyMode).toBe('ai');
    expect(productionBrief().typographyMode).toBe('layers');
  });
  it('applies the required production exclusions to generation and edits', () => {
    const brief = productionBrief();
    const plan = planCanvas(brief.widthIn, brief.heightIn);
    for (const prompt of [buildGenerationPrompt(brief, plan), buildEditPrompt(brief, plan, 'Make the background lighter.')]) {
      expect(prompt).toMatch(/flat, edge-to-edge commercial print artwork/i);
      expect(prompt).toMatch(/no mockup|do not create a physical banner/i);
      expect(prompt).toMatch(/grommets/i);
      expect(prompt).toMatch(/mounting hardware/i);
      expect(prompt).toMatch(/blank bars|letterboxing/i);
      expect(prompt).toMatch(/do not render (words|text)|do not add any words/i);
      expect(prompt).not.toContain(brief.description);
    }
  });

  it('adds AI-guided safe-corridor correction for an extreme ratio', () => {
    const brief = productionBrief({ widthIn: 120, heightIn: 20 });
    const plan = planCanvas(brief.widthIn, brief.heightIn);
    expect(plan.strategy).toBe('gpt-image-2-outpainting');
    expect(buildGenerationPrompt(brief, plan)).toMatch(/outpainting pass/i);
    expect(buildEditPrompt(brief, plan, 'Preserve the composition.')).toMatch(/masked outpainting/i);
  });

  it('builds a transparent masked outpainting canvas without stretching the source', async () => {
    const plan = planCanvas(120, 20);
    const source = await sharp({ create: { width: 1200, height: 400, channels: 3, background: '#183a63' } }).jpeg().toBuffer();
    const outpaint = await prepareOutpaintInput(source, plan);
    const [imageMeta, maskMeta] = await Promise.all([sharp(outpaint.image).metadata(), sharp(outpaint.mask).metadata()]);
    expect(imageMeta).toMatchObject({ width: plan.providerWidth, height: plan.providerHeight, hasAlpha: true });
    expect(maskMeta).toMatchObject({ width: plan.providerWidth, height: plan.providerHeight, hasAlpha: true });
    expect(outpaint.placement.width / outpaint.placement.height).toBeCloseTo(3, 2);
    expect(outpaint.placement.left).toBeGreaterThan(0);
  });
});

describe('private temporary artwork storage', () => {
  it('stores edit sources as authenticated assets and exposes only signed references', () => {
    const storage = fs.readFileSync(path.resolve(__dirname, '../_shared/ai-designer/storage.cjs'), 'utf8');
    const handler = fs.readFileSync(path.resolve(__dirname, '../_shared/ai-designer/handler.cjs'), 'utf8');
    expect(storage).toContain("type: 'authenticated'");
    expect(storage).toContain('subjectHash(session)');
    expect(storage).toContain('timingSafeEqual');
    expect(storage).toContain('TEMP_TTL_SECONDS');
    expect(handler).toContain('backgroundRef');
    expect(handler).not.toContain('backgroundBase64');
  });

  it('queues slow provider work in a background function and polls a session-bound job', () => {
    const worker = fs.readFileSync(path.resolve('netlify/functions/ai-designer-worker-background.mjs'), 'utf8');
    const workspace = fs.readFileSync(path.resolve('src/components/design/ai/AIWorkspace.tsx'), 'utf8');
    const storage = fs.readFileSync(path.resolve(__dirname, '../_shared/ai-designer/storage.cjs'), 'utf8');
    expect(worker).toContain('background: true');
    expect(workspace).toContain('runBackgroundJob');
    expect(workspace).toContain('ai-designer-job');
    expect(storage).toContain("kind: 'ai-designer-job'");
    expect(storage).toContain('payload.sub !== subjectHash(session)');
  });
});

describe('exact dimensions and template fill', () => {
  const sizes = [
    ['2 × 4 feet', 48, 24],
    ['3 × 6 feet', 72, 36],
    ['4 × 8 feet', 96, 48],
    ['8 × 4 feet portrait', 48, 96],
    ['square-like custom', 47.5, 48],
    ['tall custom', 24, 120],
    ['very wide custom', 120, 20],
    ['large custom', 240, 96],
  ];

  it.each(sizes)('%s produces an exact, undistorted final ratio', (_label, widthIn, heightIn) => {
    const plan = planCanvas(widthIn, heightIn);
    expect(plan.providerWidth % 16).toBe(0);
    expect(plan.providerHeight % 16).toBe(0);
    expect(plan.finalWidth / plan.finalHeight).toBeCloseTo(widthIn / heightIn, 10);
    expect(plan.providerWidth / plan.providerHeight).toBeLessThanOrEqual(3);
    expect(plan.providerWidth / plan.providerHeight).toBeGreaterThanOrEqual(1 / 3);
    expect(plan.providerWidth).toBeLessThanOrEqual(PROVIDER_MAX_EDGE);
    expect(plan.providerHeight).toBeLessThanOrEqual(PROVIDER_MAX_EDGE);
    expect(plan.providerWidth * plan.providerHeight).toBeLessThanOrEqual(PROVIDER_MAX_PIXELS);
    expect(plan.finalWidth).toBeLessThanOrEqual(8000);
    expect(plan.finalHeight).toBeLessThanOrEqual(8000);
    expect(plan.finalWidth * plan.finalHeight).toBeLessThanOrEqual(24_010_000);
    const minimumPpi = Math.max(widthIn, heightIn) <= 48 ? 60 : Math.max(widthIn, heightIn) <= 96 ? 40 : 30;
    expect(Math.min(plan.finalWidth / widthIn, plan.finalHeight / heightIn)).toBeGreaterThanOrEqual(minimumPpi);
  });

  it('keeps common banner requests out of GPT Image 2 experimental resolutions', () => {
    expect(planCanvas(96, 48)).toMatchObject({
      providerWidth: 2560,
      providerHeight: 1280,
      providerSize: '2560x1280',
      finalWidth: 3840,
      finalHeight: 1920,
    });
    const extreme = planCanvas(120, 20);
    expect(extreme.providerWidth / extreme.providerHeight).toBeLessThanOrEqual(3);
    expect(extreme.providerWidth * extreme.providerHeight).toBeLessThanOrEqual(PROVIDER_MAX_PIXELS);
  });
});

describe('deterministic exact-copy composition', () => {
  it('does not paint fallback block text over integrated AI artwork', async () => {
    const brief = productionBrief({ typographyMode: 'ai', copy: { headline: 'Happy Birthday Bryson!' } });
    brief.outputWidthPx = 960; brief.outputHeightPx = 480;
    const background = await sharp({ create: { width: 960, height: 480, channels: 3, background: '#123456' } }).png().toBuffer();
    const logo = { buffer: await sharp({ create: { width: 80, height: 40, channels: 3, background: '#ff0000' } }).png().toBuffer(), mimeType: 'image/png' };
    const result = await compositeArtwork({ background, brief, logo });
    expect(result.textLayers).toEqual([]);
    expect(result.logoLayer).toMatchObject({ width: 230, height: 115 });
    const noLogo = await compositeArtwork({ background, brief });
    const stats = await sharp(noLogo.buffer).stats();
    expect(stats.channels.every(channel => channel.stdev < 1)).toBe(true);
    expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
  });

  it('enlarges small logos proportionally into an intentional banner footprint', async () => {
    const brief = productionBrief({ typographyMode: 'ai', copy: { headline: 'OPENING SOON' } });
    brief.outputWidthPx = 960; brief.outputHeightPx = 480;
    const background = await sharp({ create: { width: 960, height: 480, channels: 3, background: '#123456' } }).png().toBuffer();
    const logo = { buffer: await sharp({ create: { width: 80, height: 40, channels: 4, background: '#ff7800' } }).png().toBuffer(), mimeType: 'image/png' };
    const result = await compositeArtwork({ background, brief, logo });
    expect(result.logoLayer).toMatchObject({ width: 230, height: 115, position: 'upper-right', sourceWidth: 80, sourceHeight: 40 });
    expect(result.logoLayer.width / result.logoLayer.height).toBeCloseTo(2, 2);
  });

  it('removes transparent logo padding but never removes a visible white background', async () => {
    const mark = await sharp({ create: { width: 40, height: 20, channels: 4, background: '#ff7800' } }).extend({ top: 30, bottom: 30, left: 40, right: 40, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const trimmed = await prepareLogo({ buffer: mark, mimeType: 'image/png' });
    expect(trimmed).toMatchObject({ width: 40, height: 20, prepared: true, needsContrastPlate: false });
    const white = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#ffffff' } }).png().toBuffer();
    const preserved = await prepareLogo({ buffer: white, mimeType: 'image/png' });
    expect(preserved).toMatchObject({ width: 120, height: 80, needsContrastPlate: false });
  });

  it('adds a fitted contrast plate behind transparent wordmarks', async () => {
    const mark = await sharp({ create: { width: 160, height: 80, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from('<svg width="160" height="80"><text x="8" y="55" font-size="52" fill="white">LOGO</text></svg>') }]).png().toBuffer();
    const prepared = await prepareLogo({ buffer: mark, mimeType: 'image/png' });
    expect(prepared.needsContrastPlate).toBe(true);
    expect(prepared.contrastPlate).toBe('#0b1f3a');
    const brief = productionBrief({ typographyMode: 'ai' }); brief.outputWidthPx = 960; brief.outputHeightPx = 480;
    const background = await sharp({ create: { width: 960, height: 480, channels: 3, background: '#f97316' } }).png().toBuffer();
    const result = await compositeArtwork({ background, brief, logo: prepared });
    expect(result.logoLayer.plate).toMatchObject({ color: '#0b1f3a' });
    expect(result.logoLayer.plate.width).toBeGreaterThan(result.logoLayer.width);
  });

  it('keeps wide and tall logos inside safe edges and reserves the same footprint in the AI prompt', () => {
    for (const ratio of [0.1, 1, 8]) {
      for (const logoPosition of ['upper-left', 'upper-right', 'lower-left', 'lower-right']) {
        const placement = logoPlacement(productionBrief({ logoPosition, layers: { logo: { scale: 2 } } }), 1200, 400, ratio);
        expect(placement.left).toBeGreaterThanOrEqual(60);
        expect(placement.top).toBeGreaterThanOrEqual(24);
        expect(placement.left + placement.width).toBeLessThanOrEqual(1140);
        expect(placement.top + placement.height).toBeLessThanOrEqual(376);
      }
    }
    const prompt = logoPrompt({ ...productionBrief(), aspectRatio: 2, logoAspectRatio: 2 });
    expect(prompt).toMatch(/exact footprint/i);
    expect(prompt).toMatch(/Do not draw a placeholder, empty white badge, cloud/i);
  });

  it('reuses completed visual checks for a logo-only composite', async () => {
    const brief = productionBrief({ typographyMode: 'ai', copy: { headline: 'OPENING SOON' } });
    const plan = planCanvas(brief.widthIn, brief.heightIn);
    brief.outputWidthPx = plan.finalWidth; brief.outputHeightPx = plan.finalHeight;
    const artwork = await sharp({ create: { width: plan.finalWidth, height: plan.finalHeight, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    const previousValidation = {
      passed: true, reasons: [],
      checks: { flatArtwork: { flags: [], confidence: 0.98 }, exactText: { passed: true, detected: brief.requiredText } },
      vision: { available: true, model: 'gpt-5-mini', requestId: 'prior-check' },
    };
    const result = await validateArtwork({ background: artwork, artwork, brief, plan, reuseVisualValidation: previousValidation });
    expect(result.passed).toBe(true);
    expect(result.vision).toMatchObject({ available: true, requestId: 'prior-check' });
  });
  const scenarios = [
    ['grand-opening', "Tony’s Pizza", 'GRAND OPENING', 'Free slice with any drink', 'Saturday September 19', '#981c22'],
    ['birthday', '', 'HAPPY 50TH BIRTHDAY', 'Celebrating Maria', 'September 19', '#55337d'],
    ['graduation', 'CLASS OF 2026', 'CONGRATULATIONS!', 'We are proud of you, Jordan', '', '#133f65'],
    ['real-estate', 'NORTHLINE REALTY', 'OPEN HOUSE', 'Find your next home', 'Sunday 1–4 PM', '#23493d'],
    ['construction', 'NORTHLINE CONSTRUCTION', 'BUILT TO LAST', 'Residential & Commercial', '(502) 555-0101', '#18334c'],
    ['church', 'COMMUNITY CHURCH', 'YOU BELONG HERE', 'Join us this Sunday', '10:00 AM', '#184d60'],
    ['school', 'LINCOLN ELEMENTARY', 'FALL FESTIVAL', 'Games • Food • Family Fun', 'October 3 • 4–7 PM', '#224d77'],
    ['sale', 'WEEKEND SPECIAL', '25% OFF', 'All outdoor furniture', 'Friday through Sunday', '#202a3a'],
    ['restaurant', 'TONY’S PIZZA', 'LUNCH SPECIAL', '2 slices + a drink — $8.99', 'Monday–Friday • 11 AM–2 PM', '#9b2720'],
    ['sports', 'NORTHLINE HIGH SCHOOL', 'GO EAGLES!', 'One team. One goal.', 'SEASON 2026', '#164d42'],
  ];
  it.each(scenarios)('renders the complete %s scenario with safe, editable wording', async (name, businessName, headline, offer, date, color) => {
    const portrait = name === 'birthday';
    const width = portrait ? 480 : 960; const height = portrait ? 960 : 480;
    const brief = productionBrief({ textPosition: portrait ? 'center' : 'left', copy: { businessName, headline, offer, date } });
    brief.outputWidthPx = width; brief.outputHeightPx = height;
    const background = await sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
    const result = await compositeArtwork({ background, brief });
    expect(result.textLayers.map(layer => layer.value).sort()).toEqual(Object.values(brief.copy).filter(Boolean).sort());
    for (let index = 1; index < result.textLayers.length; index += 1) {
      const previous = result.textLayers[index - 1];
      const current = result.textLayers[index];
      const previousBottom = previous.y + previous.fontSize * (0.2 + (previous.lines.length - 1) * 1.08);
      expect(current.y - current.fontSize).toBeGreaterThanOrEqual(previousBottom - 0.01);
    }
    expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
    if (process.env.AI_QA_RENDER_DIR) {
      fs.mkdirSync(process.env.AI_QA_RENDER_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.AI_QA_RENDER_DIR, `${name}.jpg`), result.buffer);
    }
  });
  it('clamps layer positions and rejects injected font/color properties', () => {
    expect(normalizeLayers({ headline: { x: -5, y: 100, scale: 8, color: 'red\"/><script>', font: 'url(secret)', width: null }, arbitrary: { x: 0.5 } }))
      .toEqual({ headline: { x: 0.05, y: 0.95, scale: 3 } });
  });

  it('preserves unrelated layer settings during conversational changes', () => {
    expect(mergeLayerEdits({ headline: { x: 0.2, color: '#112233', scale: 1.2 }, logo: { y: 0.6 } }, { headline: { scale: 1.5, x: null, color: null } }))
      .toEqual({ headline: { x: 0.2, color: '#112233', scale: 1.5 }, logo: { y: 0.6 } });
  });

  it('keeps the remaining photo positions when deleting a photo', () => {
    expect(removePhotoLayers({ photo0: { x: 0.1 }, photo1: { x: 0.5 }, photo2: { x: 0.7 }, headline: { scale: 2 } }, 3, [1]))
      .toEqual({ photo0: { x: 0.1 }, photo1: { x: 0.7 }, headline: { scale: 2 } });
  });

  it('handles decimal custom sizes within one output pixel', () => {
    const plan = planCanvas(73.23, 35.71);
    expect(Math.abs(plan.finalWidth / plan.finalHeight / (73.23 / 35.71) - 1)).toBeLessThan(1 / plan.finalHeight);
    expect(plan.providerWidth % 16).toBe(0);
    expect(plan.providerHeight % 16).toBe(0);
  });

  it('keeps print quality and layer coordinates independently of the small preview', async () => {
    const brief = productionBrief({ copy: { headline: 'TONY’S <PIZZA> & MORE' }, layers: { headline: { x: 0.9, y: 0.9, scale: 1.3, font: 'Georgia', color: '#ffffff' }, logo: { x: 0.8, y: 0.05 }, photo0: { x: 0.6, y: 0.5 } } });
    brief.outputWidthPx = 1920; brief.outputHeightPx = 960;
    const background = await sharp({ create: { width: 1920, height: 960, channels: 3, background: '#143453' } }).jpeg().toBuffer();
    const asset = { buffer: await sharp({ create: { width: 200, height: 100, channels: 4, background: '#e86414' } }).png().toBuffer(), mimeType: 'image/png' };
    const result = await compositeArtwork({ background, brief, logo: asset, photos: [asset, asset] });
    expect((await sharp(result.buffer).metadata()).width).toBe(1920);
    expect((await sharp(result.preview).metadata()).width).toBe(1600);
    expect(result.textLayers[0]).toMatchObject({ value: 'TONY’S <PIZZA> & MORE', font: 'Georgia' });
    expect(result.textLayers[0].x + result.textLayers[0].width).toBeLessThanOrEqual(1920 * 0.95);
    const withoutPhotos = await compositeArtwork({ background, brief, logo: asset });
    expect(result.photoLayers).toEqual([]);
    expect(result.buffer.equals(withoutPhotos.buffer)).toBe(true);
    for (const layer of [result.logoLayer]) {
      expect(layer.left).toBeGreaterThanOrEqual(1920 * 0.05);
      expect(layer.top).toBeGreaterThanOrEqual(960 * 0.05);
      expect(layer.left + layer.width).toBeLessThanOrEqual(1920 * 0.95);
      expect(layer.top + layer.height).toBeLessThanOrEqual(960 * 0.95);
    }
  });

  it('denies anonymous and non-admin production exports', async () => {
    const anonymous = await exportHandler({ httpMethod: 'POST', headers: {}, body: '{}' });
    expect(anonymous.statusCode).toBe(401);
    const event = adminEvent();
    event.headers.authorization = `Bearer ${createSessionToken({ id: 'customer', email: 'customer@example.test', is_admin: false })}`;
    expect((await exportHandler(event)).statusCode).toBe(401);
  });

  it('rejects forged production artwork references before making a download request', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test'; process.env.CLOUDINARY_API_KEY = 'test'; process.env.CLOUDINARY_API_SECRET = 'test';
    expect(() => temporaryArtworkUrl('forged.signature', { sub: 'test-admin' })).toThrow(/invalid or expired/);
  });
  it('never drops characters while wrapping', () => {
    const value = 'CALL 1-800-555-0199 OR VISIT EXAMPLE.COM TODAY';
    const lines = wrapText(value, 12);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe(value);
  });

  it('renders every structured copy field and logo on the exact canvas', async () => {
    const brief = productionBrief();
    brief.outputWidthPx = 960;
    brief.outputHeightPx = 480;
    brief.textColor = '#ffffff';
    brief.accentColor = '#f97316';
    const background = await sharp({ create: { width: 960, height: 480, channels: 3, background: '#183a63' } }).jpeg().toBuffer();
    const logoBuffer = await sharp({ create: { width: 160, height: 80, channels: 4, background: '#ff7a00' } }).png().toBuffer();
    const result = await compositeArtwork({ background, brief, logo: { buffer: logoBuffer, mimeType: 'image/png' } });
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(960);
    expect(metadata.height).toBe(480);
    expect(result.logoLayer).toMatchObject({ position: 'upper-right' });
    const renderedValues = result.textLayers.map((layer) => layer.value);
    for (const value of Object.values(brief.copy).filter(Boolean)) expect(renderedValues).toContain(value);
    for (const layer of result.textLayers) {
      const bottom = layer.y + layer.fontSize * Math.max(1, layer.lines.length) * 1.08;
      expect(bottom).toBeLessThanOrEqual(480 * 0.96);
    }
  });

  it('rejects over-limit exact copy rather than silently truncating it', () => {
    expect(() => productionBrief({ copy: { headline: 'X'.repeat(101) } })).toThrow(/headline must be 100 characters or fewer/i);
  });
});

describe('admin-only UI integration and permanent artwork handoff', () => {
  it('shows entry points for a signed admin without hiding them behind provider readiness', () => {
    expect(shouldShowAIAdminEntry({
      featureEnabled: true,
      isAdminUser: true,
      hasSignedSession: true,
      authenticationFailed: false,
    })).toBe(true);
    for (const blocked of [
      { featureEnabled: false, isAdminUser: true, hasSignedSession: true, authenticationFailed: false },
      { featureEnabled: true, isAdminUser: false, hasSignedSession: true, authenticationFailed: false },
      { featureEnabled: true, isAdminUser: true, hasSignedSession: false, authenticationFailed: false },
      { featureEnabled: true, isAdminUser: true, hasSignedSession: true, authenticationFailed: true },
    ]) expect(shouldShowAIAdminEntry(blocked)).toBe(false);

    const design = fs.readFileSync(path.resolve(__dirname, '../../../src/pages/Design.tsx'), 'utf8');
    const alternate = fs.readFileSync(path.resolve(__dirname, '../../../src/pages/GoogleAdsBanner.tsx'), 'utf8');
    const adminPage = fs.readFileSync(path.resolve(__dirname, '../../../src/pages/admin/AIDesignerPage.tsx'), 'utf8');
    const workspace = fs.readFileSync(path.resolve(__dirname, '../../../src/components/design/ai/AIWorkspace.tsx'), 'utf8');
    const accessHook = fs.readFileSync(path.resolve(__dirname, '../../../src/hooks/useAIAdminAccess.ts'), 'utf8');
    const clientAuth = fs.readFileSync(path.resolve(__dirname, '../../../src/lib/serverAuth.ts'), 'utf8');
    const handoff = fs.readFileSync(path.resolve(__dirname, '../../../src/lib/aiDesignHandoff.ts'), 'utf8');
    for (const source of [design, alternate]) {
      expect(source).toContain('const showCreateWithAI = canUseAIAdminPreview(user)');
      expect(source).not.toContain('const showCreateWithAI = aiAccess.ready');
      expect(source).toContain('await handleFileUpload(file)');
      expect(source).toContain('session={aiDesignSession}');
      expect(source).not.toMatch(/localStorage\.setItem\([^\n]*(imageBase64|backgroundBase64)/);
    }
    expect(adminPage).toContain('canUseAIAdminPreview(user)');
    expect(adminPage).not.toContain('user && !access.authorized');
    expect(adminPage).toContain('createAIHandoff(result');
    expect(design).toContain("document.getElementById('ai-artwork-preview')");
    expect(design).toContain("preview.scrollIntoView({ behavior: 'smooth', block: 'start' })");
    expect(design).toContain('pendingAIArtworkScrollRef.current = true');
    expect(workspace).toContain('Reconnect admin');
    expect(workspace).toContain('This can take close to a minute.');
    expect(workspace).toContain('your design will appear here automatically.');
    expect(workspace).toContain('body: authenticatedJsonBody(');
    expect(accessHook).toContain('const authenticationFailed = response.status === 401');
    expect(clientAuth).toContain("const SESSION_HEADER = 'X-Banners-Admin-Session'");
    expect(clientAuth).toContain('writeSessionCookie(sessionToken)');
    expect(clientAuth).toContain('authenticatedJsonBody');
    expect(handoff).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe('sitewide orange button contrast', () => {
  it('uses white text on an accessible orange for shared button styles', () => {
    const button = fs.readFileSync(path.resolve(__dirname, '../../../src/components/ui/button.tsx'), 'utf8');
    const styles = fs.readFileSync(path.resolve(__dirname, '../../../src/index.css'), 'utf8');
    const orange = '#C94E00';
    const channels = orange.match(/[a-f\d]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    const luminance = (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);

    expect(button).toContain(`bg-[${orange}] text-white`);
    expect(button).not.toContain(`bg-[${orange}] text-[#0B1F3A]`);
    expect(styles).toMatch(/\.brand-button-primary,[\s\S]*?bg-\[#C94E00\][\s\S]*?text-white/);
    expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('fresh AI prompt rewriting', () => {
  it('does not carry inferred wording or art direction from the previous design', () => {
    const { freshPromptBrief } = require('../_shared/ai-designer/schema.cjs');
    const brief = freshPromptBrief({
      widthIn: 72, heightIn: 36, material: '13oz', productType: 'banner',
      description: 'A clean grand opening banner for a coffee shop.',
      copy: { headline: 'Happy Birthday Bryson!' },
      subjectMatter: 'Paw Patrol rescue pups', focalPoint: 'Bryson',
      visualStyle: 'Birthday cartoon lettering', composition: 'Rescue tower',
    });
    expect(brief.description).toBe('A clean grand opening banner for a coffee shop.');
    expect(JSON.stringify(brief)).not.toMatch(/Bryson|Paw Patrol|Rescue tower|Birthday cartoon/);
    expect(brief.requiredText).toEqual([]);
    expect(brief.widthIn).toBe(72);
    expect(brief.heightIn).toBe(36);
  });

  it('keeps only explicitly entered exact wording while rewriting', () => {
    const { freshPromptBrief } = require('../_shared/ai-designer/schema.cjs');
    const brief = freshPromptBrief({
      widthIn: 96, heightIn: 48, material: '13oz', productType: 'banner',
      description: 'Create a coffee shop opening banner.',
      copy: { headline: 'OLD HEADLINE', phone: 'Invented old phone' },
      copyOverrides: { headline: 'NORTHLINE COFFEE', supportingText: '' },
    });
    expect(brief.copy.headline).toBe('NORTHLINE COFFEE');
    expect(brief.copy.phone).toBe('');
    expect(brief.copyOverrides.supportingText).toBe('');
    expect(brief.requiredText).toEqual(['NORTHLINE COFFEE']);
  });
});
