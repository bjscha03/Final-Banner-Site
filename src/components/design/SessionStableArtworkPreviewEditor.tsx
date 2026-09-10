import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OriginalArtworkPreviewEditor, {
  type ArtworkPreviewEditorHandle,
  type ArtworkPreviewEditorProps,
  type ArtworkTransform,
} from './ArtworkPreviewEditor';
import { preloadPreviewImage } from '@/lib/previewImageCache';
import { decideSessionArtworkPreviewSource } from '@/lib/sessionArtworkPreviewSource';
import {
  getPreviewCrossOrigin,
  resolveArtworkPreviewImageSrc,
} from './artworkPreviewSource';

export type { ArtworkPreviewEditorHandle, ArtworkPreviewEditorProps, ArtworkTransform };

/**
 * Active design canvases intentionally use one persistent DOM image, not the
 * multi-layer commerce thumbnail renderer. A browser-local blob/data preview is
 * kept for the full editing session while the permanent upload is decoded in
 * the background. This prevents upload completion from remounting the image,
 * repainting the canvas, flashing white, or leaving the artwork blank.
 */
const SessionStableArtworkPreviewEditor = forwardRef<ArtworkPreviewEditorHandle, ArtworkPreviewEditorProps>((props, forwardedRef) => {
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
    const decision = decideSessionArtworkPreviewSource(
      displaySourceRef.current,
      incomingSource,
    );

    pendingPermanentSourceRef.current = decision.pendingPermanentSource;

    if (decision.displaySource && decision.displaySource !== displaySourceRef.current) {
      commitDisplaySource(decision.displaySource);
    }

    if (!decision.preloadIncoming || !decision.pendingPermanentSource) return;

    const pendingSource = decision.pendingPermanentSource;
    const crossOrigin = getPreviewCrossOrigin(pendingSource, props.imageCrossOrigin);

    void preloadPreviewImage(pendingSource, {
      timeoutMs: 20_000,
      crossOrigin,
      fetchPriority: 'high',
    }).then(() => {
      if (generation !== sourceGenerationRef.current) return;

      // Only a genuine permanent-to-permanent artwork replacement switches after
      // decode. Upload completion never replaces a healthy local editing image.
      if (
        decision.switchAfterDecode
        && displaySourceRef.current === decision.displaySource
      ) {
        commitDisplaySource(pendingSource);
        pendingPermanentSourceRef.current = null;
      }
    }).catch(() => {
      // Keep the already-painted image. Retry may use the permanent fallback.
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
    <OriginalArtworkPreviewEditor
      ref={forwardedRef}
      {...props}
      src={effectiveSource}
      previewUrl={effectiveSource || null}
      // The original editor uses productionUrl as its artwork identity key.
      // Pinning it to the painted source prevents upload completion from
      // restarting image/layout effects underneath the visible canvas.
      productionUrl={effectiveSource}
      onRetryPreview={handleRetryPreview}
    />
  );
});

SessionStableArtworkPreviewEditor.displayName = 'SessionStableArtworkPreviewEditor';

export default SessionStableArtworkPreviewEditor;
