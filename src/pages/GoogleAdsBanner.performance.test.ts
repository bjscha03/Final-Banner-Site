import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('Google Ads landing-page performance guardrails', () => {
  it('serves finishing photos as responsive lazy Cloudinary derivatives', () => {
    const source = readSource('../components/design/FinishingOptionsCard.tsx');
    const paidPage = readSource('./GoogleAdsBanner.tsx');
    const regularDesigner = readSource('./Design.tsx');

    expect(source).toContain('f_auto/q_auto:eco/c_limit/w_${width}');
    expect(source).toContain('srcSet={optimizeImageDelivery ? imageSrc.srcSet : undefined}');
    expect(source).toContain("loading={optimizeImageDelivery ? 'lazy' : undefined}");
    expect(source).toContain("decoding={optimizeImageDelivery ? 'async' : undefined}");
    expect(paidPage).toContain('optimizeImageDelivery');
    expect(regularDesigner).not.toContain('optimizeImageDelivery');
  });

  it('prerenders the paid route without making it indexable', () => {
    const source = readSource('../entry-server.tsx');

    expect(source).toContain("performancePrerenderRoutes = ['/google-ads-banner']");
    expect(source).not.toMatch(/indexablePrerenderRoutes\s*=\s*\[[\s\S]*google-ads-banner/);
  });

  it('preloads the paid headline font before the route bundle runs', () => {
    const source = readSource('../../index.html');

    expect(source).toContain("routePath === '/google-ads-banner'");
    expect(source).toContain('fonts.gstatic.com/s/bebasneue/');
    expect(source).toContain("headlineFont.as = 'font'");
  });

  it('handles Netlify trailing slashes and product variants without a redirect', () => {
    const shell = readSource('../../index.html');
    const main = readSource('../main.tsx');
    const redirects = readSource('../../public/_redirects');

    expect(shell).toContain("const routePath = window.location.pathname.replace(/\\/+$/, '') || '/'");
    expect(main).toContain("const normalizedPathname = window.location.pathname.replace(/\\/+$/, '') || '/'");
    expect(main).toContain("normalizedPathname === '/google-ads-banner'");
    expect(redirects).toContain('/google-ads-banner   /google-ads-banner/index.html   200!');
  });

  it('keeps persisted cart and live countdown state out of the hydration frame', () => {
    const source = readSource('./GoogleAdsBanner.tsx');

    expect(source).toContain('const cartItemCount = hasHydratedClientState ? persistedCartItemCount : 0');
    expect(source).toContain('showLiveDelivery={hasHydratedClientState}');
    expect(source.match(/hasHydratedClientState \? \(/g)).toHaveLength(3);
    expect(source.match(/hasHydratedClientState && \(/g)).toHaveLength(2);
  });

  it('keeps the primary hero CTA usable before JavaScript hydrates', () => {
    const source = readSource('./GoogleAdsBanner.tsx');

    expect(source).toContain('href="#order-builder"');
    expect(source).toContain('event.preventDefault()');
  });
});
