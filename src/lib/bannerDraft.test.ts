// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bannerDraftKey, clearBannerDraft, readBannerDraft, saveBannerDraft, type BannerDraft } from './bannerDraft';
const draft: BannerDraft = { version: 1, savedAt: Date.now(), width: 120, height: 48, material: '13oz', quantity: 2, grommets: 'none', polePockets: 'none', polePocketSize: '2', addRope: false, ropePlacement: 'top', finishingType: 'none', constrained: true, artwork: { name: 'test.png', url: 'https://example.com/original.png', previewUrl: 'https://example.com/preview.png', fileKey: 'original', size: 2000, isPdf: false }, transform: { xPct: 12, yPct: -5, scaleX: 1.2, scaleY: 1.2 } };
beforeEach(() => localStorage.clear());
describe('unfinished banner recovery', () => {
 it('preserves permanent artwork, finishing, and normalized placement across a reload', () => { expect(saveBannerDraft('/google-ads-banner', draft)).toBe(true); expect(readBannerDraft('/google-ads-banner')).toEqual(draft); expect(readBannerDraft('/large-banners-fast')).toBeNull(); });
 it('does not advertise a saved draft for a temporary preview', () => { expect(saveBannerDraft('/design', { ...draft, artwork: { ...draft.artwork, previewUrl: 'blob:temporary' } })).toBe(false); });
 it('ignores malformed, expired, and unsupported configurations', () => { localStorage.setItem(bannerDraftKey('/design'), '{bad'); expect(readBannerDraft('/design')).toBeNull(); expect(saveBannerDraft('/design', { ...draft, width: 500, height: 500 })).toBe(false); saveBannerDraft('/design', { ...draft, savedAt: Date.now() - 8 * 86400000 }); expect(readBannerDraft('/design')).toBeNull(); });
 it('clears a completed draft without affecting another designer', () => { saveBannerDraft('/a', draft); saveBannerDraft('/b', draft); clearBannerDraft('/a'); expect(readBannerDraft('/a')).toBeNull(); expect(readBannerDraft('/b')).not.toBeNull(); });
 it('fails safely when storage is unavailable', () => { const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); }); expect(saveBannerDraft('/design', draft)).toBe(false); spy.mockRestore(); });
});
