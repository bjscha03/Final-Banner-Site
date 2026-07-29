import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StableArtworkPreviewEditor, {
  type ArtworkPreviewEditorProps,
  type ArtworkTransform,
} from './StableArtworkPreviewEditor';
import {
  isTransientPreviewImageUrl,
  preloadPreviewImage,
} from '@/lib/previewImageCache';
import {
  getPreviewCrossOrigin,
  resolveArtworkPreviewImageSrc,
} from './artworkPreviewSource';

export type { ArtworkPreviewEditorProps, ArtworkTransform };

/**
 * Keeps the browser-local artwork preview on the active editing canvas for the
 * full editing session. Upload completion may replace `previewUrl` with a
 * permanent Cloudinary URL; swapping at that exact moment caused the canvas to
 * flash and sometimes go blank on mobile Safari. The permanent URL is still
 * preloaded and retained as a retry fallback, but it never replaces a healthy
 * blob/data preview merely because the background upload completed.
 */
const SessionStableArtworkPreviewEditor: React.FC<ArtworkPreviewEditorProps> = (props) => {
  const incomingSource = useMemo(
    () => resolveArtworkPreviewImageSrc({
      src: props.src,
      previewUrl: props.previewUrl,
      resourceType: props.resourceType,
      mimeType: props.mimeType,
    }),
    [props.src, props.previewUrl, props.resourceType, props.mimeType],
  );

  const [displaySource, setDisplaySource] = useState(incomingSource);
  const displaySourceRef = useRef(incomingSource);
  const pendingPermanentSourceRef = useRef<string | null>(null);
  const sourceGenerationRef = useRef(0);

  const commitDisplaySource = useCallback((next: string) => {
    displaySourceRef.current = next;
    setDisplaySource(next);
  }, []);

  useEffect(() => {
    const generation = ++sourceGenerationRef.current;
    const current = displaySourceRef.current;

    // A brief empty prop during parent state reconciliation must never blank a
    // preview that is already visible. Clearing the upload unmounts this editor.
    if (!incomingSource) return;
    if (!current) {
      commitDisplaySource(incomingSource);
      return;
    }
    if (incomingSource === current) return;

    const currentIsTransient = isTransientPreviewImageUrl(current);
    const incomingIsTransient = isTransientPreviewImageUrl(incomingSource);

    // A new blob/data URL represents a new user-selected file or AI result and
    // must replace the previous artwork immediately.
    if (incomingIsTransient) {
      pendingPermanentSourceRef.current = null;
      commitDisplaySource(incomingSource);
      return;
    }

    const crossOrigin = getPreviewCrossOrigin(incomingSource, props.imageCrossOrigin);
    pendingPermanentSourceRef.current = incomingSource;

    // Decode the permanent source in the background. For a local-to-permanent
    // upload handoff, deliberately keep the local preview visible. It is the
    // exact bytes the user selected and is not revoked while this editor lives.
    void preloadPreviewImage(incomingSource, {
      timeoutMs: 20_000,
      crossOrigin,
      fetchPriority: 'high',
    }).then(() => {
      if (generation !== sourceGenerationRef.current) return;

      // Permanent-to-permanent means the artwork itself changed without a local
      // file stage (for example, restoring a different saved design). Switch
      // only after the replacement is decoded. Never switch a healthy local
      // preview merely because its upload finished.
      if (!currentIsTransient && displaySourceRef.current === current) {
        commitDisplaySource(incomingSource);
        pendingPermanentSourceRef.current = null;
      }
    }).catch(() => {
      // The visible source remains untouched. Retry can still invoke the page's
      // PDF regeneration path or attempt the permanent fallback later.
    });
  }, [incomingSource, props.imageCrossOrigin, commitDisplaySource]);

  const handleRetryPreview = useCallback(async () => {
    const permanentFallback = pendingPermanentSourceRef.current;
    if (permanentFallback && permanentFallback !== displaySourceRef.current) {
      commitDisplaySource(permanentFallback);
      pendingPermanentSourceRef.current = null;
    }
    await props.onRetryPreview?.();
  }, [props.onRetryPreview, commitDisplaySource]);

  const effectiveSource = displaySource || incomingSource || props.src;

  return (
    <StableArtworkPreviewEditor
      {...props}
      src={effectiveSource}
      previewUrl={effectiveSource || null}
      onRetryPreview={handleRetryPreview}
    />
  );
};

export default SessionStableArtworkPreviewEditor;
