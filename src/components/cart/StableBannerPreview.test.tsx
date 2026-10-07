import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StableBannerPreview from './StableBannerPreview';

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
  it('preserves every finalized proof edge so margins cannot be hidden', () => {
    const html = renderPreview(true);

    expect(html).toContain('data-preview-bleed-compensated="false"');
    expect(html).toContain('transform:none');
  });

  it.each([200, 600, 1600])('keeps regular and realistic proofs uncropped at size %s', (maxSize) => {
    const common = { widthIn: 96, heightIn: 48, grommets: 'none' as const,
      imageUrl: 'https://example.com/proof-with-edge-matte.jpg', isFinalizedSnapshot: true, maxSize };
    const regular = renderToStaticMarkup(<StableBannerPreview {...common} />);
    const realistic = renderToStaticMarkup(<StableBannerPreview {...common} surfaceOnly />);
    const crop = 'transform:none';
    expect(regular).toContain(crop);
    expect(realistic).toContain(crop);
    expect(realistic).toContain('data-preview-bleed-compensated="false"');
    expect(realistic).toContain('object-fit:fill');
  });

  it('preserves customer placement on realistic previews of unbaked artwork', () => {
    const html = renderToStaticMarkup(<StableBannerPreview widthIn={96} heightIn={48}
      grommets="none" imageUrl="https://example.com/original.jpg" surfaceOnly
      fitMode="fit" imageScale={0.8} imageScaleY={0.9} imagePosition={{ x: 5, y: -2 }} />);
    expect(html).toContain('transform:translate(5%, -2%) scale(0.8, 0.9)');
    expect(html).toContain('data-preview-bleed-compensated="false"');
  });

  it('does not alter the saved transform for non-finalized artwork', () => {
    const html = renderPreview(false);

    expect(html).toContain('data-preview-bleed-compensated="false"');
    expect(html).toContain('transform:translate(0%, 0%) scale(1, 1)');
    expect(html).not.toContain('transform:none');
  });

  it('honors a larger requested responsive preview size', () => {
    const html = renderPreview(true, 240);

    expect(html).toContain('width:240px');
  });
});
