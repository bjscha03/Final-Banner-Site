import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StableArtworkPreviewEditor, {
  type ArtworkPreviewEditorProps,
  type ArtworkTransform,
} from './StableArtworkPreviewEditor';
import { preloadPreviewImage } from '@/lib/previewImageCache';
import { decideSessionArtworkPreviewSource } from '@/lib/sessionArtworkPreviewSource';
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

      // Only a real permanent-to-permanent artwork replacement switches after
      // decode. A local-to-permanent upload handoff intentionally stays on the
      // already-visible browser-local image for the rest of this editor session.
      if (
        decision.switchAfterDecode
        && displaySourceRef.current === decision.displaySource
      ) {
        commitDisplaySource(pendingSource);
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
      // StableArtworkPreviewEditor uses productionUrl only as its internal
      // artwork identity key. Keep that identity on the visible source so the
      // upload finishing cannot restart resize/selection effects underneath it.
      productionUrl={effectiveSource}
      onRetryPreview={handleRetryPreview}
    />
  );
};

export default SessionStableArtworkPreviewEditor;
