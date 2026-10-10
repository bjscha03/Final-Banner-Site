import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { calculateBannerPricing } from './bannerPricingEngine';
import { normalizeOrderItemDisplay } from './product-display';
import { cartEditUrl } from './cartEditUrl';
import { BANNER_MATERIALS } from './banner-materials';
import { calcTotals } from './pricing';
import { calculateOrderTotals } from './order-pricing';
import { resolvePromo } from './promoEngine';
import { PDFDocument } from 'pdf-lib';
const require = createRequire(import.meta.url);
const { repriceStripeCart } = require('../../netlify/functions/_shared/stripe-server-pricing.cjs');
const serverDisplay = require('../../netlify/functions/_shared/legacy/product-display-helpers.cjs');
const { prepareDoubleSidedBannerPdf } = require('../../netlify/functions/_shared/double-sided-banner-pdf.cjs');
const item = { id: 'double-1', product_type: 'banner', material: '18oz_double' as const, width_in: 60, height_in: 36, quantity: 1, grommets: 'none', rope_feet: 0, pole_pockets: 'none' };

describe('double-sided banner product', () => {
  it.each(['13oz', '15oz', '18oz', 'mesh', '18oz_double'] as const)('keeps designer, cart, and server prices equal for %s across sizes, quantities and finishing', (material) => {
    for (const [widthIn, heightIn] of [[6, 6], [60, 36], [72, 36], [75, 42], [36, 72], [120, 48]]) {
      for (const quantity of [1, 2, 5]) {
        for (const finish of [
          { addRope: false, ropePlacement: 'top', polePockets: 'none' },
          { addRope: true, ropePlacement: 'top', polePockets: 'none' },
          { addRope: true, ropePlacement: 'top-bottom', polePockets: 'none' },
          { addRope: false, ropePlacement: 'top', polePockets: 'left' },
          { addRope: false, ropePlacement: 'top', polePockets: 'top-bottom' },
        ] as const) {
          const input = { widthIn, heightIn, quantity, material, ...finish };
          const client = calculateBannerPricing(input);
          const cart = calcTotals({ ...input, qty: quantity });
          const [server] = repriceStripeCart([{
            ...item, material, width_in: widthIn, height_in: heightIn, quantity,
            rope_feet: client.ropeLinearFeet,
            rope_placement: finish.addRope ? finish.ropePlacement : null,
            pole_pockets: finish.polePockets,
            unit_price_cents: 1, line_total_cents: 1,
          }]);
          expect(server.line_total_cents).toBe(client.subtotalBeforeDiscountCents);
          expect(Math.round(cart.materialTotal * 100)).toBe(server.line_total_cents);
          expect(server.rope_cost_cents).toBe(client.ropeCostCents);
          expect(server.pole_pocket_cost_cents).toBe(client.polePocketCostCents);
        }
      }
    }
  });
  it.each([null, { code: 'NEW20', discountPercentage: 20 }, { code: 'Sarah30', discountPercentage: 30 }])('keeps the selected discount and tax calculation aligned after a side switch: %j', (promo) => {
    for (const material of ['13oz', '18oz_double', '15oz'] as const) {
      const [server] = repriceStripeCart([{ ...item, material, width_in: 72, height_in: 36, quantity: 3 }]);
      const display = resolvePromo({ subtotalCents: server.line_total_cents, quantity: 3, code: promo?.code, validatedPromo: promo, items: [server] });
      const order = calculateOrderTotals([server], promo);
      expect(order.applied_discount_cents).toBe(display.appliedDiscountAmountCents);
      expect(order.subtotal_after_discount_cents).toBe(server.line_total_cents - display.appliedDiscountAmountCents);
      expect(order.tax_cents).toBe(Math.round(order.subtotal_after_discount_cents * 0.06));
      expect(order.total_cents).toBe(order.subtotal_after_discount_cents + order.tax_cents);
    }
  });
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
    expect(cartEditUrl(item)).toBe('/design?product=banner&sides=double&editItem=double-1');
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
