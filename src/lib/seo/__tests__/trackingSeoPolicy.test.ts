import { describe, expect, it } from 'vitest';
import robots from '../../../../public/robots.txt?raw';
import netlify from '../../../../netlify.toml?raw';
import html from '../../../../index.html?raw';
import sitemap from '../../../../public/sitemap.xml?raw';
import appSource from '../../../App.tsx?raw';
import socialMetaSource from '../../../../netlify/edge-functions/social-meta-injector.ts?raw';
import redirects from '../../../../public/_redirects?raw';
import retiredEndpoint from '../../../../netlify/functions/_shared/retired-campaign-endpoint.mjs?raw';
import retiredDesignerIntake from '../../../../netlify/functions/designer-intake-submit.mjs?raw';
import retiredProofApprove from '../../../../netlify/functions/graduation-proof-approve.mjs?raw';
import retiredProofGet from '../../../../netlify/functions/graduation-proof-get.mjs?raw';
import retiredProofEdits from '../../../../netlify/functions/graduation-proof-request-edits.mjs?raw';
import retiredDepositCapture from '../../../../netlify/functions/paypal-capture-design-deposit.mjs?raw';
import retiredFinalCapture from '../../../../netlify/functions/paypal-capture-final-product.mjs?raw';
import retiredDepositCreate from '../../../../netlify/functions/paypal-create-deposit-for-intake.mjs?raw';

describe('tracking and private-route SEO policy', () => {
  it('applies admin and proof crawl exclusions to specific crawler groups', () => {
    for (const agent of ['Googlebot', 'Bingbot']) {
      const group = robots.split(`User-agent: ${agent}`)[1]?.split('User-agent:')[0] || '';
      expect(group).toContain('Disallow: /admin');
      expect(group).toContain('Disallow: /proof');
    }
  });

  it('adds response-level noindex protection for private routes', () => {
    for (const route of ['/admin/*', '/orders/*', '/proof/*', '/checkout', '/payment-success']) {
      expect(netlify).toContain(`for = "${route}"`);
    }
    expect(netlify).toContain('X-Robots-Tag = "noindex, nofollow, noarchive, nosnippet, noimageindex"');
  });

  it('does not hardcode analytics scripts into the universal HTML shell', () => {
    expect(html).not.toContain('gtag(\'config\'');
    expect(html).not.toContain('fbq(\'init\'');
    expect(html).not.toContain('clarity.ms/tag');
    expect(html).not.toContain('t.contentsquare.net/uxa');
  });

  it('removes the retired seasonal campaign while redirecting old URLs', () => {
    expect(appSource).not.toContain('GraduationSigns');
    expect(appSource).not.toContain('ProofApproval');
    expect(sitemap).not.toContain('/graduation-signs');
    expect(socialMetaSource).not.toContain('graduation-signs');
    expect(netlify).toContain('from = "/graduation-signs"');
    expect(netlify).toContain('to = "/custom-banners"');
    expect(redirects).toContain('/graduation-signs     /custom-banners   301!');
    expect(redirects.indexOf('/graduation-signs')).toBeLessThan(redirects.indexOf('/*    /index.html'));

    expect(retiredEndpoint).toContain('statusCode: 410');
    expect(retiredEndpoint).not.toContain('paypal');
    expect(retiredEndpoint).not.toContain('database');
    for (const retiredFunction of [
      retiredDesignerIntake,
      retiredProofApprove,
      retiredProofGet,
      retiredProofEdits,
      retiredDepositCapture,
      retiredFinalCapture,
      retiredDepositCreate,
    ]) {
      expect(retiredFunction.trim()).toBe("export { handler } from './_shared/retired-campaign-endpoint.mjs';");
    }
  });
});
