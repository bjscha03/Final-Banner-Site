import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StableBannerPreview, { FINALIZED_PREVIEW_BLEED_SCALE } from './StableBannerPreview';

const renderPreview = (isFinalizedSnapshot: boolean, maxSize = 200) => renderToStaticMarkup(
  <StableBannerPreview
    widthIn={72}
    heightIn={24}
    grommets="none"
    imageUrl="https://example.com/banner.jpg"
    isFinalizedSnapshot={isFinalizedSnapshot}
    maxSize={maxSize}
  />,
);

describe('StableBannerPreview', () => {
  it('fills the exact 50-by-5 proof frame without border-induced letterboxing', () => {
    const html = renderToStaticMarkup(<StableBannerPreview widthIn={600} heightIn={60} grommets="none" imageUrl="https://example.com/proof.jpg" isFinalizedSnapshot maxSize={820} />);
    expect(html).toContain('aspect-ratio:600 / 60');
    expect(html).toContain('object-fit:fill');
    expect(html).not.toContain('border-2');
  });
  it('overscans finalized proof images to hide baked edge seams', () => {
    const html = renderPreview(true);

    expect(html).toContain('data-preview-bleed-compensated="true"');
    expect(html).toContain(`transform:scale(${FINALIZED_PREVIEW_BLEED_SCALE})`);
  });

  it('does not alter the saved transform for non-finalized artwork', () => {
    const html = renderPreview(false);

    expect(html).toContain('data-preview-bleed-compensated="false"');
    expect(html).toContain('transform:translate(0%, 0%) scale(1, 1)');
    expect(html).not.toContain(`transform:scale(${FINALIZED_PREVIEW_BLEED_SCALE})`);
  });

  it('honors a larger requested responsive preview size', () => {
    const html = renderPreview(true, 240);

    expect(html).toContain('width:240px');
  });
});
