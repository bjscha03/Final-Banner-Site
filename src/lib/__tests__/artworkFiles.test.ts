import { describe, expect, it } from 'vitest';
import { getOriginalArtworkSelection } from '../artworkFiles';

describe('original artwork resolver', () => {
  it('never substitutes derivatives', () => {
    expect(getOriginalArtworkSelection({
      print_ready_url: 'print', web_preview_url: 'preview', thumbnail_url: 'thumb',
      overlay_image: { fileKey: 'overlay' }, generated_print_pdf_url: 'pdf', final_print_pdf_url: 'final',
    })).toBeNull();
  });

  it('prefers manifest and supports legacy originals', () => {
    expect(getOriginalArtworkSelection({ artwork_manifest: { originalUrl: 'original' }, file_url: 'legacy' })?.url).toBe('original');
    expect(getOriginalArtworkSelection({ file_url: 'legacy' })?.url).toBe('legacy');
  });
});
