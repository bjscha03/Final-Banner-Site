import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { getCartDisplayPrices, getEnteredPromoLabel } from './cartDisplayPricing';
import { resolveBestDiscount, getPromoDiscountSubtotalCents, type PromoDiscountInput } from './discount-resolver';
import CartLinePrice from '../components/cart/CartLinePrice';
const large = { id: 'large', product_type: 'banner', width_in: 72, height_in: 36, line_total_cents: 8100 };
const small = { id: 'small', product_type: 'banner', width_in: 48, height_in: 24, line_total_cents: 3600 };
const magnet = { id: 'magnet', product_type: 'car_magnet', width_in: 24, height_in: 18, line_total_cents: 5000 };
const promo: PromoDiscountInput = { code: '20OFF', discountPercentage: 20, discountScope: 'qualifying_small_banner_lines', campaign: 'small_banner_20_promo' };
const welcome: PromoDiscountInput = { code: 'NEW20', discountPercentage: 20 };
function resolve(items: typeof large[], code?: PromoDiscountInput) {
 const subtotalCents = items.reduce((s,i)=>s+i.line_total_cents,0);
 return resolveBestDiscount({ subtotalCents, quantity: 1, promoDiscount: code, promoSubtotalCents: getPromoDiscountSubtotalCents(items, subtotalCents, code) });
}
describe('cart and checkout displayed prices', () => {
 it('shows the same first-order discount in the item headline as the total', () => {
  const resolved = resolve([large],welcome);
  const price = getCartDisplayPrices([large],resolved,welcome).get('large')!;
  expect(price).toEqual({originalCents:8100,discountCents:1620,totalCents:6480});
  const html = renderToStaticMarkup(<CartLinePrice {...price} quantity={1} />);
  expect(html).toContain('<s>$81.00</s>');
  expect(html).toContain('$64.80');
  expect(html).not.toContain('$81.00 each');
  expect(getEnteredPromoLabel(welcome,resolved)).toBe('20% off first order applied');
 });
 it('does not reactivate the retired automatic large-banner promotion', () => {
  const resolved = resolve([large],promo);
  const price = getCartDisplayPrices([large],resolved,promo).get('large')!;
  expect(price).toEqual({originalCents:8100,discountCents:0,totalCents:8100});
  expect(getEnteredPromoLabel(promo,resolved)).toContain('no eligible items');
 });
 it('does not discount magnets when a small-banner code is applied', () => {
  const resolved = resolve([small,magnet],promo);
  const prices = getCartDisplayPrices([small,magnet],resolved,promo);
  expect(prices.get('small')?.totalCents).toBe(2880);
  expect(prices.get('magnet')?.totalCents).toBe(5000);
  expect(getEnteredPromoLabel(promo,resolved)).toContain('applied');
 });
 it('allocates odd cents exactly for the order-wide welcome offer', () => {
  const items = [{...large,line_total_cents:8101}, {...large,id:'second',line_total_cents:8101}, small];
  const resolved = resolve(items,welcome);
  const prices = [...getCartDisplayPrices(items,resolved,welcome).values()];
  expect(resolved.appliedDiscountAmountCents).toBe(3960);
  expect(prices.reduce((s,p)=>s+p.discountCents,0)).toBe(3960);
  expect(prices[2].discountCents).toBe(720);
 });
 it('reports no eligible items instead of claiming a discount', () => {
  expect(getEnteredPromoLabel(promo,resolve([magnet],promo))).toContain('no eligible items');
 });
});
