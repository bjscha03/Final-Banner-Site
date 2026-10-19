import { describe, it, expect } from 'vitest';
import { artworkResolution, orderArtworkResolution } from '../artworkResolution';
describe('actual print resolution', () => {
  it('flags the two-banner AI output instead of trusting a DPI tag or filename', () => {
    expect(artworkResolution(2560, 1280, 72, 36)).toMatchObject({ ppi: 2560 / 72, meetsMinimum: false, minimumWidth: 14400, minimumHeight: 7200, preferredWidth: 21600, preferredHeight: 10800 });
    expect(artworkResolution(14400, 7200, 72, 36)?.meetsMinimum).toBe(true);
    expect(artworkResolution(21600, 10800, 72, 36)?.meetsPreferred).toBe(true);
  });
  it('accounts for enlargement in the saved placement and never approves unknown resolution', () => {
    expect(orderArtworkResolution({ width_in: 72, height_in: 36, artwork_manifest: { width: 21600, height: 10800 }, canvas_state_json: JSON.stringify({ imgScale: 2 }) })?.ppi).toBe(150);
    expect(orderArtworkResolution({ width_in: 72, height_in: 36 })).toBeNull();
  });
});
