import { describe, it, expect, afterEach } from 'vitest';
import { YARD_SIGN_SIZES, DEFAULT_YARD_SIGN_SIZE, getYardSignSize, findYardSignSize, normalizeYardSignQuantity, yardSignSizeLabel } from '../yard-sign-sizes';
import { calcYardSignPricing, validateYardSignQuantity, yardSignCartPricing, YARD_SIGN_WIDTH_IN, YARD_SIGN_HEIGHT_IN, YARD_SIGN_MIN_QUANTITY, YARD_SIGN_MAX_QUANTITY, YARD_SIGN_SINGLE_SIDED_CENTS, YARD_SIGN_DOUBLE_SIDED_CENTS } from '../yard-sign-pricing';
import { estimateOrderProfit } from '../admin-profit-estimate';
import { getDisplaySize, getItemDisplayName } from '../product-display';
import { validateProductConfiguration } from '../products/validation';
import { useCartStore, type CartItem } from '@/store/cart';
import { FIRST_ORDER_DISCOUNT } from '../firstOrderPromotion';
import type { Order } from '../orders/types';

afterEach(()=>useCartStore.setState({items:[],discountCode:null}));
it('keeps existing 24x18 defaults, prices and quantity rules',()=>{
 expect(DEFAULT_YARD_SIGN_SIZE.id).toBe('24x18');
 expect([YARD_SIGN_WIDTH_IN,YARD_SIGN_HEIGHT_IN,YARD_SIGN_MIN_QUANTITY,YARD_SIGN_MAX_QUANTITY,YARD_SIGN_SINGLE_SIDED_CENTS,YARD_SIGN_DOUBLE_SIDED_CENTS]).toEqual([24,18,10,90,1200,1400]);
 expect(calcYardSignPricing('double',10,true,10).subtotalCents).toBe(15500);
 expect(validateYardSignQuantity(15).message).toContain('increments of 10');
});
for(const size of YARD_SIGN_SIZES) describe(size.id,()=>{
 it('uses selected proportions, supplier labels and whole-sheet ranges',()=>{
   expect(findYardSignSize(size.widthIn,size.heightIn)).toBe(size);
   expect(validateProductConfiguration({productType:'yard_sign',widthIn:size.widthIn,heightIn:size.heightIn}).valid).toBe(true);
   for(let q=size.minQuantity;q<=size.maxQuantity;q+=size.increment)expect(validateYardSignQuantity(q,size).valid).toBe(true);
   for(const q of [0,size.minQuantity-1,size.minQuantity+1,size.maxQuantity+1,NaN,Infinity])expect(validateYardSignQuantity(q,size).valid).toBe(false);
   expect(normalizeYardSignQuantity(10,size)%size.perSheet).toBe(0);
   expect(normalizeYardSignQuantity(1000,size)).toBe(size.maxQuantity);
   expect(normalizeYardSignQuantity(0,size)).toBe(size.minQuantity);
   const item={product_type:'yard_sign',width_in:size.widthIn,height_in:size.heightIn};
   expect(yardSignSizeLabel(item)).toBe(size.label);
   expect(getDisplaySize(item)).toBe(size.label);
   expect(getItemDisplayName(item)).toContain(size.label);
 });
 it.each(['single','double'] as const)('prices %s with $1.50 stakes and NEW20 exactly once',side=>{
   const quantity=size.minQuantity;
   const pricing=calcYardSignPricing(side,quantity,true,quantity,.2,size);
   expect(pricing.unitPriceCents).toBe(side==='single'?size.singleCents:size.doubleCents);
   expect(pricing.stepStakeTotalCents).toBe(quantity*150);
   const item={id:size.id,product_type:'yard_sign',width_in:size.widthIn,height_in:size.heightIn,quantity,
     yard_sign_sidedness:side,yard_sign_step_stakes_enabled:true,yard_sign_step_stakes_qty:quantity,...yardSignCartPricing(pricing)} as CartItem;
   useCartStore.setState({items:[item],discountCode:{...FIRST_ORDER_DISCOUNT},sameDayHitService:false,saturdayDelivery:false});
   expect(useCartStore.getState().getSubtotalCents()).toBe(pricing.subtotalCents);
   expect(useCartStore.getState().getResolvedDiscount().appliedDiscountAmountCents).toBe(pricing.promoDiscountCents);
 });
 it.each(['single','double'] as const)('uses flat per-sheet supplier cost for %s',side=>{
   const order={id:'test',status:'paid',currency:'usd',created_at:'2026-11-02',subtotal_cents:0,tax_cents:0,total_cents:0,
     items:[{product_type:'yard_sign',material:'corrugated',width_in:size.widthIn,height_in:size.heightIn,quantity:size.perSheet*2,yard_sign_sidedness:side,line_total_cents:50000}]} as Order;
   const profit=estimateOrderProfit(order);
   expect(profit.needsReview).toBe(false);
   expect(profit.productionCostCents).toBe(side==='single'?8800:11000);
 });
});
it('does not conflate portrait 18x24 with the unchanged 24x18 landscape SKU',()=>{
 expect(getYardSignSize('18x24').orientation).toBe('portrait');
 expect(getYardSignSize('24x18').singleCents).toBe(1200);
 expect(getYardSignSize('18x24').singleCents).toBe(1300);
 expect(getYardSignSize('12x18').widthIn/getYardSignSize('12x18').heightIn).toBe(1.5);
 expect(getYardSignSize('24x36').widthIn/getYardSignSize('24x36').heightIn).toBe(1.5);
 expect(normalizeYardSignQuantity(4,getYardSignSize('24x36'),10)).toBe(12);
 expect(()=>getYardSignSize('unsupported')).toThrow();
});
