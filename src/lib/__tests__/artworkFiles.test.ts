import { describe, expect, it } from 'vitest';
import { getOriginalArtworkSelection, getAIResizedArtworkSelection } from '../artworkFiles';

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


describe('AI-resized artwork download', () => {
  it('downloads the accepted full-resolution AI file, never the preview or print derivative', () => {
    const item = {
      artwork_manifest: { originalFilename: 'ai-fit-72x36-result-123.jpg', originalUrl: 'https://cdn.test/full-resolution.jpg' },
      file_url: 'https://cdn.test/legacy.jpg', thumbnail_url: 'thumbnail', print_ready_url: 'print',
    };
    expect(getAIResizedArtworkSelection(item)?.url).toBe('https://cdn.test/full-resolution.jpg');
    expect(getOriginalArtworkSelection(item)?.url).toBe('https://cdn.test/full-resolution.jpg');
  });

  it('supports older orders and decimal product sizes', () => {
    expect(getAIResizedArtworkSelection({ file_name: 'ai-fit-24.5x18-result.jpg', file_key: 'stored-artwork' })?.url).toBe('stored-artwork');
    expect(getAIResizedArtworkSelection({ original_filename: 'ai-fit-24x18-result.png', file_url: 'saved' })?.url).toBe('saved');
  });

  it('does not offer resized downloads for normal uploads or missing production files', () => {
    expect(getAIResizedArtworkSelection({ file_name: 'logo.jpg', file_url: 'original' })).toBeNull();
    expect(getAIResizedArtworkSelection({ artwork_manifest: { originalFilename: 'logo.jpg' }, file_name: 'ai-fit-24x18-old.jpg', file_url: 'original' })).toBeNull();
    expect(getAIResizedArtworkSelection({ file_name: 'ai-fit-24x18-result.jpg', thumbnail_url: 'thumbnail', print_ready_url: 'print' })).toBeNull();
  });
});
