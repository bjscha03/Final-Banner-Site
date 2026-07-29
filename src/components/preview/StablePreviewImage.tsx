import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  dedupePreviewImageSources,
  forgetPreviewImage,
  getDecodedPreviewImage,
  normalizePreviewImageUrl,
  preloadPreviewImage,
  type PreviewImageLoadOptions,
  type PreviewImageResult,
} from '@/lib/previewImageCache';

export interface StablePreviewImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad' | 'onError'> {
  src?: string | null;
  sources?: Array<string | null | undefined>;
  fallbackSources?: Array<string | null | undefined>;
  retainPreviousWhileLoading?: boolean;
  loadTimeoutMs?: number;
  onReady?: (result: PreviewImageResult) => void;
  onExhausted?: (error: Error | null) => void;
}

type Layer = PreviewImageResult;
const EMPTY_SOURCES: Array<string | null | undefined> = [];

const StablePreviewImage: React.FC<StablePreviewImageProps> = ({
  src,
  sources = EMPTY_SOURCES,
  fallbackSources = EMPTY_SOURCES,
  retainPreviousWhileLoading = true,
  loadTimeoutMs = 20_000,
  onReady,
  onExhausted,
  className,
  style,
  alt = '',
  crossOrigin,
  loading = 'eager',
  decoding = 'sync',
  fetchPriority = 'high',
  ...imgProps
}) => {
  const sourceSignature = [src, ...sources, ...fallbackSources]
    .map(normalizePreviewImageUrl)
    .filter(Boolean)
    .join('\n');
  const candidates = useMemo(
    () => dedupePreviewImageSources([src, ...sources, ...fallbackSources]),
    // Value-based signature keeps this list stable even when callers pass a
    // freshly-created array literal on every React render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceSignature],
  );

  const initialReady = useMemo(
    () => candidates.map((candidate) => getDecodedPreviewImage(candidate)).find(Boolean) || null,
    // Only seed state on the initial render. Later candidate changes are handled
    // by the decoded double-buffer below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [layers, setLayers] = useState<Layer[]>(() => initialReady ? [initialReady] : []);
  const [activeUrl, setActiveUrl] = useState<string | null>(() => initialReady?.url || null);
  const [targetUrl, setTargetUrl] = useState<string | null>(() => initialReady?.url || null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    initialReady ? 'ready' : candidates.length ? 'loading' : 'idle',
  );
  const [retryNonce, setRetryNonce] = useState(0);
  const requestIdRef = useRef(0);
  const failedUrlsRef = useRef(new Set<string>());
  const cleanupFrameRef = useRef<number | null>(null);
  const announcedUrlRef = useRef<string | null>(initialReady?.url || null);
  const onReadyRef = useRef(onReady);
  const onExhaustedRef = useRef(onExhausted);
  onReadyRef.current = onReady;
  onExhaustedRef.current = onExhausted;

  useEffect(() => () => {
    if (cleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(cleanupFrameRef.current);
    }
  }, []);

  useEffect(() => {
    failedUrlsRef.current.clear();
  }, [sourceSignature]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    const usableCandidates = candidates.filter((candidate) => !failedUrlsRef.current.has(candidate));

    if (usableCandidates.length === 0) {
      setTargetUrl(null);
      setStatus(candidates.length ? 'error' : 'idle');
      if (!retainPreviousWhileLoading) {
        setLayers([]);
        setActiveUrl(null);
      }
      if (candidates.length) onExhaustedRef.current?.(null);
      return () => { cancelled = true; };
    }

    // Stay put only when the active image is already the highest-priority
    // candidate. If a better source becomes available, decode it in the hidden
    // buffer while the existing image remains visible.
    if (activeUrl && usableCandidates[0] === activeUrl) {
      setTargetUrl(activeUrl);
      setStatus('ready');
      return () => { cancelled = true; };
    }

    if (!retainPreviousWhileLoading) {
      setLayers([]);
      setActiveUrl(null);
      announcedUrlRef.current = null;
    }
    setStatus('loading');

    const options: PreviewImageLoadOptions = {
      timeoutMs: loadTimeoutMs,
      crossOrigin: crossOrigin || undefined,
      fetchPriority,
    };

    void (async () => {
      let lastError: Error | null = null;
      for (const candidate of usableCandidates) {
        try {
          const result = await preloadPreviewImage(candidate, options);
          if (cancelled || requestIdRef.current !== requestId) return;
          setLayers((current) => current.some((layer) => layer.url === result.url)
            ? current
            : [...current, result]);
          setTargetUrl(result.url);
          // The preloader has decoded the bytes, but the actual DOM image is
          // promoted only after its own load event. Until then the prior layer
          // remains visible, eliminating blank frames during source handoff.
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          failedUrlsRef.current.add(candidate);
        }
      }

      if (cancelled || requestIdRef.current !== requestId) return;
      setTargetUrl(null);
      setStatus('error');
      if (!retainPreviousWhileLoading) {
        setLayers([]);
        setActiveUrl(null);
      }
      onExhaustedRef.current?.(lastError);
    })();

    return () => { cancelled = true; };
  }, [sourceSignature, retryNonce, retainPreviousWhileLoading, loadTimeoutMs, crossOrigin, fetchPriority, activeUrl, candidates]);

  const promoteLayer = (layer: Layer) => {
    if (layer.url !== targetUrl) return;
    setActiveUrl(layer.url);
    setStatus('ready');

    if (announcedUrlRef.current !== layer.url) {
      announcedUrlRef.current = layer.url;
      onReadyRef.current?.(layer);
    }

    if (cleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(cleanupFrameRef.current);
    }
    cleanupFrameRef.current = window.requestAnimationFrame(() => {
      setLayers((current) => current.filter((candidate) => candidate.url === layer.url));
      cleanupFrameRef.current = null;
    });
  };

  const rejectLayer = (url: string) => {
    forgetPreviewImage(url);
    failedUrlsRef.current.add(url);
    setLayers((current) => current.filter((layer) => layer.url !== url));
    if (activeUrl === url) setActiveUrl(null);
    if (targetUrl === url) setTargetUrl(null);
    setRetryNonce((value) => value + 1);
  };

  if (layers.length === 0) {
    return <span aria-hidden="true" data-preview-image-state={status} className={className} style={style} />;
  }

  return (
    <>
      {layers.map((layer) => {
        const active = layer.url === activeUrl;
        return (
          <img
            {...imgProps}
            key={layer.url}
            src={layer.url}
            alt={active ? alt : ''}
            aria-hidden={active ? imgProps['aria-hidden'] : true}
            className={className}
            style={{
              ...style,
              ...(active ? null : {
                position: 'absolute',
                inset: 0,
                opacity: 0,
                visibility: 'hidden',
                pointerEvents: 'none',
              }),
            }}
            crossOrigin={crossOrigin}
            loading={loading}
            decoding={decoding}
            fetchPriority={fetchPriority}
            draggable={imgProps.draggable ?? false}
            data-preview-image-state={active ? 'ready' : 'buffering'}
            onLoad={() => promoteLayer(layer)}
            onError={() => rejectLayer(layer.url)}
          />
        );
      })}
    </>
  );
};

export default StablePreviewImage;
