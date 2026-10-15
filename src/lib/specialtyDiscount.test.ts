import {describe,it,expect} from 'vitest';
import {getPromoDiscountSubtotalCents,resolveBestDiscount} from './discount-resolver';
describe('specialty promotion ceiling',()=>{
  it('uses 20% and an accurate label for a 30% code, including a saved promo object',()=>{
    const promo={code:'SARAH30',discountPercentage:30};
    const specialty={id:'s',product_type:'specialty',width_in:47,height_in:81,line_total_cents:44900};
    const base=getPromoDiscountSubtotalCents([specialty],44900,promo);
    const result=resolveBestDiscount({subtotalCents:44900,quantity:1,quantitySubtotalCents:0,promoDiscount:promo,promoSubtotalCents:base});
    expect(result.appliedDiscountAmountCents).toBe(8980);
    expect(result.appliedDiscountLabel).toBe('SARAH30 (20% off)');
    expect(promo.discountPercentage).toBe(30);
    const banner={...specialty,product_type:'banner'};
    const newBase=getPromoDiscountSubtotalCents([banner],44900,promo);
    expect(resolveBestDiscount({subtotalCents:44900,quantity:1,promoDiscount:promo,promoSubtotalCents:newBase}).appliedDiscountAmountCents).toBe(13470);
  });
  it('limits fixed coupons in a mixed cart without stacking a quantity discount',()=>{
    const items=[{id:'s',product_type:'specialty',width_in:47,height_in:81,line_total_cents:44900},{id:'b',product_type:'banner',width_in:24,height_in:12,line_total_cents:10000}];
    const promo={code:'CREDIT',discountAmountCents:40000};
    const base=getPromoDiscountSubtotalCents(items,54900,promo);
    const result=resolveBestDiscount({subtotalCents:54900,quantity:5,quantitySubtotalCents:10000,promoDiscount:promo,promoSubtotalCents:base});
    expect(result.appliedDiscountAmountCents).toBe(10980);
    expect(result.appliedDiscountLabel).toBe('CREDIT ($109.80 off)');
  });
});
