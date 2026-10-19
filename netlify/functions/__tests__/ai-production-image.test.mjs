import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import production from '../_shared/ai-production-image.cjs';
const item = (extra = {}) => ({ id: 'test-item', width_in: 12, height_in: 6,
  file_name: 'ai-fit-12x6-test.jpg', file_url: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/uploads/ai-fit-12x6-test.jpg',
  canvas_state_json: JSON.stringify({ version: 2, source: 'google-ads-banner', originalImageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/uploads/ai-fit-12x6-test.jpg', originalWidth: 240, originalHeight: 120, originalFormat: 'jpg', mimeType: 'image/jpeg', imgScale: 1, imgPos: { x: 0, y: 0 } }), ...extra });
describe('AI production JPG', () => {
  it('embeds 200 DPI at full physical size while reporting original detail honestly', async () => {
    const native = await sharp({ create: { width: 240, height: 120, channels: 3, background: '#18448d' } }).jpeg().toBuffer();
    const result = await production.renderAiProductionImage(item(), { fetchSource: async () => native });
    const meta = await sharp(result.buffer).metadata();
    expect(meta).toMatchObject({ width: 2400, height: 1200, density: 200, format: 'jpeg' });
    expect(meta.width / meta.density).toBe(12);
    expect(meta.height / meta.density).toBe(6);
    expect(result.metadata).toMatchObject({ sourcePpi: 20, dpi: 200, scale: '1:1', resampled: true });
    expect(result.metadata.filename).toContain('12x6in-200dpi.jpg');
  });
  it('plans the reported 96x36 order at 19200x7200, not a 72 DPI half-size file', () => {
    expect(production.productionImagePlan(item({ width_in: 96, height_in: 36 }))).toMatchObject({ width: 19200, height: 7200 });
  });
  it('accepts the large 120x48 preset at full-size 200 DPI', () => {
    expect(production.productionImagePlan(item({ width_in: 120, height_in: 48 }))).toMatchObject({ width: 24000, height: 9600 });
  });
  it('invalidates cached files when placement or output dimensions change', () => {
    const a = item();
    const b = { ...a, canvas_state_json: JSON.stringify({ ...JSON.parse(a.canvas_state_json), imgPos: { x: 5, y: 0 } }) };
    expect(production.productionImagePlan(a).hash).not.toBe(production.productionImagePlan(b).hash);
    expect(production.productionImagePlan(a).hash).not.toBe(production.productionImagePlan({ ...a, width_in: 24 }).hash);
  });
  it('preserves saved white margins and position instead of stretching to fill', async () => {
    const native = await sharp({ create: { width: 240, height: 120, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const source = item();
    source.canvas_state_json = JSON.stringify({ ...JSON.parse(source.canvas_state_json), imgScale: .5 });
    const { buffer } = await production.renderAiProductionImage(source, { fetchSource: async () => native });
    const pixel = async (left, top) => [...await sharp(buffer).extract({ left, top, width: 1, height: 1 }).raw().toBuffer()];
    expect(await pixel(0, 0)).toEqual([255,255,255]);
    const center = await pixel(1200, 600);
    expect(center[0]).toBeGreaterThan(250); expect(center[1]).toBeLessThan(5);
  });
  it('refuses mismatched sources and excessive memory before fetching artwork', () => {
    expect(() => production.productionImagePlan(item({ file_url: 'https://different.test/image.jpg' }))).toThrow('do not match');
    expect(() => production.productionImagePlan(item({ width_in: 1200, height_in: 120 }))).toThrow('limit');
    expect(() => production.productionImagePlan(item({ file_name: 'customer.jpg' }))).toThrow('no saved AI');
  });
});
