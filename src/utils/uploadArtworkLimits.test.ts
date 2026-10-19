import { afterEach, expect, it, vi } from 'vitest';
const { largeUpload } = vi.hoisted(() => ({ largeUpload: vi.fn() }));
vi.mock('./uploadLargeArtworkFile', () => ({ uploadLargeArtworkFile: largeUpload }));
import { uploadArtworkFile } from './uploadArtworkFile';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('routes a compressed high-resolution original around the provider pixel limit before upload', async () => {
  const file = new File(['unchanged original'], 'banner.png', { type: 'image/png' });
  const saved = { secureUrl: 'saved-original' }; largeUpload.mockResolvedValue(saved);
  const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
  const options = { originalWidth: 6300, originalHeight: 9900 };
  expect(await uploadArtworkFile(file, options)).toBe(saved);
  expect(largeUpload).toHaveBeenCalledWith(file, options);
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('automatically preserves the original in chunked storage after an unknown provider size rejection', async () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ apiKey:'key', cloudName:'test', signature:'signature', timestamp:123, folder:'uploads', resourceType:'image', uploadUrl:'https://api.cloudinary.com/v1_1/test/image/upload' })));
  vi.stubGlobal('XMLHttpRequest', class {
    upload = {}; status = 400; response = { error: { message: 'Image size exceeds the maximum allowed megapixels' } }; onload?: () => void;
    open() {} abort() {} send() { this.onload?.(); }
  });
  const file = new File([new Uint8Array(4 * 1024 * 1024)], 'banner.jpg', { type: 'image/jpeg' });
  const saved = { secureUrl:'saved-original' }; largeUpload.mockResolvedValue(saved);
  expect(await uploadArtworkFile(file)).toBe(saved);
  expect(largeUpload.mock.calls[0][0]).toBe(file);
});
