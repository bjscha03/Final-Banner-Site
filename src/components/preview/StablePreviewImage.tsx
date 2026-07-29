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
    // Value-based signature keeps the list stable when callers create a new
    // array literal during every React render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceSignature],
  );

  const initialReady = useMemo(
    () => candidates.map((candidate) => getDecodedPreviewImage(candidate)).find(Boolean) || null,
    // Later candidate changes are handled by the decoded double-buffer.
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
  const activeUrlRef = useRef<string | null>(initialReady?.url || null);
  const targetUrlRef = useRef<string | null>(initialReady?.url || null);
  const onReadyRef = useRef(onReady);
  const onExhaustedRef = useRef(onExhausted);

  activeUrlRef.current = activeUrl;
  targetUrlRef.current = targetUrl;
  onReadyRef.current = onReady;
  onExhaustedRef.current = onExhausted;

  const updateTarget = (url: string | null) => {
    targetUrlRef.current = url;
    setTargetUrl(url);
  };

  const updateActive = (url: string | null) => {
    activeUrlRef.current = url;
    setActiveUrl(url);
  };

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
      updateTarget(null);
      if (!retainPreviousWhileLoading) {
        setLayers([]);
        updateActive(null);
      }
      const hasVisibleLayer = Boolean(activeUrlRef.current);
      setStatus(hasVisibleLayer ? 'ready' : candidates.length ? 'error' : 'idle');
      if (candidates.length && !hasVisibleLayer) onExhaustedRef.current?.(null);
      return () => { cancelled = true; };
    }

    const currentActive = retainPreviousWhileLoading ? activeUrlRef.current : null;
    const activeIndex = currentActive ? usableCandidates.indexOf(currentActive) : -1;

    // The best source is already painted. No fallback work is necessary.
    if (activeIndex === 0) {
      updateTarget(currentActive);
      setStatus('ready');
      return () => { cancelled = true; };
    }

    if (!retainPreviousWhileLoading) {
      setLayers([]);
      updateActive(null);
      updateTarget(null);
      announcedUrlRef.current = null;
    }

    // If a lower-priority image is visible, only load candidates that can
    // improve it. With no visible image, load every candidate concurrently so
    // a ready data/blob thumbnail can paint immediately while a preferred CDN
    // image continues loading in the background.
    const candidatesToLoad = activeIndex > 0
      ? usableCandidates.slice(0, activeIndex).map((url, index) => ({ url, index }))
      : usableCandidates.map((url, index) => ({ url, index }));

    if (candidatesToLoad.length === 0) {
      setStatus(activeUrlRef.current ? 'ready' : 'idle');
      return () => { cancelled = true; };
    }

    setStatus('loading');
    const options: PreviewImageLoadOptions = {
      timeoutMs: loadTimeoutMs,
      crossOrigin: crossOrigin || undefined,
      fetchPriority,
    };
    const readyByIndex = new Map<number, PreviewImageResult>();
    let remaining = candidatesToLoad.length;
    let successfulLoads = 0;
    let lastError: Error | null = null;

    const considerPromotion = () => {
      const bestIndex = [...readyByIndex.keys()].sort((a, b) => a - b)[0];
      if (bestIndex === undefined) return;
      const best = readyByIndex.get(bestIndex);
      if (!best) return;

      setLayers((current) => current.some((layer) => layer.url === best.url)
        ? current
        : [...current, best]);

      const visibleUrl = activeUrlRef.current;
      const visibleIndex = visibleUrl ? usableCandidates.indexOf(visibleUrl) : -1;

      if (!visibleUrl) {
        // Keep the first decoded target until its DOM image has painted. A
        // higher-priority result that finishes milliseconds later will upgrade
        // it on the next effect without delaying the first visible frame.
        if (!targetUrlRef.current) updateTarget(best.url);
        return;
      }

      if (visibleIndex < 0 || bestIndex < visibleIndex) {
        updateTarget(best.url);
      }
    };

    const finishOne = () => {
      remaining -= 1;
      if (remaining > 0 || cancelled || requestIdRef.current !== requestId) return;

      const hasVisibleLayer = Boolean(activeUrlRef.current);
      if (successfulLoads === 0 && !hasVisibleLayer) {
        updateTarget(null);
        setStatus('error');
        if (!retainPreviousWhileLoading) setLayers([]);
        onExhaustedRef.current?.(lastError);
      } else if (hasVisibleLayer && !targetUrlRef.current) {
        updateTarget(activeUrlRef.current);
        setStatus('ready');
      }
    };

    candidatesToLoad.forEach(({ url, index }) => {
      void preloadPreviewImage(url, options)
        .then((result) => {
          if (cancelled || requestIdRef.current !== requestId) return;
          successfulLoads += 1;
          readyByIndex.set(index, result);
          considerPromotion();
        })
        .catch((error) => {
          if (cancelled || requestIdRef.current !== requestId) return;
          lastError = error instanceof Error ? error : new Error(String(error));
          failedUrlsRef.current.add(url);
        })
        .finally(finishOne);
    });

    return () => { cancelled = true; };
  }, [sourceSignature, retryNonce, retainPreviousWhileLoading, loadTimeoutMs, crossOrigin, fetchPriority, activeUrl, candidates]);

  const promoteLayer = (layer: Layer) => {
    if (layer.url !== targetUrlRef.current) return;
    updateActive(layer.url);
    setStatus('ready');

    if (announcedUrlRef.current !== layer.url) {
      announcedUrlRef.current = layer.url;
      onReadyRef.current?.(layer);
    }

    if (cleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(cleanupFrameRef.current);
    }
    cleanupFrameRef.current = window.requestAnimationFrame(() => {
      const keep = new Set([activeUrlRef.current, targetUrlRef.current].filter(Boolean));
      setLayers((current) => current.filter((candidate) => keep.has(candidate.url)));
      cleanupFrameRef.current = null;
    });
  };

  const rejectLayer = (url: string) => {
    forgetPreviewImage(url);
    failedUrlsRef.current.add(url);
    setLayers((current) => current.filter((layer) => layer.url !== url));
    if (activeUrlRef.current === url) updateActive(null);
    if (targetUrlRef.current === url) updateTarget(null);
    setRetryNonce((value) => value + 1);
  };

  if (layers.length === 0) {
    return (
      <span
        aria-hidden="true"
        data-preview-image-state={status}
        className={`block ${className || ''}`}
        style={style}
      />
    );
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
