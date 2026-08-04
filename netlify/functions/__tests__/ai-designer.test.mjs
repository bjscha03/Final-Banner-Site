import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { createSessionToken } = require('../_shared/server-auth.cjs');
const { statusHandler, briefHandler, generateHandler, editHandler, retiredHandler } = require('../_shared/ai-designer/handler.cjs');
const { planCanvas, prepareOutpaintInput } = require('../_shared/ai-designer/image-utils.cjs');
const { compositeArtwork, wrapText } = require('../_shared/ai-designer/compositor.cjs');
const { normalizeBrief } = require('../_shared/ai-designer/schema.cjs');
const { buildGenerationPrompt, buildEditPrompt } = require('../_shared/ai-designer/prompt.cjs');
const { MODEL_ALIAS, MODEL_SNAPSHOT, getImageModel, isEnabled } = require('../_shared/ai-designer/config.cjs');

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
  it('fails closed when the feature flag is absent', () => {
    expect(isEnabled()).toBe(false);
  });

  it('enables only an explicitly flagged Netlify deploy preview', () => {
    process.env.VITE_AI_BANNER_ENABLED = 'true';
    expect(isEnabled()).toBe(false);
    process.env.CONTEXT = 'deploy-preview';
    expect(isEnabled()).toBe(true);
    process.env.CONTEXT = 'production';
    expect(isEnabled()).toBe(false);
  });

  it('rejects unauthenticated generation and editing before provider work', async () => {
    const event = { httpMethod: 'POST', headers: { origin: 'https://preview.example.test', host: 'preview.example.test' }, body: '{}' };
    expect((await generateHandler(event)).statusCode).toBe(401);
    expect((await editHandler(event)).statusCode).toBe(401);
    expect((await briefHandler(event)).statusCode).toBe(401);
  });

  it('rejects cross-origin requests even with an admin token', async () => {
    const event = adminEvent();
    event.headers.origin = 'https://attacker.example.test';
    expect((await generateHandler(event)).statusCode).toBe(403);
    expect((await editHandler(event)).statusCode).toBe(403);
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

describe('GPT Image 2 provider contract', () => {
  it('centralizes and restricts the production model to GPT Image 2', () => {
    expect(MODEL_ALIAS).toBe('gpt-image-2');
    expect(MODEL_SNAPSHOT).toBe('gpt-image-2-2026-04-21');
    expect(getImageModel()).toBe(MODEL_SNAPSHOT);
    process.env.OPENAI_IMAGE_MODEL = 'gpt-image-1';
    expect(() => getImageModel()).toThrow(/approved GPT Image 2/i);
  });

  it('uses the official generation and edit methods and supplies the current image first', () => {
    const provider = fs.readFileSync(path.resolve(__dirname, '../_shared/ai-designer/provider.cjs'), 'utf8');
    expect(provider).toContain('client.images.generate');
    expect(provider).toContain('client.images.edit');
    expect(provider).toContain("toFile(currentImage, 'current-artwork.jpg'");
    expect(provider).toMatch(/const images = \[sourceFile\]/);
    expect(provider).toContain('image: images');
    expect(provider).toContain("input_fidelity: 'high'");
    expect(provider).toContain("toFile(maskImage, 'outpaint-mask.png'");
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
    expect(plan.finalWidth % 16).toBe(0);
    expect(plan.finalHeight % 16).toBe(0);
    expect(plan.providerWidth % 16).toBe(0);
    expect(plan.providerHeight % 16).toBe(0);
    expect(plan.finalWidth / plan.finalHeight).toBeCloseTo(widthIn / heightIn, 10);
    expect(plan.providerWidth / plan.providerHeight).toBeLessThanOrEqual(3);
    expect(plan.providerWidth / plan.providerHeight).toBeGreaterThanOrEqual(1 / 3);
    expect(plan.finalWidth).toBeLessThanOrEqual(3840);
    expect(plan.finalHeight).toBeLessThanOrEqual(2160);
  });
});

describe('deterministic exact-copy composition', () => {
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
  });

  it('rejects over-limit exact copy rather than silently truncating it', () => {
    expect(() => productionBrief({ copy: { headline: 'X'.repeat(101) } })).toThrow(/headline must be 100 characters or fewer/i);
  });
});

describe('admin-only UI integration and permanent artwork handoff', () => {
  it('uses server-verified readiness for button visibility and routes approved output through normal upload', () => {
    const design = fs.readFileSync(path.resolve(__dirname, '../../../src/pages/Design.tsx'), 'utf8');
    const alternate = fs.readFileSync(path.resolve(__dirname, '../../../src/pages/GoogleAdsBanner.tsx'), 'utf8');
    const adminPage = fs.readFileSync(path.resolve(__dirname, '../../../src/pages/admin/AIDesignerPage.tsx'), 'utf8');
    const handoff = fs.readFileSync(path.resolve(__dirname, '../../../src/lib/aiDesignHandoff.ts'), 'utf8');
    for (const source of [design, alternate]) {
      expect(source).toContain('const showCreateWithAI = aiAccess.ready');
      expect(source).toContain('await handleFileUpload(file)');
      expect(source).toContain('session={aiDesignSession}');
      expect(source).not.toMatch(/localStorage\.setItem\([^\n]*(imageBase64|backgroundBase64)/);
    }
    expect(adminPage).toContain('<Navigate to="/admin/setup" replace />');
    expect(adminPage).toContain('!access.authorized');
    expect(adminPage).toContain('createAIHandoff(result');
    expect(handoff).not.toMatch(/localStorage|sessionStorage/);
  });
});
