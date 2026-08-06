import { describe, expect, it } from 'vitest';
import { getSanitizedAnalyticsPath, getTrackingDecision, type TrackingContext } from './trackingPolicy';

const productionContext = (overrides: Partial<TrackingContext> = {}): TrackingContext => ({
  hostname: 'bannersonthefly.com',
  pathname: '/vinyl-banners',
  protocol: 'https:',
  webdriver: false,
  userAgent: 'Mozilla/5.0 Chrome/130 Safari/537.36',
  ...overrides,
});

describe('customer tracking policy', () => {
  it('allows a real production storefront visit', () => {
    expect(getTrackingDecision(productionContext())).toEqual({ allowed: true, reason: null });
  });

  it.each([
    ['admin', { pathname: '/admin/orders' }, 'excluded_route'],
    ['preview', { hostname: 'deploy-preview-123--site.netlify.app' }, 'non_production_host'],
    ['localhost', { hostname: 'localhost', protocol: 'http:' }, 'non_production_host'],
    ['automation', { webdriver: true }, 'automated_browser'],
    ['crawler', { userAgent: 'Mozilla/5.0 compatible; Googlebot/2.1' }, 'known_bot'],
  ])('blocks %s traffic', (_label, overrides, reason) => {
    expect(getTrackingDecision(productionContext(overrides))).toEqual({ allowed: false, reason });
  });

  it('keeps checkout and purchase-success customer traffic eligible', () => {
    expect(getTrackingDecision(productionContext({ pathname: '/checkout' })).allowed).toBe(true);
    expect(getTrackingDecision(productionContext({ pathname: '/payment-success' })).allowed).toBe(true);
  });

  it('redacts order and proof identifiers without dropping campaign parameters', () => {
    expect(getSanitizedAnalyticsPath({
      pathname: '/payment-success',
      search: '?orderId=secret&utm_source=google&gclid=click-1',
    })).toBe('/payment-success?utm_source=google&gclid=click-1');
    expect(getSanitizedAnalyticsPath({ pathname: '/proof/private-token', search: '' })).toBe('/proof/[token]');
  });
});
