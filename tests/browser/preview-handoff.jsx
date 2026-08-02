import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import ArtworkPreviewEditor from '@/components/design/ArtworkPreviewEditor';

const localSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
    <rect width="1200" height="600" fill="#18448D"/>
    <circle cx="260" cy="300" r="160" fill="#FF6A00"/>
    <text x="510" y="330" font-family="Arial, sans-serif" font-size="96" font-weight="700" fill="white">LOCAL PREVIEW</text>
  </svg>
`;

const localBlobUrl = URL.createObjectURL(new Blob([localSvg], { type: 'image/svg+xml' }));
const permanentUrl = `${window.location.origin}/images/header-logo.png?preview-handoff-test=1`;

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

function getArtworkImages(root) {
  return Array.from(root.querySelectorAll('img[alt="Preview handoff browser test"]'));
}

function getPaintedImages(root) {
  return getArtworkImages(root).filter(isPaintedImage);
}

function finish(result, details) {
  document.body.dataset.previewHandoffResult = result;
  document.body.dataset.blankSamples = String(details.blankSamples ?? -1);
  document.body.dataset.busySamples = String(details.busySamples ?? -1);
  document.body.dataset.sourceChanges = String(details.sourceChanges ?? -1);
  document.body.dataset.imageCountChanges = String(details.imageCountChanges ?? -1);
  document.body.dataset.initialSource = details.initialSource || '';
  document.body.dataset.finalSource = details.finalSource || '';
  const output = document.getElementById('preview-handoff-output');
  if (output) output.textContent = JSON.stringify({ result, ...details }, null, 2);
  window.__PREVIEW_HANDOFF_RESULT__ = { result, ...details };
}

function waitForDeferredStart() {
  if (new URLSearchParams(window.location.search).get('deferStart') !== '1') {
    return Promise.resolve();
  }

  document.body.dataset.previewHandoffReady = 'true';
  return new Promise((resolve) => {
    window.__START_PREVIEW_HANDOFF__ = () => {
      delete window.__START_PREVIEW_HANDOFF__;
      document.body.dataset.previewHandoffReady = 'started';
      resolve();
    };
  });
}

function PreviewHandoffHarness() {
  const [source, setSource] = useState(localBlobUrl);
  const [productionUrl, setProductionUrl] = useState(undefined);
  const [transform, setTransform] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1 });

  useEffect(() => {
    const root = document.getElementById('preview-handoff-root');
    if (!root) {
      finish('fail', { reason: 'missing-root' });
      return undefined;
    }

    let waitTimer;
    let sampleTimer;
    let finishTimer;
    let disposed = false;
    const startedAt = Date.now();

    waitTimer = window.setInterval(async () => {
      const painted = getPaintedImages(root);
      const canvas = root.querySelector('[aria-busy]');
      if (painted.length !== 1 || canvas?.getAttribute('aria-busy') === 'true') {
        if (Date.now() - startedAt > 7_000) {
          window.clearInterval(waitTimer);
          finish('fail', {
            reason: 'initial-local-preview-never-painted',
            artworkImageCount: getArtworkImages(root).length,
            paintedImageCount: painted.length,
          });
        }
        return;
      }

      window.clearInterval(waitTimer);
      await waitForDeferredStart();
      if (disposed) return;
      const initialSource = painted[0].src;
      let lastSource = initialSource;
      let lastImageCount = getArtworkImages(root).length;
      let blankSamples = 0;
      let busySamples = 0;
      let sourceChanges = 0;
      let imageCountChanges = 0;
      let totalSamples = 0;
      const blankSnapshots = [];

      // Reproduce the real upload sequence: a blob image is already painted,
      // then the parent receives the permanent Cloudinary-style URL.
      setSource(permanentUrl);
      setProductionUrl(permanentUrl);

      sampleTimer = window.setInterval(() => {
        totalSamples += 1;
        const artworkImages = getArtworkImages(root);
        const visibleImages = artworkImages.filter(isPaintedImage);
        const currentCanvas = root.querySelector('[aria-busy]');
        const currentImageCount = artworkImages.length;

        if (currentImageCount !== lastImageCount) {
          imageCountChanges += 1;
          lastImageCount = currentImageCount;
        }

        if (visibleImages.length === 0) {
          blankSamples += 1;
          if (blankSnapshots.length < 4) {
            blankSnapshots.push({
              sample: totalSamples,
              canvasBusy: currentCanvas?.getAttribute('aria-busy') || null,
              images: artworkImages.map((image) => ({
                src: image.src,
                complete: image.complete,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                display: window.getComputedStyle(image).display,
                visibility: window.getComputedStyle(image).visibility,
                opacity: window.getComputedStyle(image).opacity,
                rect: image.getBoundingClientRect().toJSON(),
              })),
            });
          }
        }
        if (currentCanvas?.getAttribute('aria-busy') === 'true') busySamples += 1;

        const currentSource = visibleImages[0]?.src || '';
        if (currentSource && currentSource !== lastSource) {
          sourceChanges += 1;
          lastSource = currentSource;
        }
      }, 16);

      finishTimer = window.setTimeout(() => {
        window.clearInterval(sampleTimer);
        const finalImages = getPaintedImages(root);
        const finalSource = finalImages[0]?.src || '';
        const passed = Boolean(
          initialSource.startsWith('blob:')
          && finalSource.startsWith('blob:')
          && finalImages.length === 1
          && blankSamples === 0
          && busySamples === 0
          && sourceChanges === 0
          && imageCountChanges === 0
        );

        finish(passed ? 'pass' : 'fail', {
          initialSource,
          finalSource,
          blankSamples,
          busySamples,
          sourceChanges,
          imageCountChanges,
          totalSamples,
          blankSnapshots,
        });
      }, 2_000);
    }, 25);

    return () => {
      disposed = true;
      delete window.__START_PREVIEW_HANDOFF__;
      window.clearInterval(waitTimer);
      window.clearInterval(sampleTimer);
      window.clearTimeout(finishTimer);
    };
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto' }}>
      <ArtworkPreviewEditor
        src={source}
        previewUrl={source}
        productionUrl={productionUrl}
        resourceType="image"
        mimeType="image/svg+xml"
        alt="Preview handoff browser test"
        paddingPct="50%"
        value={transform}
        onChange={setTransform}
        constrain
        onConstrainChange={() => {}}
        autoSelect={false}
        showDragHint={false}
        canvasStyle={{
          backgroundColor: '#fff',
          border: '1px solid #94a3b8',
          borderRadius: 4,
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('preview-handoff-root')).render(<PreviewHandoffHarness />);
