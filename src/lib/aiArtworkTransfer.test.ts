import { describe, expect, it } from 'vitest';
import { requireSavedAIArtwork } from './aiArtworkTransfer';

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
