import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { validateFitRequest, runFitRequest } = require('../_shared/ai-designer/fit.cjs');
const { normalizeBrief } = require('../_shared/ai-designer/schema.cjs');
const { catalog, templates } = require('../_shared/specialty-products.cjs');
const product = catalog.find(p => p.slug === 'step-and-repeat-backdrop');
const targets = product.variants.map(variant => ({ productType: `specialty:${product.slug}:${variant.id}:front`, ...templates[variant.panels[0].templateId] }));
const inventory = { artworkType: 'design', incidentalText: [], lines: ['ACME', 'ACME'], elements: ['Acme logo'], allTextLegible: true, contentPreserved: true, confidence: .99, issues: [], blockingIssues: [] };

describe('backdrop artwork fitting', () => {
  it.each(targets)('fits the registered $widthIn × $heightIn artboard with pocket margins', async target => {
    const input = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#061a31' } }).png().toBuffer();
    const output = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const edit = vi.fn(async () => ({ buffer: output, model: 'test', requestId: 'test-backdrop' }));
    const inspect = vi.fn(async () => inventory);
    const result = await runFitRequest({ ...target, sourceImage: `data:image/png;base64,${input.toString('base64')}` }, { sub: 'backdrop-test' }, target.id, undefined, { edit, inspect });
    expect(result.fit).toMatchObject({ productType: target.productType, widthIn: target.widthIn, heightIn: target.heightIn });
    const meta = await sharp(Buffer.from(result.fit.imageBase64, 'base64')).metadata();
    expect(meta.width / meta.height).toBeCloseTo(target.widthIn / target.heightIn, 3);
    expect(result.fit.verification.passed).toBe(true);
    expect(edit).toHaveBeenCalledOnce();
    expect(edit.mock.calls[0][0].prompt).toContain('Margins in inches, top/right/bottom/left: 4/1/4/1');
    expect(edit.mock.calls[0][0].prompt).toContain('Never render template labels');
    expect(edit.mock.calls[0][0].referenceImage.buffer).toBeInstanceOf(Buffer);
    expect(inspect).toHaveBeenCalledTimes(2);
  });
  it.each(targets)('rejects mismatched dimensions for $id and keeps creation gated', target => {
    const request = { ...target, sourceImage: 'data:image/png;base64,eA==' };
    for (const dimensions of [{ widthIn: 108 }, { heightIn: 120 }, { widthIn: NaN }, { heightIn: 0 }]) {
      expect(() => validateFitRequest({ ...request, ...dimensions })).toThrow();
    }
    expect(() => normalizeBrief({ ...target, description: 'ACME' })).toThrow(/not available/);
    expect(() => validateFitRequest({ ...request, productType: `${target.productType}:extra` })).toThrow(/not available/);
  });
});
