import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import UpsellModal from '@/components/cart/UpsellModal';

const approvedComposition = (() => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1500" height="600" viewBox="0 0 1500 600">
      <rect width="1500" height="600" fill="#0b2748"/>
      <rect x="0" y="0" width="380" height="600" fill="#3c4b59"/>
      <rect x="390" y="0" width="760" height="600" fill="#f8fafc"/>
      <path d="M1120 0h380v600h-500z" fill="#f97316"/>
      <text x="520" y="270" font-family="Arial,sans-serif" font-size="96" font-weight="700" fill="#102a4c">CAR MAGNETS</text>
      <text x="520" y="360" font-family="Arial,sans-serif" font-size="46" font-weight="700" fill="#f97316">UPSELL-APPROVED-COMPOSITION</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

const quote = {
  widthIn: 120,
  heightIn: 48,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  polePockets: 'none',
  polePocketSize: '2',
  addRope: false,
  ropePlacement: 'all-edges',
  thumbnailUrl: approvedComposition,
  file: {
    name: 'car_magnets.png',
    url: `${window.location.origin}/images/header-logo.png?raw-original-must-not-win=1`,
  },
  imagePosition: { x: 0, y: 0 },
  imageScale: 1.40625,
  imageScaleY: 1.40625,
  fitMode: 'fill',
};

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

function paintedImages(scope) {
  return Array.from(scope?.querySelectorAll('img[data-preview-image-state]') || []).filter((image) => {
    if (!(image instanceof HTMLImageElement)) return false;
    const style = window.getComputedStyle(image);
    const rect = image.getBoundingClientRect();
    return image.complete
      && image.naturalWidth > 0
      && image.naturalHeight > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number.parseFloat(style.opacity || '1') > 0.01
      && rect.width > 0
      && rect.height > 0;
  });
}

function visibleSource(scope) {
  const images = paintedImages(scope);
  return images.find((image) => image.dataset.previewImageState === 'ready')?.src
    || images.find((image) => image.dataset.previewImageState === 'target')?.src
    || images.at(-1)?.src
    || '';
}

function decodedSource(source) {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
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
      let smallSilentBlankSamples = 0;
      let expandedSilentBlankSamples = 0;
      let smallSampler;
      let expandedSampler;

      try {
        const modal = await waitUntil(
          () => document.querySelector('[data-upsell-modal]'),
          5_000,
          'Upsell modal never mounted',
        );
        const smallFrame = await waitUntil(
          () => modal.querySelector('[data-commerce-preview="true"]'),
          5_000,
          'Upsell thumbnail frame never mounted',
        );

        smallSampler = window.setInterval(() => {
          const ready = smallFrame.dataset.previewReady === 'true';
          const loading = Boolean(modal.querySelector('[data-preview-loading-overlay="true"]'));
          const failed = smallFrame.dataset.previewFailed === 'true';
          if (!paintedImages(modal).length && !loading && !failed && !ready) {
            smallSilentBlankSamples += 1;
          }
        }, 16);

        await waitUntil(
          () => smallFrame.dataset.previewReady === 'true' && paintedImages(modal).length > 0,
          12_000,
          'Upsell thumbnail never became ready',
        );
        await delay(250);
        window.clearInterval(smallSampler);

        const smallSource = visibleSource(modal);
        const smallRect = rect(smallFrame);
        if (!decodedSource(smallSource).includes('UPSELL-APPROVED-COMPOSITION')) {
          throw new Error(`Upsell used the wrong source: ${smallSource}`);
        }
        if (smallSource.includes('raw-original-must-not-win')) {
          throw new Error('Upsell allowed the raw original to replace the approved composition');
        }
        if (smallFrame.dataset.previewTransformMode !== 'exact-snapshot') {
          throw new Error(`Upsell thumbnail transform mode was ${smallFrame.dataset.previewTransformMode}`);
        }
        if (!smallRect || Math.abs((smallRect.width / smallRect.height) - 2.5) > 0.04) {
          throw new Error('Upsell thumbnail did not preserve the 120×48 ratio');
        }
        if (smallSilentBlankSamples !== 0) {
          throw new Error(`Upsell thumbnail had ${smallSilentBlankSamples} silent blank samples`);
        }

        const openButton = modal.querySelector('button[aria-label="Enlarge preview"]');
        if (!(openButton instanceof HTMLButtonElement)) {
          throw new Error('Upsell enlarged-preview button is missing');
        }
        openButton.click();

        const dialog = await waitUntil(
          () => document.querySelector('[data-expanded-product-preview="true"]'),
          5_000,
          'Upsell expanded preview never opened',
        );
        const expandedFrame = await waitUntil(
          () => dialog.querySelector('[data-commerce-preview="true"]'),
          5_000,
          'Upsell expanded frame never mounted',
        );

        expandedSampler = window.setInterval(() => {
          const ready = expandedFrame.dataset.previewReady === 'true';
          const loading = Boolean(dialog.querySelector('[data-preview-loading-overlay="true"]'));
          const failed = expandedFrame.dataset.previewFailed === 'true';
          if (!paintedImages(dialog).length && !loading && !failed && !ready) {
            expandedSilentBlankSamples += 1;
          }
        }, 16);

        await waitUntil(
          () => expandedFrame.dataset.previewReady === 'true' && paintedImages(dialog).length > 0,
          12_000,
          'Upsell expanded preview never became ready',
        );
        await delay(250);
        window.clearInterval(expandedSampler);

        const expandedSource = visibleSource(dialog);
        const expandedRect = rect(expandedFrame);
        const panelRect = rect(dialog.querySelector(':scope > div.relative'));
        const closeRect = rect(dialog.querySelector('button[aria-label="Close preview"]:not(.absolute.inset-0)'));
        const viewport = {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        };

        if (!decodedSource(expandedSource).includes('UPSELL-APPROVED-COMPOSITION')) {
          throw new Error(`Upsell expanded view drifted to another source: ${expandedSource}`);
        }
        if (expandedFrame.dataset.previewTransformMode !== 'exact-snapshot') {
          throw new Error(`Upsell expanded transform mode was ${expandedFrame.dataset.previewTransformMode}`);
        }
        if (!expandedRect || Math.abs((expandedRect.width / expandedRect.height) - 2.5) > 0.04) {
          throw new Error('Upsell expanded preview did not preserve the 120×48 ratio');
        }
        if (expandedSilentBlankSamples !== 0) {
          throw new Error(`Upsell expanded preview had ${expandedSilentBlankSamples} silent blank samples`);
        }

        const geometryPassed = Boolean(
          panelRect
          && expandedRect
          && closeRect
          && panelRect.x >= -1
          && panelRect.y >= -1
          && panelRect.right <= viewport.width + 1
          && panelRect.bottom <= viewport.height + 1
          && expandedRect.x >= -1
          && expandedRect.right <= viewport.width + 1
          && closeRect.x >= -1
          && closeRect.y >= -1
          && closeRect.right <= viewport.width + 1
          && closeRect.bottom <= viewport.height + 1,
        );
        if (!geometryPassed) throw new Error('Upsell expanded geometry exceeded the viewport');

        if (!cancelled) {
          finish('pass', {
            stage: 'complete',
            smallSource,
            expandedSource,
            smallSilentBlankSamples,
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
            stage: 'upsell-composition-preview',
            reason: error instanceof Error ? error.message : String(error),
            smallSilentBlankSamples,
            expandedSilentBlankSamples,
          });
        }
      } finally {
        window.clearInterval(smallSampler);
        window.clearInterval(expandedSampler);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <UpsellModal
      isOpen
      onClose={() => undefined}
      quote={quote}
      thumbnailUrl={approvedComposition}
      thumbnailIsExactComposition
      onContinue={() => undefined}
      actionType="checkout"
      productType="banner"
    />
  );
}

createRoot(document.getElementById('upsell-preview-root')).render(<Harness />);
