import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  dedupePreviewImageSources,
  forgetPreviewImage,
  getDecodedPreviewImage,
  isVisuallyBlankPreviewResult,
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

  const initialReady = useMemo(() => {
    const decoded = candidates
      .map((candidate) => getDecodedPreviewImage(candidate))
      .filter((candidate): candidate is PreviewImageResult => Boolean(candidate));
    const visible = decoded.find((candidate) => !isVisuallyBlankPreviewResult(candidate));
    // A single all-white source can be legitimate artwork. Reject an empty
    // generated snapshot only when another candidate can recover the item.
    return visible || (candidates.length === 1 ? decoded[0] : null) || null;
    // Later candidate changes are handled by the decoded double-buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Start unannounced even when the layer was seeded synchronously from cache.
  // The parent still needs its onReady callback so it can clear aria-busy and
  // reveal text/grommet/overlay composition in cart and enlarged previews.
  const announcedUrlRef = useRef<string | null>(null);
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

  const announceReady = (result: PreviewImageResult) => {
    if (announcedUrlRef.current === result.url) return;
    announcedUrlRef.current = result.url;
    onReadyRef.current?.(result);
  };

  // A cached/decoded layer can be painted on the first render without another
  // network or DOM load event. Explicitly announce that state after mount;
  // otherwise the parent remains permanently busy even though the image is
  // already visible.
  useEffect(() => {
    if (initialReady) announceReady(initialReady);
    // initialReady is intentionally fixed to the component's first candidate
    // set. Later decoded sources announce from the promotion path below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReady?.url]);

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

    if (targetUrlRef.current
      && targetUrlRef.current !== activeUrlRef.current
      && !usableCandidates.includes(targetUrlRef.current)) {
      updateTarget(activeUrlRef.current);
    }

    const currentActive = retainPreviousWhileLoading ? activeUrlRef.current : null;
    const activeIndex = currentActive ? usableCandidates.indexOf(currentActive) : -1;

    if (activeIndex === 0) {
      updateTarget(currentActive);
      setStatus('ready');
      const cached = currentActive ? getDecodedPreviewImage(currentActive) : null;
      if (cached && !(isVisuallyBlankPreviewResult(cached) && usableCandidates.length > 1)) {
        announceReady(cached);
        return () => { cancelled = true; };
      }
      if (currentActive) {
        failedUrlsRef.current.add(currentActive);
        setLayers((current) => current.filter((layer) => layer.url !== currentActive));
        updateActive(null);
        updateTarget(null);
        setRetryNonce((value) => value + 1);
      }
      return () => { cancelled = true; };
    }

    if (!retainPreviousWhileLoading) {
      setLayers([]);
      updateActive(null);
      updateTarget(null);
      announcedUrlRef.current = null;
    }

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
        if (!targetUrlRef.current) updateTarget(best.url);
        setStatus('ready');
        announceReady(best);
        return;
      }

      if (visibleIndex < 0 || bestIndex < visibleIndex) {
        updateTarget(best.url);
        setStatus('ready');
        announceReady(best);
      }
    };

    const finishOne = () => {
      remaining -= 1;
      if (remaining > 0 || cancelled || requestIdRef.current !== requestId) return;

      const hasVisibleLayer = Boolean(activeUrlRef.current || targetUrlRef.current);
      if (successfulLoads === 0 && !hasVisibleLayer) {
        updateTarget(null);
        setStatus('error');
        if (!retainPreviousWhileLoading) setLayers([]);
        onExhaustedRef.current?.(lastError);
      } else if (hasVisibleLayer) {
        setStatus('ready');
      }
    };

    candidatesToLoad.forEach(({ url, index }) => {
      void preloadPreviewImage(url, options)
        .then((result) => {
          if (cancelled || requestIdRef.current !== requestId) return;
          if (isVisuallyBlankPreviewResult(result) && usableCandidates.length > 1) {
            failedUrlsRef.current.add(url);
            lastError = new Error('Generated preview contained no visible artwork.');
            console.warn('[StablePreviewImage] rejected empty generated snapshot; using fallback', {
              inkFraction: result.visualInkFraction,
              candidateIndex: index,
            });
            return;
          }
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
    announceReady(layer);

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
        const target = !active && layer.url === targetUrl;
        const visible = active || target;
        return (
          <img
            {...imgProps}
            key={`${layer.url}:${visible ? 'visible' : 'buffer'}`}
            src={layer.url}
            alt={active || (!activeUrl && target) ? alt : ''}
            aria-hidden={active || (!activeUrl && target) ? imgProps['aria-hidden'] : true}
            className={className}
            style={{
              ...style,
              ...(active ? {
                zIndex: 1,
              } : target ? {
                position: 'absolute',
                inset: 0,
                opacity: 1,
                visibility: 'visible',
                pointerEvents: 'none',
                zIndex: 2,
              } : {
                position: 'absolute',
                inset: 0,
                opacity: 0,
                visibility: 'hidden',
                pointerEvents: 'none',
                zIndex: 0,
              }),
            }}
            crossOrigin={crossOrigin}
            loading={loading}
            decoding={decoding}
            fetchPriority={fetchPriority}
            draggable={imgProps.draggable ?? false}
            data-preview-image-state={active ? 'ready' : target ? 'target' : 'buffering'}
            data-preview-ink-fraction={layer.visualInkFraction ?? undefined}
            onLoad={() => promoteLayer(layer)}
            onError={() => rejectLayer(layer.url)}
          />
        );
      })}
    </>
  );
};

export default StablePreviewImage;
