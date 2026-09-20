import { z } from 'zod';

const httpsUrl = z.string().url().refine(value => value.startsWith('https://'));
const draftSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().finite(),
  width: z.number().min(6).max(600),
  height: z.number().min(6).max(600),
  material: z.enum(['13oz', '15oz', '18oz', 'mesh']),
  quantity: z.number().int().min(1).max(10000),
  grommets: z.string(),
  polePockets: z.string(),
  polePocketSize: z.string(),
  addRope: z.boolean(),
  ropePlacement: z.string(),
  finishingType: z.string(),
  constrained: z.boolean(),
  artwork: z.object({ name: z.string(), url: httpsUrl, fileKey: z.string().min(1), size: z.number(), isPdf: z.boolean(), previewUrl: httpsUrl, productionUrl: httpsUrl.optional() }).passthrough(),
  transform: z.object({ xPct: z.number().finite(), yPct: z.number().finite(), scaleX: z.number().min(.2).max(5), scaleY: z.number().min(.2).max(5) }),
}).refine(value => Math.min(value.width, value.height) <= 192);
type ParsedDraft = z.infer<typeof draftSchema>;
export type BannerDraft = Required<Omit<ParsedDraft, 'artwork' | 'transform'>> & {
  artwork: { name: string; url: string; fileKey: string; size: number; isPdf: boolean; previewUrl: string; productionUrl?: string; [key: string]: unknown };
  transform: { xPct: number; yPct: number; scaleX: number; scaleY: number };
};
export const bannerDraftKey = (path: string) => `botf-banner-draft-v1:${path}`;
export function readBannerDraft(path: string): BannerDraft | null {
  try {
    const result = draftSchema.safeParse(JSON.parse(localStorage.getItem(bannerDraftKey(path)) || 'null'));
    if (!result.success || Date.now() - result.data.savedAt > 7 * 86400000) return null;
    return result.data as BannerDraft;
  } catch { return null; }
}
export function saveBannerDraft(path: string, draft: unknown): boolean {
  try {
    const result = draftSchema.safeParse(draft);
    if (!result.success) return false;
    localStorage.setItem(bannerDraftKey(path), JSON.stringify(result.data));
    return true;
  } catch { return false; }
}
export function clearBannerDraft(path: string): void {
  try { localStorage.removeItem(bannerDraftKey(path)); } catch { /* Storage is optional. */ }
}
