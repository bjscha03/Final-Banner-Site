// @vitest-environment jsdom
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionStableArtworkPreviewEditor from '../SessionStableArtworkPreviewEditor';
import type { ArtworkPreviewEditorHandle } from '../ArtworkPreviewEditor';
import { buildCartArtworkForEditor } from '@/lib/cartArtworkForEditor';
import type { CartItem } from '@/store/cart';

vi.mock('@/lib/previewImageCache', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/previewImageCache')>(),
  preloadPreviewImage: vi.fn().mockResolvedValue({ naturalWidth: 1800, naturalHeight: 720 }),
}));

describe('10 × 4 PDF preview navigation', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const elementFromPoint = document.elementFromPoint;
  const original = 'https://res.cloudinary.com/demo/image/upload/v1/banner.pdf';
  const legacyPreview = original.replace('/upload/', '/upload/pg_1,f_jpg,w_800/');
  const ref = createRef<ArtworkPreviewEditorHandle>();
  const value = { x: 25, y: -10, scaleX: 1.2, scaleY: 1.2 };
  const props = {
    ref, paddingPct: '40%', value, onChange: vi.fn(), constrain: true,
    onConstrainChange: vi.fn(), resourceType: 'image', mimeType: 'application/pdf',
    compositionKey: 'return-flow-pdf',
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 500, height: 200, x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 200, toJSON() {},
    });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    document.elementFromPoint = () => host.querySelector('img');
  });
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    document.elementFromPoint = elementFromPoint;
  });
  async function decode() {
    const image = host.querySelector('img');
    expect(image).not.toBeNull();
    Object.defineProperties(image!, {
      complete: { value: true, configurable: true },
      naturalWidth: { value: 1800, configurable: true }, naturalHeight: { value: 720, configurable: true },
    });
    await act(async () => image!.dispatchEvent(new Event('load')));
    expect(host.textContent).not.toContain('PDF needs a browser preview');
    expect(host.textContent).not.toContain('Retry preview');
    return image!;
  }

  it('keeps the selected preview through upload completion, then reopens the permanent PDF image repeatedly', async () => {
    const local = 'blob:https://site.test/pdf-page';
    await act(async () => root.render(<SessionStableArtworkPreviewEditor {...props} src={original} previewUrl={local} />));
    await decode();
    const before = ref.current!.getCompositionSnapshot();
    await act(async () => root.render(<SessionStableArtworkPreviewEditor {...props} src={original} previewUrl={legacyPreview} />));
    expect(host.querySelector('img')!.getAttribute('src')).toBe(local);
    for (let n = 0; n < 3; n++) {
      // Finishing closes the modal; reopening mounts a fresh editor.
      await act(async () => root.render(null));
      await act(async () => root.render(<SessionStableArtworkPreviewEditor {...props} src={original} previewUrl={legacyPreview} />));
      const image = await decode();
      expect(image.getAttribute('src')).toBe(legacyPreview.replace('.pdf', '.jpg'));
      expect(ref.current!.getCompositionSnapshot().transform).toEqual(before.transform);
    }
  });

  it.each([
    [original, legacyPreview, legacyPreview.replace('.pdf', '.jpg')],
    ['https://bannersonthefly.com/artwork-original/123/original.pdf', 'https://cdn.test/saved-page.png', 'https://cdn.test/saved-page.png'],
  ])('mounts a fresh designer from the saved cart for %s', async (fileUrl, sourceUrl, expected) => {
    const item = {
      id: 'saved-pdf', file_url: fileUrl, file_key: fileUrl, is_pdf: true,
      placement_preview: { sourceUrl, previewUrl: 'https://cdn.test/baked-placement.png', uploadStatus: 'uploaded' },
    } as CartItem;
    // JSON round trip models cart persistence across checkout/reload.
    const restored = buildCartArtworkForEditor(JSON.parse(JSON.stringify(item)))!;
    await act(async () => root.render(<SessionStableArtworkPreviewEditor {...props}
      src={restored.url} previewUrl={restored.previewUrl} productionUrl={restored.productionUrl} />));
    expect((await decode()).getAttribute('src')).toBe(expected);
    expect(restored.productionUrl).toBe(fileUrl);
  });
});
