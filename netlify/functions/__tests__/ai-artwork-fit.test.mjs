import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { FIT_MODEL, validateFitRequest, compareWording, runFitRequest } = require('../_shared/ai-designer/fit.cjs');
const { fitHandler } = require('../_shared/ai-designer/handler.cjs');
const { prepareFitRecovery } = require('../_shared/ai-designer/fit.cjs');
const { planCanvas } = require('../_shared/ai-designer/image-utils.cjs');

const inventory = { artworkType: 'design', incidentalText: [], lines: ['Acme Pizza', '$9.99', 'acme.com'], elements: ['Red pizza logo'], allTextLegible: true, contentPreserved: true, confidence: .99, issues: [], blockingIssues: [] };
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
    { allTextLegible: false },
  ])('blocks applying a result that cannot be verified: %j', async changed => {
    const dependencies = await fixtures();
    dependencies.inspect.mockResolvedValue({ ...inventory, ...changed }).mockResolvedValueOnce(inventory);
    const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'job-3', undefined, dependencies);
    expect(result.fit.verification.passed).toBe(false);
    expect(result.fit.verification.canApply).toBe(false);
    expect(result.fit.imageBase64).toBeTruthy(); // Still available for comparison, never auto-applied.
  });
});

it('recovers stylized source lettering with a second reading before one image edit', async () => {
  const dependencies = await fixtures();
  const lettering = ['Hand Gathered', 'PETTING ZOO', '$5 ADMISSION', 'ALL CHILDREN MUST BE', 'ACCOMPANIED BY AN ADULT'];
  const clear = { ...inventory, lines: lettering };
  dependencies.inspect.mockResolvedValueOnce({ ...clear, allTextLegible: false, confidence: .8, issues: ['Script lettering is uncertain'] }).mockResolvedValueOnce(clear).mockResolvedValueOnce(clear);
  const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'stylized-source', undefined, dependencies);
  expect(dependencies.inspect).toHaveBeenCalledTimes(3);
  expect(dependencies.inspect.mock.calls[1][0]).toMatchObject({ secondLook: true });
  expect(dependencies.edit).toHaveBeenCalledOnce();
  expect(dependencies.edit.mock.calls[0][0].prompt).toContain('Hand Gathered');
  expect(result.fit.verification.passed).toBe(true);
  expect(result.fit.diagnostics).toMatchObject({ inspectionModel: 'gpt-6-astra', sourceReads: 2 });
});

it('does not reject two matching, fully legible transcriptions solely for a confidence score', async () => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValueOnce({ ...inventory, confidence: .8 }).mockResolvedValueOnce({ ...inventory, confidence: .8 }).mockResolvedValueOnce(inventory);
  const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'confidence-only', undefined, dependencies);
  expect(result.fit.verification.passed).toBe(true); expect(dependencies.edit).toHaveBeenCalledOnce();
});

it('does not generate when uncertain readings disagree about the source words', async () => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValueOnce({ ...inventory, confidence: .8 }).mockResolvedValueOnce({ ...inventory, confidence: .8, lines: ['Uncertain text'] });
  await expect(runFitRequest(await request(), { sub: 'customer-1' }, 'conflicting-source', undefined, dependencies)).rejects.toThrow('second check');
  expect(dependencies.edit).not.toHaveBeenCalled();
});

it('returns reviewable cosmetic differences without blocking the customer from using the layout', async () => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValueOnce(inventory).mockResolvedValueOnce({ ...inventory, confidence: .8, blockingIssues: [], issues: ['Wider lettering', 'Two additional divider dots', 'Different wood grain and knots'] });
  const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'cosmetic-review', undefined, dependencies);
  expect(result.fit.verification).toMatchObject({ passed: false, canApply: true, blockingIssues: [], missing: [], added: [] });
  expect(result.fit.verification.issues).toHaveLength(3);
});

it.each([
  { lines: ['Acme Pizza', '$19.99', 'acme.com'] },
  { allTextLegible: false },
  { contentPreserved: false, blockingIssues: ['The main logo was replaced'] },
  { contentPreserved: true, blockingIssues: ['A person in the original photograph is missing'] },
])('keeps essential content failures blocked even with customer review: %j', async changed => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValue({ ...inventory, blockingIssues: [], ...changed }).mockResolvedValueOnce(inventory);
  const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'essential-content', undefined, dependencies);
  expect(result.fit.verification.canApply).toBe(false);
});

const photoInventory = { ...inventory, artworkType: 'photograph', lines: [],
  elements: ['One seated person taking a gym mirror photo', 'Blue shirt and shoes', 'Gym equipment and metal wall'],
  incidentalText: ['Tiny unreadable equipment sticker at the right edge'],
  issues: ['The secondary equipment sticker cannot be transcribed'] };

it('fits an ordinary photo with incidental labels without a wording rejection', async () => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValueOnce(photoInventory).mockResolvedValueOnce(photoInventory);
  const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'gym-photo', undefined, dependencies);
  expect(dependencies.edit).toHaveBeenCalledOnce();
  expect(dependencies.inspect).toHaveBeenCalledTimes(2);
  expect(dependencies.edit.mock.calls[0][0].prompt).toContain('extending the existing surroundings naturally');
  expect(dependencies.edit.mock.calls[0][0].prompt).toContain('Tiny unreadable equipment sticker');
  expect(dependencies.inspect.mock.calls[1][0]).toMatchObject({ expected: [], sourceContext: { artworkType: 'photograph', incidentalText: photoInventory.incidentalText } });
  expect(result.fit.verification).toMatchObject({ canApply: true, missing: [], added: [], blockingIssues: [] });
  expect(result.fit.diagnostics).toMatchObject({ artworkType: 'photograph', incidentalTextRegions: 1, sourceReads: 1 });
});

it('recovers when the second reading identifies background markings as incidental photo details', async () => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValueOnce({ ...photoInventory, allTextLegible: false, blockingIssues: ['Unreadable equipment sticker'] })
    .mockResolvedValueOnce(photoInventory).mockResolvedValueOnce(photoInventory);
  const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'gym-photo-second-look', undefined, dependencies);
  expect(result.fit.verification.canApply).toBe(true);
  expect(result.fit.diagnostics.sourceReads).toBe(2);
  expect(dependencies.edit).toHaveBeenCalledOnce();
});

it.each(['photograph', 'mixed'])('still rejects unreadable essential sign/caption wording in a %s', async artworkType => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValue({ ...photoInventory, artworkType, allTextLegible: false, blockingIssues: ['The price on the main sign is unreadable'] });
  await expect(runFitRequest(await request(), { sub: 'customer-1' }, 'unreadable-main-sign', undefined, dependencies)).rejects.toThrow('clearer file');
  expect(dependencies.edit).not.toHaveBeenCalled();
});

it.each([
  { lines: ['FITNESS CLUB'] },
  { contentPreserved: false, blockingIssues: ['The original face is distorted'] },
  { contentPreserved: false, blockingIssues: ['The original person was duplicated'] },
])('blocks invented text or damaged subjects in an adapted photograph: %j', async changed => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValue({ ...photoInventory, ...changed }).mockResolvedValueOnce(photoInventory);
  const result = await runFitRequest(await request(), { sub: 'customer-1' }, 'photo-content-error', undefined, dependencies);
  expect(result.fit.verification.canApply).toBe(false);
});

it('recovers top and bottom content clipped at the reported 120×36 ratio without redrawing it', async () => {
  const dependencies = await fixtures();
  const completeImage = await sharp(Buffer.from('<svg width="1500" height="1000"><rect width="1500" height="1000" fill="white"/><rect width="1500" height="60" fill="red"/><rect y="940" width="1500" height="60" fill="blue"/></svg>')).png().toBuffer();
  const background = await sharp({ create: { width: 2560, height: 864, channels: 3, background: '#00ff00' } }).png().toBuffer();
  dependencies.edit.mockResolvedValueOnce({ buffer: completeImage, model: FIT_MODEL }).mockResolvedValueOnce({ buffer: background, model: FIT_MODEL });
  dependencies.inspect.mockResolvedValueOnce(inventory)
    .mockResolvedValueOnce({ ...inventory, contentPreserved: false, blockingIssues: ['The headline is clipped at the top'] })
    .mockResolvedValueOnce(inventory).mockResolvedValueOnce(inventory);
  const result = await runFitRequest({ ...await request(), heightIn: 36 }, { sub: 'edge-test' }, 'recover-edges', undefined, dependencies);
  expect(result.fit.verification.canApply).toBe(true);
  expect(result.fit.diagnostics.edgeRecovery).toBe(true);
  expect(result.fit.widthPx / result.fit.heightPx).toBe(120 / 36);
  expect(dependencies.edit).toHaveBeenCalledTimes(2);
  const recovery = dependencies.edit.mock.calls[1][0];
  expect(recovery.maskImage).toBeInstanceOf(Buffer);
  expect(recovery.idempotencyKey).not.toBe(dependencies.edit.mock.calls[0][0].idempotencyKey);
  const { data, info } = await sharp(Buffer.from(result.fit.imageBase64, 'base64')).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  const top = pixel(Math.floor(info.width / 2), 40), bottom = pixel(Math.floor(info.width / 2), info.height - 40);
  expect(top[0]).toBeGreaterThan(230); expect(top[1]).toBeLessThan(20);
  expect(bottom[2]).toBeGreaterThan(230); expect(bottom[0]).toBeLessThan(20);
  expect(dependencies.inspect.mock.calls.at(-1)[0].candidate.buffer.toString('base64')).toBe(result.fit.imageBase64);
});

it.each([[120, 36], [36, 120], [120, 6], [6, 120]])('keeps the complete protected image inside the final %s×%s trim', async (width, height) => {
  const dependencies = await fixtures();
  const input = (await dependencies.edit()).buffer;
  const prepared = await prepareFitRecovery(input, planCanvas(width, height));
  const protectedMeta = await sharp(prepared.protectedImage).metadata();
  expect(prepared.placement.left).toBeGreaterThanOrEqual(prepared.crop.left);
  expect(prepared.placement.top).toBeGreaterThanOrEqual(prepared.crop.top);
  expect(prepared.placement.left + protectedMeta.width).toBeLessThanOrEqual(prepared.crop.left + prepared.crop.width);
  expect(prepared.placement.top + protectedMeta.height).toBeLessThanOrEqual(prepared.crop.top + prepared.crop.height);
  const imageMeta = await sharp(prepared.image).metadata(), maskMeta = await sharp(prepared.mask).metadata();
  expect([imageMeta.width, imageMeta.height]).toEqual([maskMeta.width, maskMeta.height]);
  expect(maskMeta.hasAlpha).toBe(true);
});

it('still blocks an edge repair if its new background introduces wording', async () => {
  const dependencies = await fixtures();
  dependencies.inspect.mockResolvedValueOnce(inventory)
    .mockResolvedValueOnce({ ...inventory, blockingIssues: ['Clipped title'] })
    .mockResolvedValueOnce(inventory)
    .mockResolvedValueOnce({ ...inventory, lines: [...inventory.lines, 'SALE'] });
  const result = await runFitRequest(await request(), { sub: 'edge-test' }, 'bad-repair', undefined, dependencies);
  expect(result.fit.verification.canApply).toBe(false);
  expect(result.fit.verification.added).toContain('sale');
  expect(dependencies.edit).toHaveBeenCalledTimes(2);
});


it.each([
  ['yard_sign', 'yard sign', 24, 18],
  ['car_magnet', 'car magnet', 18, 12],
  ['car_magnet', 'car magnet', 24, 12],
  ['car_magnet', 'car magnet', 24, 18],
  ['car_magnet', 'car magnet', 42, 12],
  ['car_magnet', 'car magnet', 72, 24],
])('fits product case %j using verified flat print artwork', async (productType, label, widthIn, heightIn) => {
  const dependencies = await fixtures();
  const result = await runFitRequest({ ...await request(), productType, widthIn, heightIn }, { sub: 'customer-1' }, `product-${productType}-${widthIn}-${heightIn}`, undefined, dependencies);
  expect(dependencies.edit.mock.calls[0][0].prompt).toContain(`The final ${label} is ${widthIn} inches wide by ${heightIn} inches high`);
  expect(result.fit.widthPx / result.fit.heightPx).toBeCloseTo(widthIn / heightIn, 2);
  expect(result.fit.verification.canApply).toBe(true);
});

it('keeps legacy banner requests valid and rejects unsupported product types', async () => {
  expect(validateFitRequest(await request()).productType).toBe('banner');
  expect(() => validateFitRequest({ productType: 'unsupported' })).toThrow('supported print product');
});
