import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const file = require.resolve('../_shared/ai-designer/validation.cjs');
const localRequire = createRequire(file);
const { normalizeBrief } = localRequire('./schema.cjs');
const { buildGenerationPrompt, buildEditPrompt } = localRequire('./prompt.cjs');
async function inspect(overrides = {}, { unavailable = false, wrongDimensions = false } = {}) {
  const create = vi.fn(async () => {
    if (unavailable) throw new Error('Visual checker timed out');
    return { output_text: JSON.stringify({ requiredTextExact: true, detectedText: ['OPEN'], confidence: 0.99, reasons: [], ...overrides }) };
  });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, Buffer,
    require: id => id === './provider.cjs' ? { getClient: async () => ({ client: { responses: { create } } }), getValidationModel: () => 'test', withTimeout: task => task(undefined) } : localRequire(id),
  }, { filename: file });
  const artwork = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#123456' } }).png().toBuffer();
  const brief = normalizeBrief({ description: 'OPEN', widthIn: 6, heightIn: 6, typographyMode: 'ai', copy: { headline: 'OPEN' } });
  const result = await module.exports.validateArtwork({ background: artwork, artwork, brief, plan: { finalWidth: wrongDimensions ? 800 : 600, finalHeight: 600 } });
  return { result, request: create.mock.calls[0][0], brief };
}
describe('print review separates margin advice, unavailable checks and artwork failures', () => {
  it('classifies the recorded near-edge headline as advice, with flat artwork and wording still passing', async () => {
    const { result } = await inspect({ importantContentOutsideSafeMargins: true, reasons: ['Headline near the edge'] });
    expect(result.status).toBe('review'); expect(result.passed).toBe(false);
    expect(result.checks.safeMargins.passed).toBe(false);
    expect(result.checks.flatArtwork.passed).toBe(true); expect(result.checks.exactText.passed).toBe(true);
  });
  it('keeps actual clipping and incorrect wording as actionable failures', async () => {
    const { result } = await inspect({ importantContentOutsideSafeMargins: true, clippedContent: true, requiredTextExact: false, detectedText: ['OPE'] });
    expect(result.status).toBe('failed'); expect(result.checks.flatArtwork.flags).toContain('clippedContent');
    expect(result.checks.exactText.passed).toBe(false);
  });
  it('does not report a timeout as evidence of incorrect wording', async () => {
    const { result } = await inspect({}, { unavailable: true });
    expect(result.status).toBe('unavailable'); expect(result.passed).toBe(false);
    expect(result.checks.safeMargins.passed).toBeNull();
    expect(result.reasons.join(' ')).not.toContain('character-accuracy');
    expect(result.reasons.join(' ')).not.toContain('approval is blocked');
  });
  it('retains objective failures during a visual checker outage', async () => {
    const { result } = await inspect({}, { unavailable: true, wrongDimensions: true });
    expect(result.status).toBe('failed'); expect(result.checks.dimensions.passed).toBe(false);
  });
  it('uses consistent generation and edit breathing room, and distinguishes decoration from clipping in inspection', async () => {
    const { result, brief, request } = await inspect();
    expect(result.passed).toBe(true);
    for (const prompt of [buildGenerationPrompt(brief, { strategy: 'native-exact-ratio' }), buildEditPrompt(brief, { strategy: 'native-exact-ratio' }, 'More space')]) {
      expect(prompt).toContain('central 84%'); expect(prompt).toContain('never crop, stretch or abbreviate');
    }
    expect(request.input[0].content[0].text).toContain('Near-edge placement alone is not clippedContent');
    expect(request.text.format.schema.required).toContain('clippedContent');
  });
});
