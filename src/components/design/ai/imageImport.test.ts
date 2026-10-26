// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { detectAIImageType, MAX_AI_SOURCE_BYTES, readAIImage } from './imageImport';

const converters = vi.hoisted(() => ({ heic: vi.fn(), pdf: vi.fn() }));
vi.mock('heic-to/csp', () => ({ heicTo: converters.heic }));
vi.mock('@/utils/pdf/renderPdfToDataUrl', () => ({ renderPdfToDataUrl: converters.pdf }));
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const jpg = new Uint8Array([255, 216, 255, 224, 0, 0]);
let width: number; let height: number; let decodeFails: boolean;
let encode: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.fn>;
beforeEach(() => {
  width = 800; height = 400; decodeFails = false;
  vi.stubGlobal('Image', class {
    naturalWidth = width; naturalHeight = height;
    onload?: () => void; onerror?: () => void;
    set src(value: string) { if (value) queueMicrotask(() => decodeFails ? this.onerror?.() : this.onload?.()); }
  });
  revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:input'); static revokeObjectURL = revoke; });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any);
  encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob([png], { type })));
  converters.heic.mockReset().mockResolvedValue(new Blob([jpg], { type: 'image/jpeg' }));
  converters.pdf.mockReset().mockResolvedValue({ previewUrl: 'blob:pdf', cleanup: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['', 'image/jpg', 'application/octet-stream', 'image/png'])('reads JPEG content despite picker MIME %j', async type => {
  const image = await readAIImage(new File([jpg], 'photo.jpg', { type }), 1536 * 1024, 2048);
  expect(image).toMatch(/^data:image\/jpeg;base64,/);
  expect(encode).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledOnce();
});
it('optimizes a valid source over the former 20 MB cutoff', async () => {
  const file = new File([png, new Uint8Array(21 * 1024 * 1024)], 'large.png', { type: 'image/png' });
  expect(await readAIImage(file, 1536 * 1024, 2048)).toMatch(/^data:image\/webp;base64,/);
  expect(encode).toHaveBeenCalledOnce();
});
it('also resizes small compressed files with oversized dimensions', async () => {
  width = 12000; height = 6000;
  await readAIImage(new File([jpg], 'large-dimensions.jpg'), 1536 * 1024, 2048);
  const canvas = encode.mock.instances[0] as HTMLCanvasElement;
  expect(encode).toHaveBeenCalledOnce();
  // Canvas is released after encoding, including on success.
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
});
it('keeps transparency when preparing a logo', async () => {
  width = 3000;
  const result = await readAIImage(new File([png], 'logo.png'), 768 * 1024, 2400, true);
  expect(result).toMatch(/^data:image\/png;base64,/);
  expect(encode.mock.calls[0][1]).toBe('image/png');
});
it('converts HEIC detected from its bytes without trusting the extension', async () => {
  const file = new File([new Uint8Array([0, 0, 0, 24]), 'ftypheic', new Uint8Array(12)], 'phone-photo');
  expect(await detectAIImageType(file)).toBe('image/heic');
  expect(await readAIImage(file, 1536 * 1024, 2048)).toMatch(/^data:image\/jpeg;base64,/);
  expect(converters.heic).toHaveBeenCalledOnce();
});
it('renders only the first PDF page and releases its preview URL', async () => {
  const cleanup = vi.fn(); converters.pdf.mockResolvedValue({ previewUrl: 'blob:pdf', cleanup });
  expect(await readAIImage(new File(['%PDF-1.7\n'], 'logo.pdf'), 768 * 1024, 2400, true)).toMatch(/^data:image\/png;base64,/);
  expect(converters.pdf.mock.calls[0][1]).toMatchObject({ pageNumber: 1, transparentBackground: true });
  expect(cleanup).toHaveBeenCalledOnce();
});
it('does not accept corrupt small images just because they fit the byte budget', async () => {
  decodeFails = true;
  await expect(readAIImage(new File([jpg], 'bad.jpg'), 1536 * 1024, 2048)).rejects.toMatchObject({ category: 'decode_failed' });
  expect(revoke).toHaveBeenCalledOnce();
});
it('distinguishes unsupported, empty, and too-large sources with useful messages', async () => {
  await expect(readAIImage(new File(['not an image'], 'fake.png', { type: 'image/png' }), 1536 * 1024, 2048)).rejects.toMatchObject({ category: 'unsupported_format' });
  await expect(readAIImage(new File([], 'empty.png'), 1536 * 1024, 2048)).rejects.toMatchObject({ category: 'empty_file' });
  const large = new File([png], 'huge.png'); Object.defineProperty(large, 'size', { value: MAX_AI_SOURCE_BYTES + 1 });
  await expect(readAIImage(large, 1536 * 1024, 2048)).rejects.toThrow('under 100 MB');
});
it('reduces dimensions until the actual encoded image fits the request budget', async () => {
  width = 4000;
  encode.mockImplementationOnce(callback => callback(new Blob([new Uint8Array(500_000)])));
  expect(await readAIImage(new File([jpg], 'photo.jpg'), 256 * 1024, 1600)).toMatch(/^data:image\/webp;base64,/);
  expect(encode).toHaveBeenCalledTimes(2);
});
it('cancels before reading and never imports a late HEIC result', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(readAIImage(new File([jpg], 'photo.jpg'), 1536 * 1024, 2048, false, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  const pending = new AbortController();
  converters.heic.mockImplementation(() => { pending.abort(); return new Promise(() => {}); });
  await expect(readAIImage(new File([new Uint8Array([0, 0, 0, 24]), 'ftypheic'], 'photo.heic'), 1536 * 1024, 2048, false, pending.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
