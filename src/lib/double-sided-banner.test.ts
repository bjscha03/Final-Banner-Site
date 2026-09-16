import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { calculateBannerPricing } from './bannerPricingEngine';
import { normalizeOrderItemDisplay } from './product-display';
import { cartEditUrl } from './cartEditUrl';
import { BANNER_MATERIALS } from './banner-materials';
import { PDFDocument } from 'pdf-lib';
const require = createRequire(import.meta.url);
const { repriceStripeCart } = require('../../netlify/functions/_shared/stripe-server-pricing.cjs');
const serverDisplay = require('../../netlify/functions/_shared/legacy/product-display-helpers.cjs');
const { prepareDoubleSidedBannerPdf } = require('../../netlify/functions/_shared/double-sided-banner-pdf.cjs');
const item = { id: 'double-1', product_type: 'banner', material: '18oz_double' as const, width_in: 60, height_in: 36, quantity: 1, grommets: 'none', rope_feet: 0, pole_pockets: 'none' };

describe('double-sided banner product', () => {
  it('charges $93.75 for 5x3 including both sides on client and server, ignoring a tampered price', () => {
    const client = calculateBannerPricing({ widthIn: 60, heightIn: 36, quantity: 1, material: item.material, addRope: false });
    const [server] = repriceStripeCart([{ ...item, unit_price_cents: 1, line_total_cents: 1 }]);
    expect(client.unitBasePriceCents).toBe(9375);
    expect(client.subtotalBeforeDiscountCents).toBe(server.line_total_cents);
    expect(server.unit_price_cents).toBe(9375);
    expect(server.material).toBe('18oz_double');
  });
  it('keeps finishing prices in parity for multiple double-sided banners', () => {
    const client = calculateBannerPricing({ widthIn: 60, heightIn: 36, quantity: 2, material: item.material, addRope: true, ropePlacement: 'top-bottom', polePockets: 'top-bottom' });
    const [server] = repriceStripeCart([{ ...item, quantity: 2, rope_placement: 'top-bottom', pole_pockets: 'top-bottom' }]);
    expect(client.subtotalBeforeDiscountCents).toBe(server.line_total_cents);
    expect(server.line_total_cents).toBe(28250);
  });
  it('preserves single-sided 18oz pricing and keeps the double-sided SKU out of the material picker', () => {
    expect(repriceStripeCart([{ ...item, material: '18oz' }])[0].unit_price_cents).toBe(11250);
    expect(BANNER_MATERIALS.some(m => m.mapped === '18oz_double')).toBe(false);
    expect(repriceStripeCart([{ ...item, width_in: 12, height_in: 12 }])[0].unit_price_cents).toBe(2000);
  });
  it('labels the product and printing consistently in checkout, admin and email', () => {
    for (const display of [normalizeOrderItemDisplay(item), serverDisplay.normalizeOrderItemDisplay(item)]) {
      expect(display.displayName).toBe('Double-Sided Banner 60" × 36"');
      expect(display.printDisplay).toContain('Double-Sided');
      expect(display.materialDisplay).toContain('Same artwork on both sides');
    }
    expect(cartEditUrl(item)).toBe('/double-sided-banners?editItem=double-1');
    expect(cartEditUrl({ ...item, material: '18oz' })).toBe('/design?product=banner&editItem=double-1');
  });
  it('exports two full-size print faces without changing single-sided print files', async () => {
    const doc = await PDFDocument.create(); doc.addPage([60 * 72, 36 * 72]);
    const original = Buffer.from(await doc.save());
    expect(await prepareDoubleSidedBannerPdf(original, '18oz')).toBe(original);
    const result = await PDFDocument.load(await prepareDoubleSidedBannerPdf(original, '18oz_double'));
    expect(result.getPageCount()).toBe(2);
    for (const page of result.getPages()) expect(page.getSize()).toEqual({ width: 4320, height: 2592 });
  });
});
