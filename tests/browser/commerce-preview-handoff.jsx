import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import BannerPreview from '@/components/cart/BannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/ThumbnailPreviewWrapper';
import {
  getExpandedPreviewSelection,
  getSmallPreviewUrl,
} from '@/lib/previewSelection';
import {
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
} from '@/lib/previewLifecycle';

const localSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
    <rect width="1200" height="600" fill="#18448D"/>
    <path d="M0 420 L390 100 L780 420 L1200 80 L1200 600 L0 600 Z" fill="#FF6A00"/>
    <text x="600" y="335" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="700" fill="white">COMMERCE PREVIEW</text>
  </svg>
`;

const localBlobUrl = URL.createObjectURL(new Blob([localSvg], { type: 'image/svg+xml' }));
const localImage = (marker) => `${window.location.origin}/images/header-logo.png?commerce-preview=${marker}`;

function readyPlacement(marker, widthIn, heightIn, productType = 'banner') {
  const previewUrl = localImage(marker);
  const spec = {
    version: PREVIEW_ARTIFACT_VERSION,
    sourceIdentity: `browser-harness-${marker}@1@1`,
    sourceUrl: localImage(`original-${marker}`),
    productType,
    widthIn,
    heightIn,
    fitMode: 'fit',
    transform: { xPct: 0, yPct: 0, scaleX: 1, scaleY: 1 },
    revision: 1,
  };
  return {
    version: PREVIEW_ARTIFACT_VERSION,
    sourceIdentity: spec.sourceIdentity,
    sourceUrl: spec.sourceUrl,
    productType,
    widthIn,
    heightIn,
    fitMode: spec.fitMode,
    positionPct: { x: 0, y: 0 },
    scaleX: 1,
    scaleY: 1,
    compositionRevision: 1,
    compositionSignature: buildCompositionSignature(spec),
    url: previewUrl,
    publicId: `browser-harness-${marker}`,
    previewUrl,
    previewPublicId: `browser-harness-${marker}`,
    previewWidthPx: 1200,
    previewHeightPx: Math.max(1, Math.round(1200 * heightIn / widthIn)),
    uploadStatus: 'uploaded',
    createdAt: '2026-08-02T00:00:00.000Z',
    uploadedAt: '2026-08-02T00:00:00.000Z',
    error: null,
  };
}

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

function getPaintedImages(scope) {
  if (!scope) return [];
  return Array.from(scope.querySelectorAll('img[data-preview-image-state]')).filter(isPaintedImage);
}

function getPreviewFrame(scope) {
  return scope?.querySelector('[aria-label="Banner preview"]') || null;
}

function pickVisibleSource(images) {
  return images.find((image) => image.dataset.previewImageState === 'ready')?.src
    || images.find((image) => image.dataset.previewImageState === 'target')?.src
    || images[images.length - 1]?.src
    || '';
}

function rectDetails(node) {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function hasExpectedRatio(rect, widthIn, heightIn) {
  if (!rect || rect.width <= 0 || rect.height <= 0 || widthIn <= 0 || heightIn <= 0) return false;
  const expected = widthIn / heightIn;
  const actual = rect.width / rect.height;
  const tolerance = Math.max(0.02, expected * 0.015);
  return Math.abs(actual - expected) <= tolerance;
}

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function waitUntil(predicate, timeoutMs, reason) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await delay(25);
  }
  throw new Error(reason);
}

function finish(result, details) {
  document.body.dataset.previewHandoffResult = result;
  const output = document.getElementById('preview-handoff-output');
  if (output) output.textContent = JSON.stringify({ result, ...details }, null, 2);
  window.__PREVIEW_HANDOFF_RESULT__ = { result, ...details };
}

function PreviewCard({ testCase, sourceOverride }) {
  const smallUrl = getSmallPreviewUrl(testCase.item);
  const expanded = getExpandedPreviewSelection(testCase.item);
  const imageUrl = sourceOverride || smallUrl;
  const largeUrl = sourceOverride || expanded.url;

  return (
    <div
      data-commerce-thumbnail
      data-preview-id={testCase.id}
      data-expected-marker={testCase.expectedMarker}
      style={{ minWidth: 0, padding: 8 }}
    >
      <ThumbnailPreviewWrapper
        ariaLabel={`Open enlarged commerce preview ${testCase.id}`}
        title={testCase.title}
        widthIn={testCase.widthIn}
        heightIn={testCase.heightIn}
        renderLargePreview={() => (
          <div data-commerce-large data-preview-id={testCase.id}>
            <BannerPreview
              widthIn={testCase.widthIn}
              heightIn={testCase.heightIn}
              grommets={testCase.grommets || '4-corners'}
              imageUrl={largeUrl}
              imagePosition={testCase.imagePosition || { x: 0, y: 0 }}
              imageScale={testCase.imageScale || 1}
              isFinalizedSnapshot={testCase.exact !== false}
              maxSize={820}
            />
          </div>
        )}
      >
        <BannerPreview
          widthIn={testCase.widthIn}
          heightIn={testCase.heightIn}
          grommets={testCase.grommets || '4-corners'}
          imageUrl={imageUrl}
          imagePosition={testCase.imagePosition || { x: 0, y: 0 }}
          imageScale={testCase.imageScale || 1}
          isFinalizedSnapshot={testCase.exact !== false}
          maxSize={200}
        />
      </ThumbnailPreviewWrapper>
    </div>
  );
}

function CommercePreviewHarness() {
  const [handoffSource, setHandoffSource] = useState(localBlobUrl);

  const cases = useMemo(() => [
    {
      id: 'handoff-landscape',
      title: '48 × 24 Banner',
      widthIn: 48,
      heightIn: 24,
      expectedMarker: 'handoff-permanent',
      item: { placement_preview: readyPlacement('handoff-permanent', 48, 24) },
    },
    {
      id: 'portrait',
      title: '24 × 72 Portrait Banner',
      widthIn: 24,
      heightIn: 72,
      expectedMarker: 'portrait',
      item: { placement_preview: readyPlacement('portrait', 24, 72) },
    },
    {
      id: 'square',
      title: '24 × 24 Square Sign',
      widthIn: 24,
      heightIn: 24,
      expectedMarker: 'square',
      item: { final_render_url: localImage('square') },
    },
    {
      id: 'extreme-wide',
      title: '120 × 12 Wide Banner',
      widthIn: 120,
      heightIn: 12,
      expectedMarker: 'extreme-wide',
      item: { web_preview_url: localImage('extreme-wide') },
    },
    {
      id: 'fallback-chain',
      title: 'Fallback Preview',
      widthIn: 48,
      heightIn: 24,
      expectedMarker: 'fallback-good',
      exact: false,
      item: {
        web_preview_url: `${window.location.origin}/images/does-not-exist.png?bad-primary=1`,
        thumbnail_url: localImage('fallback-good'),
        file_url: localImage('fallback-original'),
      },
    },
    {
      id: 'yard-sign-identity',
      title: '24 × 18 Yard Sign',
      widthIn: 24,
      heightIn: 18,
      expectedMarker: 'yard-sign-first',
      item: {
        product_type: 'yard_sign',
        placement_preview: readyPlacement('yard-sign-first', 24, 18, 'yard_sign'),
        yard_sign_designs: [
          {
            previewThumbnailUrl: localImage('yard-sign-first'),
            fileUrl: localImage('yard-sign-original'),
          },
          {
            previewThumbnailUrl: localImage('yard-sign-second'),
            fileUrl: localImage('yard-sign-second-original'),
          },
        ],
        thumbnail_url: localImage('wrong-item-thumbnail'),
      },
    },
  ], []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const results = [];
      try {
        const roots = await waitUntil(() => {
          const values = Array.from(document.querySelectorAll('[data-commerce-thumbnail]'));
          return values.length === cases.length ? values : null;
        }, 7_000, 'commerce preview cards never mounted');

        await waitUntil(() => roots.every((root) => {
          const frame = getPreviewFrame(root);
          return getPaintedImages(root).length > 0
            && frame?.getAttribute('aria-busy') !== 'true'
            && frame?.dataset.previewReady === 'true';
        }), 12_000, 'one or more commerce thumbnails never painted');

        // Exercise the real local-to-permanent handoff while sampling every
        // animation frame. A decoded image must remain visible throughout.
        const handoffRoot = roots.find((root) => root.dataset.previewId === 'handoff-landscape');
        const warmedHandoff = new Image();
        warmedHandoff.src = localImage('handoff-permanent');
        await warmedHandoff.decode();
        let blankSamples = 0;
        let sourceChanges = 0;
        let lastSource = pickVisibleSource(getPaintedImages(handoffRoot));
        const sampler = window.setInterval(() => {
          const visible = getPaintedImages(handoffRoot);
          if (visible.length === 0) blankSamples += 1;
          const source = pickVisibleSource(visible);
          if (source && source !== lastSource) {
            sourceChanges += 1;
            lastSource = source;
          }
        }, 16);
        setHandoffSource(localImage('handoff-permanent'));
        await delay(1_200);
        window.clearInterval(sampler);

        if (blankSamples !== 0 || !lastSource.includes('handoff-permanent')) {
          throw new Error(`thumbnail handoff failed: blank=${blankSamples}, source=${lastSource}`);
        }

        for (const root of roots) {
          if (cancelled) return;
          const id = root.dataset.previewId;
          const expectedMarker = root.dataset.expectedMarker;
          const testCase = cases.find((candidate) => candidate.id === id);
          if (!testCase) throw new Error(`missing test configuration for ${id}`);

          const frame = getPreviewFrame(root);
          const smallImages = getPaintedImages(root);
          const smallSource = pickVisibleSource(smallImages);
          const frameRect = rectDetails(frame);
          const viewportWidth = document.documentElement.clientWidth;

          if (!smallSource.includes(expectedMarker)) {
            throw new Error(`${id} thumbnail selected the wrong artwork: ${smallSource}`);
          }
          if (!frameRect || frameRect.width <= 0 || frameRect.height <= 0 || frameRect.right > viewportWidth + 1) {
            throw new Error(`${id} thumbnail geometry overflowed the viewport`);
          }
          if (!hasExpectedRatio(frameRect, testCase.widthIn, testCase.heightIn)) {
            throw new Error(`${id} thumbnail ratio was ${frameRect.width / frameRect.height}; expected ${testCase.widthIn / testCase.heightIn}`);
          }

          const openButton = root.querySelector(`button[aria-label="Open enlarged commerce preview ${id}"]`);
          if (!(openButton instanceof HTMLButtonElement)) {
            throw new Error(`${id} has no enlarged-preview button`);
          }
          openButton.click();

          const dialog = await waitUntil(
            () => document.querySelector('[data-expanded-product-preview="true"]'),
            5_000,
            `${id} lightbox never opened`,
          );
          const largeRoot = await waitUntil(
            () => document.querySelector(`[data-commerce-large][data-preview-id="${id}"]`),
            5_000,
            `${id} enlarged preview never mounted`,
          );
          await waitUntil(() => {
            const largeFrame = getPreviewFrame(largeRoot);
            return getPaintedImages(largeRoot).length > 0
              && largeFrame?.getAttribute('aria-busy') !== 'true'
              && largeFrame?.dataset.previewReady === 'true';
          }, 10_000, `${id} enlarged preview never painted`);

          const largeFrame = getPreviewFrame(largeRoot);
          const largeSource = pickVisibleSource(getPaintedImages(largeRoot));
          const panel = dialog.querySelector(':scope > div.relative');
          const panelRect = rectDetails(panel);
          const largeRect = rectDetails(largeFrame);
          const closeButton = dialog.querySelector('button[aria-label="Close preview"]:not(.absolute.inset-0)');
          const closeRect = rectDetails(closeButton);
          const viewport = {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          };

          if (!largeSource.includes(expectedMarker)) {
            throw new Error(`${id} expanded preview drifted to another artwork: ${largeSource}`);
          }
          if (!hasExpectedRatio(largeRect, testCase.widthIn, testCase.heightIn)) {
            throw new Error(`${id} expanded ratio was ${largeRect.width / largeRect.height}; expected ${testCase.widthIn / testCase.heightIn}`);
          }

          const geometryPassed = Boolean(
            panelRect
            && largeRect
            && closeRect
            && panelRect.width > 0
            && panelRect.height > 0
            && panelRect.x >= -1
            && panelRect.y >= -1
            && panelRect.right <= viewport.width + 1
            && panelRect.bottom <= viewport.height + 1
            && largeRect.width > 0
            && largeRect.height > 0
            && largeRect.x >= -1
            && largeRect.right <= viewport.width + 1
            && closeRect.x >= -1
            && closeRect.y >= -1
            && closeRect.right <= viewport.width + 1
            && closeRect.bottom <= viewport.height + 1,
          );
          if (!geometryPassed) throw new Error(`${id} lightbox geometry failed`);

          results.push({
            id,
            smallSource,
            largeSource,
            frameRect,
            largeRect,
            panelRect,
            viewport,
            expectedRatio: testCase.widthIn / testCase.heightIn,
          });

          closeButton.click();
          await waitUntil(
            () => !document.querySelector('[data-expanded-product-preview="true"]'),
            3_000,
            `${id} lightbox did not close`,
          );
          // Let the lightbox effect restore body/html overflow before the CDP
          // runner records the final viewport. This catches a real scroll-lock
          // leak without treating a normal desktop scrollbar as bad emulation.
          await delay(75);
        }

        if (!cancelled) {
          finish('pass', {
            stage: 'complete',
            blankSamples,
            sourceChanges,
            cases: results,
          });
        }
      } catch (error) {
        if (!cancelled) {
          finish('fail', {
            stage: 'commerce-preview-matrix',
            reason: error instanceof Error ? error.message : String(error),
            cases: results,
          });
        }
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [cases]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        gap: 12,
        width: '100%',
        maxWidth: 1100,
        margin: '0 auto',
        padding: 12,
      }}
    >
      {cases.map((testCase) => (
        <PreviewCard
          key={testCase.id}
          testCase={testCase}
          sourceOverride={testCase.id === 'handoff-landscape' ? handoffSource : undefined}
        />
      ))}
    </div>
  );
}

createRoot(document.getElementById('commerce-preview-root')).render(<CommercePreviewHarness />);
