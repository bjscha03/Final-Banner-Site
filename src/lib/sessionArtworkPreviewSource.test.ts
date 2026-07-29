import { describe, expect, it } from 'vitest';
import { decideSessionArtworkPreviewSource } from './sessionArtworkPreviewSource';

describe('decideSessionArtworkPreviewSource', () => {
  it('adopts the first local preview immediately', () => {
    expect(decideSessionArtworkPreviewSource('', 'blob:https://site.test/local-artwork')).toEqual({
      displaySource: 'blob:https://site.test/local-artwork',
      pendingPermanentSource: null,
      preloadIncoming: false,
      switchAfterDecode: false,
    });
  });

  it('never replaces a healthy local preview merely because upload completed', () => {
    expect(decideSessionArtworkPreviewSource(
      'blob:https://site.test/local-artwork',
      'https://res.cloudinary.com/demo/image/upload/v1/artwork.png',
    )).toEqual({
      displaySource: 'blob:https://site.test/local-artwork',
      pendingPermanentSource: 'https://res.cloudinary.com/demo/image/upload/v1/artwork.png',
      preloadIncoming: true,
      switchAfterDecode: false,
    });
  });

  it('switches immediately when the user selects a genuinely new local file', () => {
    expect(decideSessionArtworkPreviewSource(
      'blob:https://site.test/first-artwork',
      'blob:https://site.test/second-artwork',
    )).toEqual({
      displaySource: 'blob:https://site.test/second-artwork',
      pendingPermanentSource: null,
      preloadIncoming: false,
      switchAfterDecode: false,
    });
  });

  it('keeps an existing permanent image until a different permanent image is decoded', () => {
    expect(decideSessionArtworkPreviewSource(
      'https://cdn.test/first.png',
      'https://cdn.test/second.png',
    )).toEqual({
      displaySource: 'https://cdn.test/first.png',
      pendingPermanentSource: 'https://cdn.test/second.png',
      preloadIncoming: true,
      switchAfterDecode: true,
    });
  });

  it('ignores a brief empty parent value instead of blanking the canvas', () => {
    expect(decideSessionArtworkPreviewSource(
      'data:image/png;base64,visible',
      '',
    )).toEqual({
      displaySource: 'data:image/png;base64,visible',
      pendingPermanentSource: null,
      preloadIncoming: false,
      switchAfterDecode: false,
    });
  });
});
