import {
  isTransientPreviewImageUrl,
  normalizePreviewImageUrl,
} from './previewImageCache';

export type SessionArtworkPreviewDecision = {
  displaySource: string;
  pendingPermanentSource: string | null;
  preloadIncoming: boolean;
  switchAfterDecode: boolean;
};

/**
 * Decide how an active editing canvas should react when its incoming preview
 * URL changes. The critical rule is that upload completion must not replace a
 * healthy browser-local blob/data preview with a remote URL. The local image is
 * already visible and represents the exact selected file; the remote asset is
 * background-preloaded and kept only as a retry/navigation fallback.
 */
export function decideSessionArtworkPreviewSource(
  currentValue?: string | null,
  incomingValue?: string | null,
): SessionArtworkPreviewDecision {
  const current = normalizePreviewImageUrl(currentValue);
  const incoming = normalizePreviewImageUrl(incomingValue);

  if (!incoming) {
    return {
      displaySource: current,
      pendingPermanentSource: null,
      preloadIncoming: false,
      switchAfterDecode: false,
    };
  }

  if (!current || current === incoming) {
    return {
      displaySource: incoming,
      pendingPermanentSource: null,
      preloadIncoming: false,
      switchAfterDecode: false,
    };
  }

  if (isTransientPreviewImageUrl(incoming)) {
    return {
      displaySource: incoming,
      pendingPermanentSource: null,
      preloadIncoming: false,
      switchAfterDecode: false,
    };
  }

  if (isTransientPreviewImageUrl(current)) {
    return {
      displaySource: current,
      pendingPermanentSource: incoming,
      preloadIncoming: true,
      switchAfterDecode: false,
    };
  }

  return {
    displaySource: current,
    pendingPermanentSource: incoming,
    preloadIncoming: true,
    switchAfterDecode: true,
  };
}
