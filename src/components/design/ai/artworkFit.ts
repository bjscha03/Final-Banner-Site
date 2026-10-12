import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';
import { resolveArtworkPreviewImageSrc } from '../artworkPreviewSource';
import { base64ToFile } from '@/utils/base64ToFile';
import { uploadArtworkFile } from '@/utils/uploadArtworkFile';
import { preloadPreviewImage } from '@/lib/previewImageCache';

export type ArtworkFitProduct = 'banner' | 'yard_sign' | 'car_magnet';

export type ArtworkFitResult = {
  id: string; sourceHash: string; imageBase64: string; mimeType: string;
  widthIn: number; heightIn: number; widthPx: number; heightPx: number;
  verification: { passed: boolean; canApply?: boolean; blockingIssues?: string[]; originalText: string[]; detectedText: string[]; missing: string[]; added: string[]; issues: string[]; confidence: number };
  diagnostics: { model: string; durationMs: number };
};

/** Cosmetic differences need customer review; content failures cannot be applied. */
export function canApplyArtworkFit(result: ArtworkFitResult | null | undefined): result is ArtworkFitResult {
  const checks = result?.verification;
  return Boolean(checks && (checks.canApply ?? checks.passed) === true
    && checks.missing.length === 0 && checks.added.length === 0 && !checks.blockingIssues?.length);
}

export function artworkFitIdentity(artwork: UploadedArtworkFile | null, widthIn: number, heightIn: number, productType: ArtworkFitProduct = 'banner') {
  const identity = [artwork?.editorIdentity || artwork?.productionPublicId || artwork?.fileKey || artwork?.url || '', widthIn, heightIn].join('|');
  return productType === 'banner' ? identity : `${identity}|${productType}`;
}

/** Read the uncomposed artwork at useful resolution, not its small UI thumbnail. */
export function artworkFitSourceUrl(artwork: UploadedArtworkFile): string {
  const isPdf = artwork.isPdf || artwork.mimeType === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(artwork.url);
  const original = artwork.artworkManifest?.originalUrl || artwork.productionUrl || artwork.url;
  const src = resolveArtworkPreviewImageSrc({
    src: original,
    previewUrl: isPdf ? artwork.permanentPreviewUrl || artwork.previewUrl || artwork.thumbnailUrl : original,
    resourceType: artwork.resourceType, mimeType: artwork.mimeType,
  });
  if (!src) return '';
  try {
    const url = new URL(src);
    if (url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/')) {
      // Preserve page selection for PDFs but replace downscaled UI transforms.
      const [prefix, tail] = url.pathname.split('/image/upload/');
      const segments = tail.split('/');
      let page = '';
      while (segments.length > 1 && /^(?:w|h|c|q|f|pg|dpr|a|e|fl)_/.test(segments[0])) {
        page = segments.shift()!.split(',').find(value => /^pg_\d+$/.test(value)) || page;
      }
      url.pathname = `${prefix}/image/upload/${page ? `${page},` : ''}w_2560,h_2560,c_limit,q_95,f_jpg/${segments.join('/')}`;
      return url.toString();
    }
  } catch { /* Blob/data URLs and other sources are already usable. */ }
  return src;
}

export async function prepareArtworkFitSource(artwork: UploadedArtworkFile): Promise<string> {
  const src = artworkFitSourceUrl(artwork);
  if (!src) throw new Error('Wait for your PDF preview to finish loading, then try again.');
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => { img.onload = img.onerror = null; reject(new Error('Your artwork took too long to load. Please try again.')); }, 20000);
    img.onload = () => { window.clearTimeout(timer); resolve(img); };
    img.onerror = () => { window.clearTimeout(timer); reject(new Error('Your artwork could not be read. Try reloading its preview.')); };
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.src = src;
  });
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Your artwork has no readable image.');
  const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the image.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    for (const quality of [0.96, 0.9, 0.82]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length < 3_800_000) return data;
    }
    throw new Error('This design is too detailed to prepare for AI fit. Try a smaller image.');
  } finally { canvas.width = canvas.height = 1; }
}

/** Save the proposed version first. The current design changes only after this succeeds. */
export async function saveFittedArtwork(result: ArtworkFitResult): Promise<UploadedArtworkFile> {
  if (!canApplyArtworkFit(result)) throw new Error('This version needs another attempt before it can be used.');
  const file = base64ToFile(result.imageBase64, `ai-fit-${result.widthIn}x${result.heightIn}-${result.id}.jpg`, result.mimeType);
  const saved = await uploadArtworkFile(file, { originalWidth: result.widthPx, originalHeight: result.heightPx });
  await preloadPreviewImage(saved.previewUrl, { timeoutMs: 20000 });
  return {
    editorIdentity: `ai-fit:${result.id}`, name: file.name, url: saved.secureUrl, fileKey: saved.fileKey,
    size: file.size, isPdf: false, previewUrl: saved.previewUrl, thumbnailUrl: saved.previewUrl,
    permanentPreviewUrl: saved.previewUrl, productionUrl: saved.productionUrl, productionPublicId: saved.productionPublicId,
    resourceType: saved.resourceType, mimeType: saved.mimeType, originalFormat: saved.format,
    originalBytes: saved.bytes, originalWidth: result.widthPx, originalHeight: result.heightPx, artworkManifest: saved.artworkManifest,
  };
}
