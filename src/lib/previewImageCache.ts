export type PreviewImageResult = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  /**
   * Fraction of sampled pixels that differ meaningfully from the preview
   * background. Calculated only for browser-local data/blob snapshots, where
   * canvas inspection is safe. `null` means the source was not inspected.
   */
  visualInkFraction: number | null;
};

type PreviewImageCacheEntry = {
  status: 'loading' | 'ready' | 'error';
  promise?: Promise<PreviewImageResult>;
  result?: PreviewImageResult;
  error?: Error;
  touchedAt: number;
};

export type PreviewImageLoadOptions = {
  timeoutMs?: number;
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
  fetchPriority?: 'high' | 'low' | 'auto';
};

const MAX_CACHE_ENTRIES = 160;
const DEFAULT_TIMEOUT_MS = 20_000;
const TRANSIENT_SAMPLE_SIZE = 64;
const PREVIEW_BACKGROUND_RGB = [250, 250, 250] as const;
const previewImageCache = new Map<string, PreviewImageCacheEntry>();

export const normalizePreviewImageUrl = (value?: string | null): string => String(value || '').trim();

export const isTransientPreviewImageUrl = (value?: string | null): boolean => {
  const url = normalizePreviewImageUrl(value).toLowerCase();
  return url.startsWith('blob:') || url.startsWith('data:image/');
};

export const isRemotePreviewImageUrl = (value?: string | null): boolean => {
  const url = normalizePreviewImageUrl(value).toLowerCase();
  return url.startsWith('https://') || url.startsWith('http://');
};

/**
 * A generated in-session snapshot with effectively no painted pixels is not a
 * valid proof. When another source exists, StablePreviewImage rejects this
 * candidate and falls through to the permanent artwork instead of showing the
 * white frame reported on wide banners.
 */
export const isVisuallyBlankPreviewResult = (
  result?: PreviewImageResult | null,
): boolean => Boolean(
  result
  && result.visualInkFraction != null
  && result.visualInkFraction < 0.0005,
);

export function dedupePreviewImageSources(
  values: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const url = normalizePreviewImageUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function trimCache(): void {
  if (previewImageCache.size <= MAX_CACHE_ENTRIES) return;
  const removable = [...previewImageCache.entries()]
    .filter(([, entry]) => entry.status !== 'loading')
    .sort((a, b) => a[1].touchedAt - b[1].touchedAt);

  while (previewImageCache.size > MAX_CACHE_ENTRIES && removable.length > 0) {
    const [url] = removable.shift()!;
    previewImageCache.delete(url);
  }
}

function inspectTransientImage(
  image: HTMLImageElement,
  url: string,
): number | null {
  if (!isTransientPreviewImageUrl(url)) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = TRANSIENT_SAMPLE_SIZE;
    canvas.height = TRANSIENT_SAMPLE_SIZE;
    const context = canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
    });
    if (!context) return null;

    context.fillStyle = '#fafafa';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const naturalWidth = image.naturalWidth || 1;
    const naturalHeight = image.naturalHeight || 1;
    const scale = Math.min(
      canvas.width / naturalWidth,
      canvas.height / naturalHeight,
    );
    const drawWidth = Math.max(1, naturalWidth * scale);
    const drawHeight = Math.max(1, naturalHeight * scale);
    const drawX = (canvas.width - drawWidth) / 2;
    const drawY = (canvas.height - drawHeight) / 2;
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data;
    let painted = 0;
    const total = canvas.width * canvas.height;

    for (let offset = 0; offset < pixels.length; offset += 4) {
      const distance = Math.max(
        Math.abs(pixels[offset] - PREVIEW_BACKGROUND_RGB[0]),
        Math.abs(pixels[offset + 1] - PREVIEW_BACKGROUND_RGB[1]),
        Math.abs(pixels[offset + 2] - PREVIEW_BACKGROUND_RGB[2]),
      );
      if (distance > 12) painted += 1;
    }

    canvas.width = 0;
    canvas.height = 0;
    return painted / total;
  } catch {
    // Visual inspection is a supplemental safety check. Never reject an image
    // merely because a browser denied canvas inspection.
    return null;
  }
}

export function getDecodedPreviewImage(value?: string | null): PreviewImageResult | null {
  const url = normalizePreviewImageUrl(value);
  if (!url) return null;
  const entry = previewImageCache.get(url);
  if (!entry || entry.status !== 'ready' || !entry.result) return null;
  entry.touchedAt = Date.now();
  return entry.result;
}

export function forgetPreviewImage(value?: string | null): void {
  const url = normalizePreviewImageUrl(value);
  if (url) previewImageCache.delete(url);
}

export function preloadPreviewImage(
  value?: string | null,
  options: PreviewImageLoadOptions = {},
): Promise<PreviewImageResult> {
  const url = normalizePreviewImageUrl(value);
  if (!url) return Promise.reject(new Error('Preview image URL is empty.'));

  const cached = previewImageCache.get(url);
  if (cached?.status === 'ready' && cached.result) {
    cached.touchedAt = Date.now();
    return Promise.resolve(cached.result);
  }
  if (cached?.status === 'loading' && cached.promise) {
    cached.touchedAt = Date.now();
    return cached.promise;
  }

  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve({
      url,
      naturalWidth: 0,
      naturalHeight: 0,
      visualInkFraction: null,
    });
  }

  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const entry: PreviewImageCacheEntry = {
    status: 'loading',
    touchedAt: Date.now(),
  };

  const promise = new Promise<PreviewImageResult>((resolve, reject) => {
    const image = new Image();
    let settled = false;

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      window.clearTimeout(timeoutId);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      entry.status = 'error';
      entry.error = error;
      entry.promise = undefined;
      entry.touchedAt = Date.now();
      reject(error);
    };

    const finish = async () => {
      if (settled) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        fail(new Error('Preview image loaded without usable dimensions.'));
        return;
      }

      try {
        if (typeof image.decode === 'function') {
          await image.decode();
        }
      } catch {
        // Safari can reject decode() for an image that has already completed.
        // A valid natural size after onload is still safe to paint.
      }

      if (settled) return;
      settled = true;
      cleanup();
      const result: PreviewImageResult = {
        url,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        visualInkFraction: inspectTransientImage(image, url),
      };
      entry.status = 'ready';
      entry.result = result;
      entry.promise = undefined;
      entry.error = undefined;
      entry.touchedAt = Date.now();
      trimCache();
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => {
      fail(new Error(`Preview image timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    image.decoding = 'async';
    const fetchPriorityImage = image as HTMLImageElement & { fetchPriority?: string };
    fetchPriorityImage.fetchPriority = options.fetchPriority ?? 'high';
    if (options.crossOrigin && isRemotePreviewImageUrl(url)) {
      image.crossOrigin = options.crossOrigin;
    }
    image.onload = () => { void finish(); };
    image.onerror = () => fail(new Error('Preview image failed to load.'));
    image.src = url;

    // Cached data/blob images can complete before an onload callback is observed
    // on iOS. Check immediately and on the next frame as a second safe path.
    if (image.complete && image.naturalWidth > 0) void finish();
    window.requestAnimationFrame(() => {
      if (!settled && image.complete && image.naturalWidth > 0) void finish();
    });
  });

  entry.promise = promise;
  previewImageCache.set(url, entry);
  trimCache();
  return promise;
}

export async function preloadFirstAvailablePreviewImage(
  values: Array<string | null | undefined>,
  options: PreviewImageLoadOptions = {},
): Promise<PreviewImageResult> {
  const candidates = dedupePreviewImageSources(values);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      return await preloadPreviewImage(candidate, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('No usable preview image source was available.');
}
