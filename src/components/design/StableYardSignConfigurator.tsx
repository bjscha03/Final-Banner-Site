import React, { useLayoutEffect, useRef } from 'react';
import { buildCommercePreviewUrl, isRawPdfPreviewSource } from '@/lib/commercePreviewUrl';
import {
  dedupePreviewImageSources,
  preloadFirstAvailablePreviewImage,
} from '@/lib/previewImageCache';
import OriginalYardSignConfigurator from './YardSignConfigurator';

type YardSignConfiguratorProps = React.ComponentProps<typeof OriginalYardSignConfigurator>;

const StableYardSignConfigurator: React.FC<YardSignConfiguratorProps> = (props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    const requestToken = new WeakMap<HTMLImageElement, number>();

    const restoreSourceWithoutTreatingItAsNew = (image: HTMLImageElement, url: string) => {
      image.dataset.previewInternalSourceChange = 'true';
      image.src = url;
      queueMicrotask(() => {
        delete image.dataset.previewInternalSourceChange;
      });
    };

    const processImage = (image: HTMLImageElement) => {
      if (!root.contains(image)) return;
      const button = image.closest('button[aria-label^="Preview "]');
      if (!button) return;

      image.loading = 'eager';
      image.decoding = 'sync';
      (image as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';

      const observedSource = String(image.getAttribute('src') || '').trim();
      if (!observedSource) return;

      const readyUrl = image.dataset.previewReadyUrl || '';
      const requestedSource = image.dataset.previewRequestedSource || '';

      if (observedSource === readyUrl) {
        image.dataset.previewReady = 'true';
        return;
      }

      // React can re-apply the original source on a parent render. Keep the
      // already-decoded derivative visible instead of reloading the row image.
      if (requestedSource === observedSource && readyUrl) {
        restoreSourceWithoutTreatingItAsNew(image, readyUrl);
        image.dataset.previewReady = 'true';
        return;
      }

      image.dataset.previewRequestedSource = observedSource;
      image.dataset.previewReady = readyUrl ? 'true' : 'false';

      // During an edited-thumbnail handoff, immediately restore the last decoded
      // frame while the new canvas/CDN URL is loaded in the hidden buffer.
      if (readyUrl) restoreSourceWithoutTreatingItAsNew(image, readyUrl);

      const token = (requestToken.get(image) || 0) + 1;
      requestToken.set(image, token);
      const candidates = dedupePreviewImageSources([
        buildCommercePreviewUrl(observedSource, 112),
        isRawPdfPreviewSource(observedSource) ? null : observedSource,
      ]);

      void preloadFirstAvailablePreviewImage(candidates, {
        timeoutMs: 20_000,
        fetchPriority: 'high',
      }).then((result) => {
        if (disposed || requestToken.get(image) !== token || !root.contains(image)) return;

        const promote = () => {
          if (disposed || requestToken.get(image) !== token || !root.contains(image)) return;
          image.dataset.previewReadyUrl = result.url;
          image.dataset.previewReady = 'true';
        };

        image.dataset.previewInternalSourceChange = 'true';
        image.src = result.url;
        if (image.complete && image.naturalWidth > 0) {
          promote();
        } else {
          image.addEventListener('load', promote, { once: true });
          image.addEventListener('error', () => {
            if (requestToken.get(image) === token) image.dataset.previewReady = readyUrl ? 'true' : 'failed';
          }, { once: true });
        }
        queueMicrotask(() => {
          delete image.dataset.previewInternalSourceChange;
        });
      }).catch(() => {
        if (disposed || requestToken.get(image) !== token) return;
        image.dataset.previewReady = readyUrl ? 'true' : 'failed';
      });
    };

    const scan = (node: ParentNode) => {
      if (node instanceof HTMLImageElement) processImage(node);
      node.querySelectorAll?.('button[aria-label^="Preview "] img').forEach((candidate) => {
        if (candidate instanceof HTMLImageElement) processImage(candidate);
      });
    };

    scan(root);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
          if (mutation.target.dataset.previewInternalSourceChange !== 'true') processImage(mutation.target);
          return;
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node);
        });
      });
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} data-stable-yard-sign-preview="true">
      <style>{`
        [data-stable-yard-sign-preview="true"] button[aria-label^="Preview "] img:not([data-preview-ready="true"]) {
          opacity: 0 !important;
        }
        [data-stable-yard-sign-preview="true"] button[aria-label^="Preview "] img[data-preview-ready="true"] {
          opacity: 1 !important;
        }
      `}</style>
      <OriginalYardSignConfigurator {...props} />
    </div>
  );
};

export default StableYardSignConfigurator;
