import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import OrderItemPreview from '@/components/preview/OrderItemPreview';
import {
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
} from '@/lib/previewLifecycle';

const goodSource = `${window.location.origin}/images/header-logo.png?order-surface-good=1`;
const fallbackOriginal = `${window.location.origin}/images/header-logo.png?order-surface-original=1`;
const badSource = `${window.location.origin}/images/does-not-exist-order-preview.png?bad=1`;
const composition = {
  version: PREVIEW_ARTIFACT_VERSION,
  sourceIdentity: 'order-surface-source@1@1',
  sourceUrl: fallbackOriginal,
  productType: 'banner',
  widthIn: 48,
  heightIn: 24,
  fitMode: 'fit',
  transform: { xPct: 9, yPct: -3, scaleX: 1.4, scaleY: 1.2 },
  revision: 2,
};
const placementPreview = {
  version: PREVIEW_ARTIFACT_VERSION,
  sourceIdentity: composition.sourceIdentity,
  sourceUrl: composition.sourceUrl,
  productType: composition.productType,
  widthIn: composition.widthIn,
  heightIn: composition.heightIn,
  fitMode: composition.fitMode,
  positionPct: { x: composition.transform.xPct, y: composition.transform.yPct },
  scaleX: composition.transform.scaleX,
  scaleY: composition.transform.scaleY,
  compositionRevision: composition.revision,
  compositionSignature: buildCompositionSignature(composition),
  url: goodSource,
  publicId: 'order-surface-exact',
  previewUrl: goodSource,
  previewPublicId: 'order-surface-exact',
  previewWidthPx: 1200,
  previewHeightPx: 600,
  uploadStatus: 'uploaded',
  createdAt: '2026-08-02T00:00:00.000Z',
  uploadedAt: '2026-08-02T00:00:00.000Z',
  error: null,
};

const item = {
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'every-2-3ft',
  line_total_cents: 3600,
  placement_preview: placementPreview,
  web_preview_url: badSource,
  file_url: fallbackOriginal,
};

function isPaintedImage(image) {
  if (!(image instanceof HTMLImageElement)) return false;
  const style = window.getComputedStyle(image);
  const rect = image.getBoundingClientRect();
  return Boolean(
    image.complete
    && image.naturalWidth > 0
    && image.naturalHeight > 0
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number.parseFloat(style.opacity || '1') > 0.01
    && rect.width > 0
    && rect.height > 0
  );
}

function paintedImages(scope) {
  if (!scope) return [];
  return Array.from(scope.querySelectorAll('img[data-preview-image-state]')).filter(isPaintedImage);
}

function visibleSource(scope) {
  const images = paintedImages(scope);
  return images.find((image) => image.dataset.previewImageState === 'ready')?.src
    || images.find((image) => image.dataset.previewImageState === 'target')?.src
    || images.at(-1)?.src
    || '';
}

function rect(node) {
  if (!node) return null;
  const value = node.getBoundingClientRect();
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    right: value.right,
    bottom: value.bottom,
  };
}

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function waitUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await delay(25);
  }
  throw new Error(message);
}

function finish(result, details) {
  document.body.dataset.previewHandoffResult = result;
  window.__PREVIEW_HANDOFF_RESULT__ = { result, ...details };
  const output = document.getElementById('preview-handoff-output');
  if (output) output.textContent = JSON.stringify({ result, ...details }, null, 2);
}

function Harness() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      let silentBlankSamples = 0;
      let expandedSilentBlankSamples = 0;
      let sampleTimer;
      let expandedSampleTimer;

      try {
        const root = await waitUntil(
          () => document.querySelector('[data-order-item-preview="true"]'),
          5_000,
          'order item preview never mounted',
        );

        sampleTimer = window.setInterval(() => {
          const frame = root.querySelector('[data-commerce-preview="true"]');
          const hasPainted = paintedImages(root).length > 0;
          const hasLoadingState = Boolean(root.querySelector('[data-preview-loading-overlay="true"]'));
          const hasFailureState = frame?.dataset.previewFailed === 'true';
          if (!hasPainted && !hasLoadingState && !hasFailureState) silentBlankSamples += 1;
        }, 16);

        const smallFrame = await waitUntil(() => {
          const frame = root.querySelector('[data-commerce-preview="true"]');
          return frame?.dataset.previewReady === 'true' && paintedImages(root).length > 0
            ? frame
            : null;
        }, 12_000, 'order thumbnail never became ready');
        window.clearInterval(sampleTimer);

        const smallSource = visibleSource(root);
        if (!smallSource.includes('order-surface-good')) {
          throw new Error(`order thumbnail did not recover through fallback: ${smallSource}`);
        }
        if (silentBlankSamples !== 0) {
          throw new Error(`order thumbnail had ${silentBlankSamples} silent blank samples`);
        }

        const openButton = root.querySelector('button[aria-label="Open order surface expanded preview"]');
        if (!(openButton instanceof HTMLButtonElement)) {
          throw new Error('expanded order preview button is missing');
        }
        openButton.click();

        const dialog = await waitUntil(
          () => document.querySelector('[data-expanded-product-preview="true"]'),
          5_000,
          'expanded order preview never opened',
        );
        const expandedRoot = await waitUntil(
          () => document.querySelector('[data-order-item-expanded-preview="true"]'),
          5_000,
          'expanded order preview content never mounted',
        );

        expandedSampleTimer = window.setInterval(() => {
          const frame = expandedRoot.querySelector('[data-commerce-preview="true"]');
          const hasPainted = paintedImages(expandedRoot).length > 0;
          const hasLoadingState = Boolean(expandedRoot.querySelector('[data-preview-loading-overlay="true"]'));
          const hasFailureState = frame?.dataset.previewFailed === 'true';
          if (!hasPainted && !hasLoadingState && !hasFailureState) expandedSilentBlankSamples += 1;
        }, 16);

        const expandedFrame = await waitUntil(() => {
          const frame = expandedRoot.querySelector('[data-commerce-preview="true"]');
          return frame?.dataset.previewReady === 'true' && paintedImages(expandedRoot).length > 0
            ? frame
            : null;
        }, 12_000, 'expanded order preview never became ready');
        await delay(350);
        window.clearInterval(expandedSampleTimer);

        const expandedSource = visibleSource(expandedRoot);
        if (!expandedSource.includes('order-surface-good')) {
          throw new Error(`expanded order preview drifted to another source: ${expandedSource}`);
        }
        if (expandedSilentBlankSamples !== 0) {
          throw new Error(`expanded order preview had ${expandedSilentBlankSamples} silent blank samples`);
        }

        const viewport = {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        };
        const smallRect = rect(smallFrame);
        const expandedRect = rect(expandedFrame);
        const panel = dialog.querySelector(':scope > div.relative');
        const panelRect = rect(panel);
        const closeButton = dialog.querySelector('button[aria-label="Close preview"]:not(.absolute.inset-0)');
        const closeRect = rect(closeButton);
        const geometryPassed = Boolean(
          smallRect
          && expandedRect
          && panelRect
          && closeRect
          && smallRect.width > 0
          && smallRect.height > 0
          && expandedRect.width > 0
          && expandedRect.height > 0
          && panelRect.x >= -1
          && panelRect.y >= -1
          && panelRect.right <= viewport.width + 1
          && panelRect.bottom <= viewport.height + 1
          && expandedRect.x >= -1
          && expandedRect.right <= viewport.width + 1
          && closeRect.x >= -1
          && closeRect.y >= -1
          && closeRect.right <= viewport.width + 1
          && closeRect.bottom <= viewport.height + 1
        );
        if (!geometryPassed) throw new Error('order preview lightbox geometry failed');

        if (!cancelled) {
          finish('pass', {
            stage: 'complete',
            smallSource,
            expandedSource,
            silentBlankSamples,
            expandedSilentBlankSamples,
            smallRect,
            expandedRect,
            panelRect,
            closeRect,
            viewport,
          });
        }
      } catch (error) {
        if (!cancelled) {
          finish('fail', {
            stage: 'order-surface-preview',
            reason: error instanceof Error ? error.message : String(error),
            silentBlankSamples,
            expandedSilentBlankSamples,
          });
        }
      } finally {
        window.clearInterval(sampleTimer);
        window.clearInterval(expandedSampleTimer);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: 20 }}>
      <OrderItemPreview
        item={item}
        compactMaxSize={200}
        expandedMaxSize={820}
        ariaLabel="Open order surface expanded preview"
        title="48 × 24 Banner"
      />
    </main>
  );
}

createRoot(document.getElementById('order-surface-preview-root')).render(<Harness />);
