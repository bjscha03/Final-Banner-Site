import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireSavedAIArtwork, rememberAIArtworkSession, restoreAIArtworkSession } from './aiArtworkTransfer';

import type { AIDesignSession } from '@/components/design/ai/types';
const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/components/design/ai/draftStore', () => ({
  saveDraft: async (key: string, value: unknown) => { records.set(key, structuredClone(value)); },
  loadDraft: async (key: string) => records.get(key) || null,
}));
beforeEach(() => records.clear());

describe('approved artwork recovery after returning from checkout', () => {
  const product = { productType: 'banner' as const, widthIn: 72, heightIn: 36 };
  const session = (id: string) => ({ brief: { ...product, description: id }, selectedConcept: { versionId: id, brief: product }, versionHistory: [{ versionId: id }] }) as AIDesignSession;
  it('recovers the exact source and its history without substituting a different cart item', async () => {
    await rememberAIArtworkSession({ fileKey: 'first' }, session('v1'));
    await rememberAIArtworkSession({ fileKey: 'second' }, session('v2'));
    expect(await restoreAIArtworkSession({ productionPublicId: 'first' }, product)).toEqual(session('v1'));
    expect(await restoreAIArtworkSession({ fileKey: 'second' }, product)).toEqual(session('v2'));
    expect(await restoreAIArtworkSession({ fileKey: 'unrelated-upload' }, product)).toBeNull();
  });
  it('does not restore artwork into a different product or size', async () => {
    await rememberAIArtworkSession({ fileKey: 'source' }, session('v1'));
    expect(await restoreAIArtworkSession({ fileKey: 'source' }, { ...product, widthIn: 96 })).toBeNull();
    expect(await restoreAIArtworkSession({ fileKey: 'source' }, { ...product, productType: 'car_magnet' })).toBeNull();
  });
  it('ignores local-only previews and unavailable drafts', async () => {
    expect(await restoreAIArtworkSession({ url: 'blob:preview' }, product)).toBeNull();
    expect(await restoreAIArtworkSession({ fileKey: 'expired' }, product)).toBeNull();
  });
});

describe('AI artwork must be durably uploaded before continuing', () => {
  it.each([undefined, null, {}, { url: 'blob:local-preview', fileKey: '' }, { url: 'https://cdn.example/art.jpg' }, { fileKey: 'saved', url: 'blob:preview' }])('rejects a missing or local-only upload: %j', result => {
    expect(() => requireSavedAIArtwork(result)).toThrow('could not save it to your order');
  });
  it.each([
    { fileKey: 'banner/file', url: 'https://cdn.example/art.jpg' },
    { productionPublicId: 'banner/original', productionUrl: 'https://cdn.example/production.jpg', url: 'blob:local-preview' },
    { fileKey: 'yard/file', fileUrl: 'https://cdn.example/sign.jpg' },
  ])('accepts saved banner and yard-sign artwork: %j', result => {
    expect(() => requireSavedAIArtwork(result)).not.toThrow();
  });
});
