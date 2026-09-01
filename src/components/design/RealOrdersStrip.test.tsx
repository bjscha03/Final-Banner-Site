import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  deliveryProofImages,
  getDeliveryProofImageUrl,
} from '@/lib/deliveryProofImages';
import RealOrdersStrip from './RealOrdersStrip';

const STRIP_TRANSFORMATION = 'w_224,h_112,c_fill,g_auto,q_auto:eco,f_auto';

const countMatches = (source: string, pattern: RegExp): number =>
  source.match(pattern)?.length ?? 0;

describe('RealOrdersStrip', () => {
  it('renders the compact delivery proof contract with two allowlisted image sets', () => {
    const html = renderToStaticMarkup(<RealOrdersStrip />);
    const imageTags = html.match(/<img\b[^>]*>/g) ?? [];
    const imageSources = imageTags.map((tag) => {
      const match = tag.match(/\ssrc="([^"]+)"/);
      if (!match) throw new Error(`Delivery proof image is missing its source: ${tag}`);
      return match[1];
    });
    const allowedSources = deliveryProofImages.map((image) =>
      getDeliveryProofImageUrl(image, STRIP_TRANSFORMATION),
    );

    expect(html).toMatch(/^<section\b/);
    expect(html).toContain('data-real-orders-strip="true"');
    expect(html).toContain('aria-label="Real customer order delivery photos"');
    expect(html).toContain('Real orders');
    expect(html).toContain('delivered fast');

    expect(deliveryProofImages).toHaveLength(23);
    expect(new Set(allowedSources).size).toBe(23);
    expect(countMatches(html, /data-real-orders-strip-set="true"/g)).toBe(2);
    expect(imageTags).toHaveLength(46);
    expect(new Set(imageSources)).toEqual(new Set(allowedSources));

    for (const source of allowedSources) {
      expect(imageSources.filter((candidate) => candidate === source)).toHaveLength(2);
    }

    for (const tag of imageTags) {
      expect(tag).toContain('alt=""');
      expect(tag).toContain('width="112"');
      expect(tag).toContain('height="56"');
      expect(tag).toContain('loading="eager"');
      expect(tag).toContain('decoding="async"');
    }

    expect(countMatches(html, /<button\b/g)).toBe(1);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Pause delivery photos"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('is mounted once by each public configurator page', () => {
    const designSource = readFileSync(
      fileURLToPath(new URL('../../pages/Design.tsx', import.meta.url)),
      'utf8',
    );
    const googleAdsSource = readFileSync(
      fileURLToPath(new URL('../../pages/GoogleAdsBanner.tsx', import.meta.url)),
      'utf8',
    );

    for (const source of [designSource, googleAdsSource]) {
      expect(countMatches(source, /<RealOrdersStrip\s*\/>/g)).toBe(1);
      expect(countMatches(source, /import RealOrdersStrip from ['"]@\/components\/design\/RealOrdersStrip['"];?/g)).toBe(1);
    }
  });
});
