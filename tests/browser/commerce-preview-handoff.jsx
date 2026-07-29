import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BannerPreview from '@/components/cart/BannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/ThumbnailPreviewWrapper';

const localSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
    <rect width="1200" height="600" fill="#18448D"/>
    <path d="M0 420 L390 100 L780 420 L1200 80 L1200 600 L0 600 Z" fill="#FF6A00"/>
    <text x="600" y="335" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="700" fill="white">COMMERCE PREVIEW</text>
  </svg>
`;

const localBlobUrl = URL.createObjectURL(new Blob([localSvg], { type: 'image/svg+xml' }));
const permanentUrl = `${window.location.origin}/images/header-logo.png?commerce-preview-handoff=1`;

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
  const permanent = images.find((image) => image.src.includes('header-logo.png'));
  return (permanent || images[images.length - 1])?.src || '';
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

function finish(result, details) {
  document.body.dataset.previewHandoffResult = result;
  const output = document.getElementById('preview-handoff-output');
  if (output) output.textContent = JSON.stringify({ result, ...details }, null, 2);
  window.__PREVIEW_HANDOFF_RESULT__ = { result, ...details };
}

function CommercePreviewHarness() {
  const [source, setSource] = useState(localBlobUrl);

  useEffect(() => {
    const thumbnailRoot = document.querySelector('[data-commerce-thumbnail]');
    if (!thumbnailRoot) {
      finish('fail', { reason: 'missing-thumbnail-root' });
      return undefined;
    }

    let initialWait;
    let handoffSampler;
    let handoffFinish;
    let lightboxWait;
    let lightboxSampler;
    let lightboxFinish;
    const startedAt = Date.now();

    initialWait = window.setInterval(() => {
      const painted = getPaintedImages(thumbnailRoot);
      const frame = getPreviewFrame(thumbnailRoot);
      if (painted.length === 0 || frame?.getAttribute('aria-busy') === 'true') {
        if (Date.now() - startedAt > 7_000) {
          window.clearInterval(initialWait);
          finish('fail', {
            reason: 'initial-thumbnail-never-painted',
            paintedCount: painted.length,
            busy: frame?.getAttribute('aria-busy') || null,
          });
        }
        return;
      }

      window.clearInterval(initialWait);
      const initialSource = pickVisibleSource(painted);
      let lastSource = initialSource;
      let blankSamples = 0;
      let busyWithoutImageSamples = 0;
      let sourceChanges = 0;
      let totalSamples = 0;
      const blankSnapshots = [];

      setSource(permanentUrl);

      handoffSampler = window.setInterval(() => {
        totalSamples += 1;
        const visible = getPaintedImages(thumbnailRoot);
        const currentFrame = getPreviewFrame(thumbnailRoot);
        if (visible.length === 0) {
          blankSamples += 1;
          if (blankSnapshots.length < 4) {
            blankSnapshots.push({
              sample: totalSamples,
              busy: currentFrame?.getAttribute('aria-busy') || null,
              html: thumbnailRoot.innerHTML,
            });
          }
        }
        if (visible.length === 0 && currentFrame?.getAttribute('aria-busy') === 'true') {
          busyWithoutImageSamples += 1;
        }

        const currentSource = pickVisibleSource(visible);
        if (currentSource && currentSource !== lastSource) {
          sourceChanges += 1;
          lastSource = currentSource;
        }
      }, 16);

      handoffFinish = window.setTimeout(() => {
        window.clearInterval(handoffSampler);
        const finalThumbnailImages = getPaintedImages(thumbnailRoot);
        const finalThumbnailSource = pickVisibleSource(finalThumbnailImages);
        const thumbnailPassed = Boolean(
          initialSource.startsWith('blob:')
          && finalThumbnailImages.length > 0
          && finalThumbnailSource.includes('header-logo.png')
          && blankSamples === 0
          && busyWithoutImageSamples === 0
          && sourceChanges <= 1
        );

        if (!thumbnailPassed) {
          finish('fail', {
            stage: 'thumbnail-handoff',
            initialSource,
            finalThumbnailSource,
            blankSamples,
            busyWithoutImageSamples,
            sourceChanges,
            totalSamples,
            blankSnapshots,
          });
          return;
        }

        const openButton = thumbnailRoot.querySelector('button[aria-label="Open enlarged commerce preview"]');
        if (!(openButton instanceof HTMLButtonElement)) {
          finish('fail', { stage: 'lightbox-open', reason: 'missing-open-button' });
          return;
        }

        openButton.click();
        const lightboxStartedAt = Date.now();
        let lightboxBlankSamples = 0;
        let lightboxBusyWithoutImageSamples = 0;
        let lightboxTotalSamples = 0;
        let dialogSeen = false;

        lightboxSampler = window.setInterval(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const largeRoot = document.querySelector('[data-commerce-large]');
          if (!dialog || !largeRoot) return;
          dialogSeen = true;
          lightboxTotalSamples += 1;
          const visible = getPaintedImages(largeRoot);
          const frame = getPreviewFrame(largeRoot);
          if (visible.length === 0) lightboxBlankSamples += 1;
          if (visible.length === 0 && frame?.getAttribute('aria-busy') === 'true') {
            lightboxBusyWithoutImageSamples += 1;
          }
        }, 16);

        lightboxWait = window.setInterval(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const largeRoot = document.querySelector('[data-commerce-large]');
          const visible = getPaintedImages(largeRoot);
          const frame = getPreviewFrame(largeRoot);
          if (dialog && largeRoot && visible.length > 0 && frame?.getAttribute('aria-busy') !== 'true') {
            window.clearInterval(lightboxWait);
            lightboxFinish = window.setTimeout(() => {
              window.clearInterval(lightboxSampler);
              const panel = dialog.querySelector(':scope > div.relative');
              const finalLargeImages = getPaintedImages(largeRoot);
              const finalLargeSource = pickVisibleSource(finalLargeImages);
              const panelRect = rectDetails(panel);
              const previewRect = rectDetails(frame);
              const closeButton = dialog.querySelector('button[aria-label="Close preview"]:not(.absolute.inset-0)');
              const closeRect = rectDetails(closeButton);
              // documentElement.clientWidth/clientHeight are the CSS layout
              // viewport used by media queries and vw/vh sizing. Chrome mobile
              // emulation can report a wider legacy window.innerWidth even while
              // the actual CSS viewport is correctly 390px.
              const viewport = {
                width: document.documentElement.clientWidth || window.visualViewport?.width || window.innerWidth,
                height: document.documentElement.clientHeight || window.visualViewport?.height || window.innerHeight,
                reportedInnerWidth: window.innerWidth,
                reportedInnerHeight: window.innerHeight,
              };
              const geometryPassed = Boolean(
                panelRect
                && previewRect
                && closeRect
                && panelRect.width > 0
                && panelRect.height > 0
                && panelRect.width <= viewport.width + 1
                && panelRect.height <= viewport.height + 1
                && previewRect.width > 0
                && previewRect.height > 0
                && previewRect.right <= viewport.width + 1
                && closeRect.x >= -1
                && closeRect.y >= -1
                && closeRect.right <= viewport.width + 1
              );
              const lightboxPassed = Boolean(
                dialogSeen
                && finalLargeImages.length > 0
                && finalLargeSource.includes('header-logo.png')
                && lightboxBlankSamples === 0
                && lightboxBusyWithoutImageSamples === 0
                && geometryPassed
              );

              finish(lightboxPassed ? 'pass' : 'fail', {
                stage: lightboxPassed ? 'complete' : 'lightbox',
                thumbnail: {
                  initialSource,
                  finalSource: finalThumbnailSource,
                  blankSamples,
                  busyWithoutImageSamples,
                  sourceChanges,
                  totalSamples,
                },
                lightbox: {
                  finalSource: finalLargeSource,
                  blankSamples: lightboxBlankSamples,
                  busyWithoutImageSamples: lightboxBusyWithoutImageSamples,
                  totalSamples: lightboxTotalSamples,
                  dialogSeen,
                  geometryPassed,
                  panelRect,
                  previewRect,
                  closeRect,
                  viewport,
                },
              });
            }, 650);
            return;
          }

          if (Date.now() - lightboxStartedAt > 7_000) {
            window.clearInterval(lightboxWait);
            window.clearInterval(lightboxSampler);
            finish('fail', {
              stage: 'lightbox-timeout',
              dialogSeen,
              paintedCount: visible.length,
              busy: frame?.getAttribute('aria-busy') || null,
              lightboxBlankSamples,
            });
          }
        }, 25);
      }, 2_000);
    }, 25);

    return () => {
      window.clearInterval(initialWait);
      window.clearInterval(handoffSampler);
      window.clearTimeout(handoffFinish);
      window.clearInterval(lightboxWait);
      window.clearInterval(lightboxSampler);
      window.clearTimeout(lightboxFinish);
    };
  }, []);

  return (
    <div data-commerce-thumbnail style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
      <ThumbnailPreviewWrapper
        ariaLabel="Open enlarged commerce preview"
        title="48 × 24 Banner"
        widthIn={48}
        heightIn={24}
        details={[
          { label: 'Size', value: '48 × 24 in' },
          { label: 'Material', value: '13oz Vinyl' },
        ]}
        renderLargePreview={() => (
          <div data-commerce-large>
            <BannerPreview
              widthIn={48}
              heightIn={24}
              grommets="4-corners"
              imageUrl={source}
              isFinalizedSnapshot
              maxSize={820}
            />
          </div>
        )}
      >
        <BannerPreview
          widthIn={48}
          heightIn={24}
          grommets="4-corners"
          imageUrl={source}
          isFinalizedSnapshot
          maxSize={200}
        />
      </ThumbnailPreviewWrapper>
    </div>
  );
}

createRoot(document.getElementById('commerce-preview-root')).render(<CommercePreviewHarness />);
