// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPdfPreviewFile } from './getPdfPreviewFile';

afterEach(() => vi.unstubAllGlobals());

describe('PDF retry after checkout', () => {
  const artwork = { name: 'banner.pdf', url: 'https://cdn.test/preview.jpg', productionUrl: 'https://cdn.test/original.pdf' };
  it('reuses the selected file while the designer is still open', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const file = new File(['%PDF-'], 'banner.pdf', { type: 'application/pdf' });
    expect(await getPdfPreviewFile(file, artwork)).toBe(file);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('retrieves the preserved original after navigation removes the local file ref', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['%PDF-1.7']) });
    vi.stubGlobal('fetch', fetchMock);
    const file = await getPdfPreviewFile(null, artwork);
    expect(fetchMock).toHaveBeenCalledWith(artwork.productionUrl, expect.objectContaining({ signal: expect.anything() }));
    expect(file.name).toBe('banner.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(8);
  });
  it('reports failed original retrieval instead of passing an error document to the PDF renderer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(getPdfPreviewFile(null, artwork)).rejects.toThrow('503');
  });
});
