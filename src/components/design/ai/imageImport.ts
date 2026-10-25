// These are working copies for AI requests. The original print-artwork upload
// uses its own pipeline and limits.
export const AI_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif,image/gif,image/bmp,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.avif,.gif,.bmp,.svg,.pdf';
export const MAX_AI_SOURCE_BYTES = 100 * 1024 * 1024;

export class AIImageImportError extends Error {
  constructor(public category: string, message: string) { super(message); }
}

const aborted = () => new DOMException('Image import cancelled', 'AbortError');
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw aborted(); }

function readBlob(blob: Blob, mode: 'buffer', signal?: AbortSignal): Promise<ArrayBuffer>;
function readBlob(blob: Blob, mode: 'data', signal?: AbortSignal): Promise<string>;
function readBlob(blob: Blob, mode: 'buffer' | 'data', signal?: AbortSignal) {
  checkAbort(signal);
  return new Promise<string | ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(aborted()); };
    const clean = () => signal?.removeEventListener('abort', abort);
    reader.onload = () => { clean(); resolve(reader.result as string | ArrayBuffer); };
    reader.onerror = () => { clean(); reject(new AIImageImportError('read_failed', 'This file could not be read. Select it again or choose another image.')); };
    reader.onabort = () => { clean(); reject(aborted()); };
    signal?.addEventListener('abort', abort, { once: true });
    if (mode === 'data') reader.readAsDataURL(blob); else reader.readAsArrayBuffer(blob);
  });
}

// Inspect the content: mobile browsers and exported artwork can omit or mislabel
// File.type. Never reject a valid JPG just because the picker reports no MIME.
export async function detectAIImageType(file: Blob, signal?: AbortSignal): Promise<string> {
  const bytes = new Uint8Array(await readBlob(file.slice(0, 1024), 'buffer', signal));
  const ascii = Array.from(bytes, value => String.fromCharCode(value)).join('');
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a/.test(ascii)) return 'image/gif';
  if (ascii.startsWith('BM')) return 'image/bmp';
  if (ascii.includes('%PDF-')) return 'application/pdf';
  if (ascii.slice(4, 8) === 'ftyp') {
    const brands = ascii.slice(8, Math.min(bytes.length, 64));
    if (/avif|avis/.test(brands)) return 'image/avif';
    if (/heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1/.test(brands)) return 'image/heic';
  }
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(ascii)) return 'image/svg+xml';
  throw new AIImageImportError('unsupported_format', 'Choose an image (JPG, PNG, WebP, HEIC, AVIF, GIF, BMP or SVG) or a PDF. Your current design is still saved.');
}

function bounded<T>(task: Promise<T>, signal?: AbortSignal, timeoutMs = 45_000): Promise<T> {
  checkAbort(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => { clean(); reject(aborted()); };
    const timer = window.setTimeout(() => { clean(); reject(new AIImageImportError('timeout', 'This image is taking too long to prepare. Try again, choose a smaller image, or continue without it.')); }, timeoutMs);
    const clean = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    task.then(value => { clean(); resolve(value); }, error => { clean(); reject(error); });
  });
}

export async function readAIImage(file: File, maxBytes: number, maxDimension: number, preserveTransparency = false, signal?: AbortSignal): Promise<string> {
  checkAbort(signal);
  if (!file.size) throw new AIImageImportError('empty_file', 'This file is empty. Choose another image.');
  if (file.size > MAX_AI_SOURCE_BYTES) throw new AIImageImportError('source_too_large', 'Choose a source image under 100 MB. Your current design is still saved.');
  const type = await detectAIImageType(file, signal);
  let source: Blob = file.slice(0, file.size, type);
  let url = '';
  let cleanup: (() => void) | undefined;
  const element = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (type === 'image/heic') {
      const { heicTo } = await bounded(import('heic-to/csp'), signal);
      source = await bounded(heicTo({ blob: source, type: preserveTransparency ? 'image/png' : 'image/jpeg', quality: 0.92 }), signal);
    }
    checkAbort(signal);
    if (type === 'application/pdf') {
      const { renderPdfToDataUrl } = await bounded(import('@/utils/pdf/renderPdfToDataUrl'), signal);
      const preview = await renderPdfToDataUrl(new File([source], 'artwork.pdf', { type }), {
        pageNumber: 1, targetWidth: maxDimension, targetHeight: maxDimension,
        maxPixels: maxDimension * maxDimension, transparentBackground: preserveTransparency, signal,
      });
      url = preview.previewUrl;
      cleanup = preview.cleanup;
    } else {
      url = URL.createObjectURL(source);
      cleanup = () => URL.revokeObjectURL(url);
    }
    await bounded(new Promise<void>((resolve, reject) => {
      element.onload = () => resolve();
      element.onerror = () => reject(new AIImageImportError('decode_failed', 'This image could not be opened. Try another copy or export it as a JPG or PNG. Your current design is still saved.'));
      element.src = url;
    }), signal);
    checkAbort(signal);
    if (!element.naturalWidth || !element.naturalHeight) throw new AIImageImportError('decode_failed', 'This image has no readable dimensions. Choose another image.');
    if (['image/png', 'image/jpeg', 'image/webp'].includes(source.type) && type !== 'application/pdf' && source.size <= maxBytes && Math.max(element.naturalWidth, element.naturalHeight) <= maxDimension) {
      return await readBlob(source, 'data', signal);
    }
    canvas = document.createElement('canvas');
    let edgeLimit = maxDimension;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      checkAbort(signal);
      const scale = Math.min(1, edgeLimit / Math.max(element.naturalWidth, element.naturalHeight));
      canvas.width = Math.max(1, Math.round(element.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(element.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new AIImageImportError('canvas_unavailable', 'This browser could not prepare the image. Try another browser or continue without the image.');
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      const optimized = await bounded(new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, preserveTransparency ? 'image/png' : 'image/webp', Math.max(0.62, 0.9 - attempt * 0.06))), signal);
      if (optimized && optimized.size <= maxBytes) return await readBlob(optimized, 'data', signal);
      edgeLimit = Math.max(320, Math.round(edgeLimit * 0.75));
    }
    throw new AIImageImportError('optimization_failed', 'This image could not be prepared on this device. Choose a smaller image or continue without it. Your current design is still saved.');
  } catch (error) {
    if (signal?.aborted) throw aborted();
    if (error instanceof AIImageImportError || (error as Error)?.name === 'AbortError') throw error;
    throw new AIImageImportError('conversion_failed', type === 'application/pdf'
      ? 'This PDF could not be opened. Use an unlocked PDF, JPG or PNG, or continue without it. Your current design is still saved.'
      : 'This image could not be converted. Try another copy or export it as a JPG or PNG. Your current design is still saved.');
  } finally {
    element.onload = null; element.onerror = null; element.src = '';
    cleanup?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
