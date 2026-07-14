import { describe, expect, it } from 'vitest';
import { getExpandedPreviewSelection, getSmallPreviewUrl } from '../previewSelection';

describe('previewSelection', () => {
  it('keeps small cart cards on thumbnail priority', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      web_preview_url: 'https://cdn.example.com/web.png',
      file_url: 'https://cdn.example.com/original.png',
    })).toBe('https://cdn.example.com/thumb.png');
  });

  it('uses web_preview_url before final_render_url or thumbnail_url for expanded previews', () => {
    const selected = getExpandedPreviewSelection({
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      final_render_url: 'https://cdn.example.com/final.png',
      web_preview_url: 'https://cdn.example.com/web.png',
    });

    expect(selected.url).toBe('https://cdn.example.com/web.png');
    expect(selected.source).toBe('web_preview');
    expect(selected.isLowResolutionFallback).toBe(false);
  });

  it('labels thumbnail_url as a preparing low-resolution expanded fallback', () => {
    const selected = getExpandedPreviewSelection({
      thumbnail_url: 'data:image/png;base64,small',
    });

    expect(selected.url).toBe('data:image/png;base64,small');
    expect(selected.source).toBe('thumbnail_fallback');
    expect(selected.isLowResolutionFallback).toBe(true);
    expect(selected.isPreparingHighResolution).toBe(true);
  });
});
