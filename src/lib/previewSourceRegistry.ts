import { dedupePreviewImageSources, normalizePreviewImageUrl } from './previewImageCache';

const MAX_REGISTRY_ENTRIES = 320;
const fallbackRegistry = new Map<string, string[]>();
const exactCompositionRegistry = new Map<string, boolean>();
const immutableExactArtifactRegistry = new Map<string, boolean>();

function trimRegistry(): void {
  while (fallbackRegistry.size > MAX_REGISTRY_ENTRIES) {
    const firstKey = fallbackRegistry.keys().next().value as string | undefined;
    if (!firstKey) break;
    fallbackRegistry.delete(firstKey);
    exactCompositionRegistry.delete(firstKey);
    immutableExactArtifactRegistry.delete(firstKey);
  }
}

function inferExactComposition(url: string): boolean {
  return /(?:approved[-_/ ]?(?:thumbnail|web[-_ ]?preview)|final[-_/ ]?render|placement[-_/ ]?preview|proof|yard[-_/ ]?sign[-_/ ]?preview)/i.test(url)
    || url.startsWith('data:image/');
}

/**
 * Associate every valid representation of an artwork item with the same ordered
 * fallback chain. Commerce surfaces usually receive only one URL prop; this
 * registry lets the shared renderer recover through placement preview, final
 * render, positioned thumbnail, PDF derivative, and original image without
 * changing every legacy caller at once.
 */
export function registerPreviewSourceCandidates(
  primary: string | null | undefined,
  values: Array<string | null | undefined>,
  options: {
    exactComposition?: boolean;
    immutableExactArtifact?: boolean;
  } = {},
): string[] {
  const normalizedPrimary = normalizePreviewImageUrl(primary);
  const candidates = dedupePreviewImageSources([normalizedPrimary, ...values]);
  if (!normalizedPrimary || candidates.length === 0) return candidates;

  const exactComposition = options.exactComposition
    ?? inferExactComposition(normalizedPrimary);

  for (const candidate of candidates) {
    // Reinsert so recently used entries move to the end of Map iteration order.
    fallbackRegistry.delete(candidate);
    fallbackRegistry.set(candidate, candidates);
    if (candidate === normalizedPrimary) {
      exactCompositionRegistry.set(candidate, exactComposition);
      immutableExactArtifactRegistry.set(
        candidate,
        immutableExactArtifactRegistry.get(candidate) === true
          || options.immutableExactArtifact === true,
      );
    }
  }
  trimRegistry();
  return candidates;
}

export function getRegisteredPreviewSourceCandidates(
  primary: string | null | undefined,
): string[] {
  const normalizedPrimary = normalizePreviewImageUrl(primary);
  if (!normalizedPrimary) return [];
  const registered = fallbackRegistry.get(normalizedPrimary) || [];
  return dedupePreviewImageSources([normalizedPrimary, ...registered]);
}

export function isRegisteredExactComposition(
  primary: string | null | undefined,
): boolean {
  const normalizedPrimary = normalizePreviewImageUrl(primary);
  if (!normalizedPrimary) return false;
  return exactCompositionRegistry.get(normalizedPrimary) === true;
}

export function isRegisteredImmutableExactArtifact(
  primary: string | null | undefined,
): boolean {
  const normalizedPrimary = normalizePreviewImageUrl(primary);
  if (!normalizedPrimary) return false;
  return immutableExactArtifactRegistry.get(normalizedPrimary) === true;
}

export function clearPreviewSourceRegistry(): void {
  fallbackRegistry.clear();
  exactCompositionRegistry.clear();
  immutableExactArtifactRegistry.clear();
}
