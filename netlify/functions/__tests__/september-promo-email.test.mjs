import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import marketingToken from '../_shared/marketing-email-token.cjs';
import {
  buildSeptemberPromoEmail,
  SEPTEMBER_PROMO_DESIGN_URL,
  SEPTEMBER_PROMO_PREHEADER,
  SEPTEMBER_PROMO_SHOP_URL,
  SEPTEMBER_PROMO_SUBJECT,
} from '../../../src/lib/marketing/septemberPromoEmail.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('September promotional email', () => {
  const unsubscribeUrl = 'https://bannersonthefly.com/.netlify/functions/marketing-email-unsubscribe?token=p1.test';
  const email = buildSeptemberPromoEmail({ unsubscribeUrl });

  it('matches the approved offer, dates, subject, and preheader', () => {
    expect(email.subject).toBe('25% Off Large Banners — This Week Only');
    expect(SEPTEMBER_PROMO_SUBJECT).toBe(email.subject);
    expect(SEPTEMBER_PROMO_PREHEADER).toContain("6' × 3'");
    expect(email.html).toContain('25% OFF');
    expect(email.html).toContain('BIG25');
    expect(email.html).toContain('September 8, 2026');
    expect(email.html).toContain('Cannot be combined with other offers');
    expect(email.html).toContain('PO Box 369, Crestwood, KY 40014');
    expect(email.text).toContain("including 3' × 6'");
  });

  it('uses table-first responsive email markup and Outlook VML buttons', () => {
    expect(email.html).toContain('role="presentation"');
    expect(email.html).toContain('<v:roundrect');
    expect(email.html).toContain('@media only screen and (max-width:620px)');
    expect(email.html).toContain('x-apple-disable-message-reformatting');
    expect(email.html).not.toMatch(/display\s*:\s*(grid|flex)/i);
    expect(email.html).toContain(unsubscribeUrl.replace(/&/g, '&amp;'));
  });

  it('links both calls to action into a qualifying 6x3 banner flow', () => {
    expect(SEPTEMBER_PROMO_SHOP_URL).toContain('/google-ads-banner');
    expect(SEPTEMBER_PROMO_DESIGN_URL).toContain('/design?product=banner');
    expect(email.html).toContain(SEPTEMBER_PROMO_SHOP_URL.replace(/&/g, '&amp;'));
    expect(email.html).toContain(SEPTEMBER_PROMO_DESIGN_URL.replace(/&/g, '&amp;'));
    const googleAdsPage = readFileSync(`${root}/src/pages/GoogleAdsBanner.tsx`, 'utf8');
    const designPage = readFileSync(`${root}/src/pages/Design.tsx`, 'utf8');
    expect(googleAdsPage).toContain("useState('6')");
    expect(googleAdsPage).toContain("useState('3')");
    expect(designPage).toContain("useState('6')");
    expect(designPage).toContain("useState('3')");
  });

  it('ships email-client-safe JPEG versions of both realistic banner examples', () => {
    expect(existsSync(`${root}/public/images/email/september-football-banner.jpg`)).toBe(true);
    expect(existsSync(`${root}/public/images/email/september-grand-opening-banner.jpg`)).toBe(true);
    expect(email.html).toContain('september-football-banner.jpg');
    expect(email.html).toContain('september-grand-opening-banner.jpg');
  });

  it('creates stable opaque unsubscribe tokens per recipient and campaign', () => {
    const options = { secret: 'test-secret-with-enough-entropy' };
    const first = marketingToken.createMarketingUnsubscribeToken('Buyer@Example.com', 'september-large-banner-2026', options);
    const retry = marketingToken.createMarketingUnsubscribeToken('buyer@example.com', 'september-large-banner-2026', options);
    const other = marketingToken.createMarketingUnsubscribeToken('other@example.com', 'september-large-banner-2026', options);
    expect(first).toBe(retry);
    expect(first).not.toBe(other);
    expect(marketingToken.TOKEN_PATTERN.test(first)).toBe(true);
    expect(marketingToken.hashMarketingUnsubscribeToken(first)).toHaveLength(64);
  });
});
