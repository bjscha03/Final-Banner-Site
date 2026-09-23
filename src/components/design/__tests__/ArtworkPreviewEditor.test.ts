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


describe('ArtworkPreviewEditor unlock interaction', () => {
  it.each([[800, 800], [1200, 400], [400, 1200], [1200, 600]])('does not move or stretch %i × %i artwork on unlock', async (width, height) => {
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
      const unlock = Array.from(toolbarSlot.querySelectorAll('button')).find(b => b.textContent === 'Unlock free resize')!;
      expect(unlock).toBeDefined();
      await act(async () => unlock.click());
      expect(frame.getAttribute('style')).toBe(before);
      expect(toolbarSlot.textContent).toContain('Free resize enabled');
      expect(toolbarSlot.textContent).toContain('Lock proportions');
      await act(async () => document.body.click());
      expect(toolbarSlot.textContent).toContain('Lock proportions');
      expect(frame.getAttribute('style')).toBe(before);
    } finally {
      await act(async () => root.unmount());
      host.remove(); toolbarSlot.remove(); bounds.mockRestore(); vi.unstubAllGlobals();
      document.elementFromPoint = originalElementFromPoint;
    }
  });
});


describe('banner size change review', () => {
  it('offers Fit or Keep placement after a shape change without changing placement on dismissal', async () => {
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
    const props = { src: 'size-review.png', value: { x: 20, y: 10, scaleX: 1, scaleY: 1 }, onChange: change, constrain: true, onConstrainChange: vi.fn(), mobileToolbarContainer: slot };
    try {
      await act(async () => root.render(React.createElement(ArtworkPreviewEditor, { ...props, paddingPct: '50%' })));
      const img = host.querySelector('img')!;
      Object.defineProperties(img, { complete: { value: true }, naturalWidth: { value: 800 }, naturalHeight: { value: 800 } });
      await act(async () => img.dispatchEvent(new Event('load')));
      expect(slot.textContent).not.toContain('Your banner shape changed');
      await act(async () => root.render(React.createElement(ArtworkPreviewEditor, { ...props, paddingPct: '100%' })));
      expect(slot.textContent).toContain('Your banner shape changed');
      expect(slot.textContent).toContain('Fit entire artwork');
      change.mockClear();
      const before = img.parentElement!.getAttribute('style');
      const keep = Array.from(slot.querySelectorAll('button')).find(b => b.textContent === 'Keep current placement')!;
      await act(async () => keep.click());
      expect(slot.textContent).not.toContain('Your banner shape changed');
      expect(change).not.toHaveBeenCalled();
      expect(img.parentElement!.getAttribute('style')).toBe(before);
    } finally {
      await act(async () => root.unmount());
      host.remove(); slot.remove(); bounds.mockRestore(); vi.unstubAllGlobals();
      document.elementFromPoint = originalElementFromPoint;
    }
  });
});
