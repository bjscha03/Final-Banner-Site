import { afterEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { calcYardSignPricing, yardSignCartPricing } from './yard-sign-pricing';
import { useCartStore, type CartItem } from '@/store/cart';
import { FIRST_ORDER_DISCOUNT } from './firstOrderPromotion';
const { computeTotals } = createRequire(import.meta.url)('../../netlify/functions/_shared/checkoutTotals.cjs');
afterEach(()=>useCartStore.setState({items:[],discountCode:null}));
it('keeps sign and stake prices raw, with exactly one welcome reduction in cart and server checkout',()=>{
  const preview=calcYardSignPricing('double',10,true,10,.2);
  const line={id:'yard-first-order',product_type:'yard_sign',quantity:10,width_in:24,height_in:18,
    yard_sign_sidedness:'double',yard_sign_step_stakes_enabled:true,yard_sign_step_stakes_qty:10,
    ...yardSignCartPricing(preview)} as CartItem;
  useCartStore.setState({items:[line],discountCode:{...FIRST_ORDER_DISCOUNT},sameDayHitService:false,saturdayDelivery:false});
  const cart=useCartStore.getState();
  expect(cart.getSubtotalCents()).toBe(preview.subtotalCents);
  expect(cart.getResolvedDiscount().appliedDiscountAmountCents).toBe(preview.promoDiscountCents);
  const server=computeTotals([line],.06,{freeShipping:true},FIRST_ORDER_DISCOUNT);
  expect(server.applied_discount_cents).toBe(preview.promoDiscountCents);
  expect(cart.getTotalCents()).toBe(server.total_cents);
  cart.removeDiscountCode();
  expect(cart.getSubtotalCents()).toBe(preview.subtotalCents);
  expect(cart.getResolvedDiscount().appliedDiscountAmountCents).toBe(0);
});
