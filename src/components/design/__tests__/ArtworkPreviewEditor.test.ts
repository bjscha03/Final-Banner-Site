// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import ArtworkPreviewEditor from '../ArtworkPreviewEditor';
import {
  getPreviewCrossOrigin,
  isRawPdfPreviewSource,
  resolveArtworkPreviewImageSrc,
  shouldStartPreviewLoad,
} from '../artworkPreviewSource';
import { geometryFromNormalizedArtworkTransform } from '../ArtworkPreviewEditor';
import { restoreArtworkTransformFromGeometry } from '@/lib/artworkTransformGeometry';

describe('ArtworkPreviewEditor preview source resolution', () => {
  it('restores percentage placement independently of the current canvas pixels', () => {
    const geometry = geometryFromNormalizedArtworkTransform(
      { xPct: 12.5, yPct: -5, scaleX: 1.2, scaleY: 0.8 },
      { w: 400, h: 200 },
      { w: 1600, h: 800 },
    );

    expect(restoreArtworkTransformFromGeometry(
      geometry,
      { w: 800, h: 400 },
      { w: 1600, h: 800 },
      false,
    )).toEqual({ x: 100, y: -20, scaleX: 1.2, scaleY: 0.8 });
  });

  it('rejects raw Cloudinary PDF URLs as image sources', () => {
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://res.cloudinary.com/example/raw/upload/test.pdf',
      resourceType: 'raw',
      mimeType: 'application/pdf',
    })).toBe('');
    expect(isRawPdfPreviewSource('https://res.cloudinary.com/example/raw/upload/test.pdf')).toBe(true);
  });

  it('normalizes legacy image transformations but still rejects unrendered PDFs with query strings', () => {
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,w_800/v1/banner.pdf?version=1',
      mimeType: 'application/pdf',
    })).toBe('https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,w_800/v1/banner.jpg?version=1');
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://cdn.test/image/upload/banner.pdf?download=1',
      previewUrl: 'https://cdn.test/image/upload/banner.pdf?download=1',
    })).toBe('');
  });

  it('allows a real PNG preview even when the production source is a raw PDF', () => {
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://res.cloudinary.com/example/raw/upload/test.pdf',
      previewUrl: 'data:image/png;base64,actual-pdf-page',
      resourceType: 'raw',
      mimeType: 'application/pdf',
    })).toBe('data:image/png;base64,actual-pdf-page');
  });

  it('gives previewUrl priority over productionUrl-like src values', () => {
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://res.cloudinary.com/example/raw/upload/test.pdf',
      previewUrl: 'blob:https://preview.local/rendered-page',
      resourceType: 'raw',
      mimeType: 'application/pdf',
    })).toBe('blob:https://preview.local/rendered-page');
  });

  it('does not apply crossOrigin to blob or data previews', () => {
    expect(getPreviewCrossOrigin('blob:https://preview.local/page', 'anonymous')).toBeUndefined();
    expect(getPreviewCrossOrigin('data:image/png;base64,page', 'anonymous')).toBeUndefined();
    expect(getPreviewCrossOrigin('https://cdn.example.com/page.png', 'anonymous')).toBe('anonymous');
  });

  it('does not restart loading when only production metadata changes after a preview is loaded', () => {
    const previewUrl = 'blob:https://preview.local/rendered-page';

    expect(shouldStartPreviewLoad({
      imageSrc: previewUrl,
      rawPdfRejected: false,
      loadedPreviewSrc: '',
    })).toBe(true);

    // Regression guard for PR #354: productionUrl/resourceType/mimeType
    // updates must not reset loading when the actual preview URL is unchanged.
    expect(shouldStartPreviewLoad({
      imageSrc: previewUrl,
      rawPdfRejected: false,
      loadedPreviewSrc: previewUrl,
    })).toBe(false);
  });
});


describe('ArtworkPreviewEditor proportional fitting', () => {
  it.each([[800, 800], [1200, 400], [400, 1200], [1200, 600]])('preserves original proportions and offers eight handles for %i × %i artwork', async (width, height) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 600, height: 300, x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 300, toJSON() {},
    });
    const host = document.createElement('div');
    const toolbarSlot = document.createElement('div');
    document.body.append(host, toolbarSlot);
    const root = createRoot(host);
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => host.querySelector('img');
    function Harness() {
      const [value, setValue] = useState({ x: 24, y: -12, scaleX: 1, scaleY: 1 });
      const [locked, setLocked] = useState(true);
      return React.createElement(ArtworkPreviewEditor, {
        src: `test-${width}-${height}.png`, paddingPct: '50%', value,
        onChange: setValue, constrain: locked, onConstrainChange: setLocked,
        mobileToolbarContainer: toolbarSlot,
      });
    }
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const image = host.querySelector('img')!;
      Object.defineProperties(image, {
        complete: { value: true }, naturalWidth: { value: width }, naturalHeight: { value: height },
      });
      await act(async () => image.dispatchEvent(new Event('load')));
      const frame = image.parentElement!;
      const before = frame.getAttribute('style');
      // Canvas measurement happens before image decode in this harness.
      // Fresh artwork must still use its contained size, never canvas width.
      const fitScale = Math.min(600 / width, 300 / height);
      expect(parseFloat(frame.style.width)).toBeCloseTo(width * fitScale);
      expect(parseFloat(frame.style.height)).toBeCloseTo(height * fitScale);
      expect(parseFloat(frame.style.width) / parseFloat(frame.style.height)).toBeCloseTo(width / height);
      expect(host.querySelectorAll('[data-handle]')).toHaveLength(8);
      expect(toolbarSlot.querySelector('details')).toBeNull();
      const cropButton = host.querySelector('[aria-label="Crop artwork"]') as HTMLButtonElement;
      await act(async () => cropButton.click());
      expect(frame.getAttribute('style')).toBe(before);
      expect(host.querySelector('[data-crop-mode="true"]')).not.toBeNull();
      await act(async () => (host.querySelector('[aria-label="Done cropping"]') as HTMLButtonElement).click());
      const fill = Array.from(toolbarSlot.querySelectorAll('button')).find(b => b.textContent?.startsWith('Fill banner'))!;
      await act(async () => fill.click());
      expect(parseFloat(frame.style.width) / parseFloat(frame.style.height)).toBeCloseTo(width / height);
      // Fit/fill preserve the original image proportions, including tall artwork.
      const fillScale = Math.min(20, Math.max(600 / width, 300 / height) / fitScale);
      expect(parseFloat(frame.style.width)).toBeCloseTo(width * fitScale * fillScale);
      expect(parseFloat(frame.style.height)).toBeCloseTo(height * fitScale * fillScale);
      expect(toolbarSlot.textContent).not.toContain('will be cropped');
      const fit = Array.from(toolbarSlot.querySelectorAll('button')).find(b => b.textContent?.startsWith('Show full image'))!;
      await act(async () => fit.click());
      expect(parseFloat(frame.style.width)).toBeCloseTo(width * fitScale);
      expect(parseFloat(frame.style.height)).toBeCloseTo(height * fitScale);
      expect(toolbarSlot.textContent).not.toContain('will be cropped');
      expect(toolbarSlot.textContent).not.toContain('Your preview includes blank margins');
    } finally {
      await act(async () => root.unmount());
      host.remove(); toolbarSlot.remove(); bounds.mockRestore(); vi.unstubAllGlobals();
      document.elementFromPoint = originalElementFromPoint;
    }
  });
});


describe('customer-controlled artwork placement', () => {
  it.each(['inline', 'mobile'] as const)('keeps %s size changes free of technical notices while preserving placement and fit controls', async (toolbar) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 600, height: 300, x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 300, toJSON() {},
    });
    const host = document.createElement('div');
    const slot = document.createElement('div');
    document.body.append(host, slot);
    const root = createRoot(host);
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => host.querySelector('img');
    const change = vi.fn();
    const props = { src: `size-review-${toolbar}.png`, value: { x: 20, y: 10, scaleX: 1, scaleY: 1 }, onChange: change, constrain: true, onConstrainChange: vi.fn(), mobileToolbarContainer: toolbar === 'mobile' ? slot : null };
    const controls = toolbar === 'mobile' ? slot : host;
    try {
      await act(async () => root.render(React.createElement(ArtworkPreviewEditor, { ...props, paddingPct: '50%' })));
      const img = host.querySelector('img')!;
      Object.defineProperties(img, { complete: { value: true }, naturalWidth: { value: 800 }, naturalHeight: { value: 800 } });
      await act(async () => img.dispatchEvent(new Event('load')));
      const before = img.parentElement!.getAttribute('style');
      change.mockClear();
      await act(async () => root.render(React.createElement(ArtworkPreviewEditor, { ...props, paddingPct: '100%' })));
      for (const copy of ['shape changed', 'cropped edges', 'blank margins', 'Edges may crop', 'Keep current placement']) {
        expect(controls.textContent).not.toContain(copy);
      }
      expect(controls.querySelector('[role="alert"], [role="status"]')).toBeNull();
      expect(change).not.toHaveBeenCalled();
      expect(img.parentElement!.getAttribute('style')).toBe(before);
      const fit = Array.from(controls.querySelectorAll('button')).find(b => b.textContent === 'Show full image')!;
      const fill = Array.from(controls.querySelectorAll('button')).find(b => b.textContent === 'Fill banner')!;
      expect(fit.disabled).toBe(false);
      expect(fill.disabled).toBe(false);
      await act(async () => fit.click());
      expect(change).toHaveBeenLastCalledWith({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    } finally {
      await act(async () => root.unmount());
      host.remove(); slot.remove(); bounds.mockRestore(); vi.unstubAllGlobals();
      document.elementFromPoint = originalElementFromPoint;
    }
  });
});


describe('ArtworkPreviewEditor print-frame geometry', () => {
  it.each([240, 390, 654])('exports edge-to-edge Fill at %i px despite decorative border styles', async (canvasWidth) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    // Model CSS sizing: the old percentage-padding frame adds border height;
    // the corrected ratio frame keeps layout decoration out of print geometry.
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const ratio = Number(this.style.aspectRatio);
      const border = parseFloat(this.style.borderWidth) || 0;
      const height = ratio ? canvasWidth / ratio : canvasWidth * (parseFloat(this.style.paddingBottom) || 50) / 100 + border * 2;
      return { width: canvasWidth, height, x: 0, y: 0, left: 0, top: 0, right: canvasWidth, bottom: height, toJSON() {} };
    });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const ref = React.createRef<import('../ArtworkPreviewEditor').ArtworkPreviewEditorHandle>();
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => host.querySelector('img');
    function Harness() {
      const [value, setValue] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
      return React.createElement(ArtworkPreviewEditor, {
        ref, src: `border-regression-${canvasWidth}.png`, paddingPct: '50%', value,
        onChange: setValue, constrain: true, onConstrainChange: () => {},
        canvasStyle: { border: '1px solid #94a3b8' },
      });
    }
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const image = host.querySelector('img')!;
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
      await act(async () => image.dispatchEvent(new Event('load')));
      const fill = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.startsWith('Fill banner'))!;
      await act(async () => fill.click());
      const snapshot = ref.current!.getCompositionSnapshot();
      expect(snapshot.canvasWidthPx / snapshot.canvasHeightPx).toBeCloseTo(2, 8);
      expect(snapshot.transform.scaleX).toBeCloseTo(4 / 3, 5);
      expect(snapshot.transform.scaleY).toBeCloseTo(4 / 3, 5);
      // Reproduce the exporter's contain × saved-scale calculation at 1400×700.
      const exportedWidth = 1200 * Math.min(1400 / 1200, 700 / 800) * snapshot.transform.scaleX;
      expect(exportedWidth).toBeCloseTo(1400, 2);
      expect((host.querySelector('[data-testid=artwork-canvas]') as HTMLElement).style.borderWidth).toBe('0px');
    } finally {
      await act(async () => root.unmount()); host.remove(); bounds.mockRestore(); vi.unstubAllGlobals();
      document.elementFromPoint = originalElementFromPoint;
    }
  });
});
