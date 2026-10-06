import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { FIT_MODEL, validateFitRequest, compareWording, runFitRequest } = require('../_shared/ai-designer/fit.cjs');
const { fitHandler } = require('../_shared/ai-designer/handler.cjs');

const inventory = { lines: ['Acme Pizza', '$9.99', 'acme.com'], elements: ['Red pizza logo'], allTextLegible: true, contentPreserved: true, confidence: .99, issues: [] };
async function request() {
  const source = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#ff6600' } }).png().toBuffer();
  return { sourceImage: `data:image/png;base64,${source.toString('base64')}`, widthIn: 120, heightIn: 48 };
}
async function fixtures() {
  const output = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: '#ffffff' } }).png().toBuffer();
  return { edit: vi.fn(async () => ({ buffer: output, model: FIT_MODEL, requestId: 'provider-test' })), inspect: vi.fn(async () => inventory) };
}

describe('faithful artwork fitting', () => {
  it('allows rearrangement and line wrapping but preserves repeated words', () => {
    expect(compareWording(['Pizza Pizza', 'Open daily'], ['Open', 'daily Pizza Pizza']).passed).toBe(true);
    expect(compareWording(['Pizza Pizza'], ['Pizza']).passed).toBe(false);
  });
  it.each([
    [['Only $9.99'], ['Only $99.9']],
    [['sale@example.com'], ['sale.example@com']],
    [['acme.com/shop'], ['shop.com/acme']],
    [['SAVE 20%'], ['SAVE 20']],
    [['Call 555-123-4567'], ['Call 555-123-4568']],
  ])('rejects altered customer details: %j', (before, after) => {
    expect(compareWording(before, after).passed).toBe(false);
  });
  it.each([0, -10, Infinity, 1201, NaN])('rejects invalid dimensions %s', value => {
    expect(() => validateFitRequest({ sourceImage: 'data:image/png;base64,AAAA', widthIn: value, heightIn: 24 })).toThrow();
  });
  it('requires an image rather than a URL or PDF payload', () => {
    expect(() => validateFitRequest({ sourceImage: 'https://internal.test/file', widthIn: 72, heightIn: 36 })).toThrow();
  });
  it('requires a customer session before accepting work', async () => {
    const result = await fitHandler({ httpMethod: 'POST', headers: { origin: 'https://site.test', host: 'site.test' }, body: '{}' });
    expect(result.statusCode).toBe(401);
  });
  it('uses the precision model and checks the final exact-ratio image after cropping', async () => {
    const dependencies = await fixtures(), report = vi.fn();
    const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'job-1', report, dependencies);
    expect(dependencies.edit).toHaveBeenCalledWith(expect.objectContaining({ model: FIT_MODEL, quality: 'high', currentImage: expect.any(Buffer) }));
    expect(dependencies.inspect).toHaveBeenCalledTimes(2);
    const finalImage = dependencies.inspect.mock.calls[1][0].candidate;
    const meta = await sharp(finalImage.buffer).metadata();
    expect(meta.width / meta.height).toBe(2.5);
    expect(finalImage.buffer.toString('base64')).toBe(result.fit.imageBase64);
    expect(result.fit.verification.passed).toBe(true);
    expect(report).toHaveBeenCalledTimes(3);
  });
  it('rejects an unreadable source before a billed image edit', async () => {
    const dependencies = await fixtures();
    dependencies.inspect.mockResolvedValue({ ...inventory, allTextLegible: false });
    await expect(runFitRequest(await request(), { sub: 'customer-1' }, 'job-2', undefined, dependencies)).rejects.toThrow('clearer file');
    expect(dependencies.edit).not.toHaveBeenCalled();
  });
  it.each([
    { lines: ['Acme Pizza', '$19.99', 'acme.com'] },
    { contentPreserved: false, issues: ['Logo was replaced'] },
    { confidence: .7 },
    { allTextLegible: false },
  ])('blocks applying a result that cannot be verified: %j', async changed => {
    const dependencies = await fixtures();
    dependencies.inspect.mockResolvedValueOnce(inventory).mockResolvedValueOnce({ ...inventory, ...changed });
    const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'job-3', undefined, dependencies);
    expect(result.fit.verification.passed).toBe(false);
    expect(result.fit.imageBase64).toBeTruthy(); // Still available for comparison, never auto-applied.
  });
});
