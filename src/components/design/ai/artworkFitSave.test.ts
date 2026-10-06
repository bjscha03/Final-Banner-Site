// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { canApplyArtworkFit, saveFittedArtwork, type ArtworkFitResult } from './artworkFit';
import { uploadArtworkFile } from '@/utils/uploadArtworkFile';
import { preloadPreviewImage } from '@/lib/previewImageCache';
vi.mock('@/utils/uploadArtworkFile', () => ({ uploadArtworkFile: vi.fn(), buildCloudinaryPdfPreviewUrl: (url: string) => url }));
vi.mock('@/lib/previewImageCache', () => ({ preloadPreviewImage: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const reviewable: ArtworkFitResult = {
  id: 'reviewed-fit', sourceHash: 'source', imageBase64: 'AAAA', mimeType: 'image/jpeg', widthIn: 72, heightIn: 36, widthPx: 2560, heightPx: 1280,
  verification: { passed: false, canApply: true, blockingIssues: [], originalText: ['$5 ADMISSION'], detectedText: ['$5 ADMISSION'], missing: [], added: [], issues: ['Wood grain differs'], confidence: .8 },
  diagnostics: { model: 'test', durationMs: 100 },
};
it('saves a customer-reviewed layout even though cosmetic checks raised warnings', async () => {
  vi.mocked(uploadArtworkFile).mockResolvedValue({ secureUrl: 'https://cdn.test/fitted.jpg', productionUrl: 'https://cdn.test/fitted.jpg', previewUrl: 'https://cdn.test/preview.jpg', fileKey: 'fitted', productionPublicId: 'fitted', resourceType: 'image', mimeType: 'image/jpeg', format: 'jpg', bytes: 3 } as any);
  vi.mocked(preloadPreviewImage).mockResolvedValue({ naturalWidth: 2560, naturalHeight: 1280 } as any);
  const saved = await saveFittedArtwork(reviewable);
  expect(saved).toMatchObject({ editorIdentity: 'ai-fit:reviewed-fit', productionUrl: 'https://cdn.test/fitted.jpg', originalWidth: 2560, originalHeight: 1280 });
  expect(uploadArtworkFile).toHaveBeenCalledOnce(); expect(preloadPreviewImage).toHaveBeenCalledOnce();
});
it.each([
  { canApply: false }, { missing: ['5'] }, { added: ['15'] }, { blockingIssues: ['Logo missing'] },
])('rejects a blocked result before an upload: %j', async changed => {
  const result = { ...reviewable, verification: { ...reviewable.verification, ...changed } };
  expect(canApplyArtworkFit(result)).toBe(false);
  await expect(saveFittedArtwork(result)).rejects.toThrow('another attempt');
  expect(uploadArtworkFile).not.toHaveBeenCalled();
});
it('preserves compatibility with an earlier fully passed result', () => {
  expect(canApplyArtworkFit({ ...reviewable, verification: { ...reviewable.verification, passed: true, canApply: undefined, issues: [] } })).toBe(true);
});
