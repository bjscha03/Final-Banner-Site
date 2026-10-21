'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createTeamCode,getTeamPromotion}=require('../_shared/daniel-team-promotion.cjs');
const {validateDiscountForCheckout}=require('../_shared/discount-validation.cjs');
const {computeTotals}=require('../_shared/checkoutTotals.cjs');
const reservation=require('../_shared/payment-discount-reservation.cjs');
const {capSpecialtyPromotion}=require('../../../shared/specialty-discount-policy.cjs');
process.env.DANIEL_PROMO_SIGNING_SECRET='test-only-team-offer-key-at-least-32-characters';
const noSql=async()=>{throw Error('Unlimited codes must not consume stored coupons');};
test('company codes authenticate the business name and fail closed on tampering or missing keys',()=>{
 const code=createTeamCode('Paristown');assert.match(code,/^PARISTOWN25-[A-F0-9]{12}$/);
 assert.equal(getTeamPromotion(' '+code.toLowerCase()+' ').discountPercentage,25);
 assert.equal(getTeamPromotion(code.replace('PARISTOWN','ANOTHER')),null);
 assert.equal(getTeamPromotion(code.replace('25-','50-')),null);
 assert.equal(getTeamPromotion(code,{}),null);
 assert.equal(createTeamCode('Paristown'),code);
});
test('sitewide 25 percent survives repeat uses, other locations, mixed carts and specialty cap',async()=>{
 const code=createTeamCode('Louisville Test Team');
 for(const email of ['first@example.com','first@example.com','location-two@example.com']){
  const result=await validateDiscountForCheckout({sql:noSql,code,email,now:new Date('2200-01-01')});
  assert.equal(result.valid,true);assert.equal(result.discount.expiresAt,null);
  for(const product_type of ['banner','yard_sign','car_magnet','specialty']){
   const items=[{id:'item',product_type,width_in:72,height_in:36,line_total_cents:10000,quantity:1}];
   const totals=computeTotals(items,0.06,{minFloorCents:0,freeShipping:true},result.discount);
   assert.equal(totals.applied_discount_cents,2500,product_type);assert.equal(totals.applied_promo_code,code);
  }
  const order={id:email,discount_code:code,applied_discount_type:'promo',applied_discount_cents:2500};
  assert.deepEqual(await reservation.claimPaymentDiscount(noSql,order),{ok:true,claimed:false,kind:'reusable_promotion'});
  assert.deepEqual(await reservation.completePaymentDiscount(noSql,order),{ok:true,kind:'not_stored'});
 }
 const other=capSpecialtyPromotion([{product_type:'specialty'}],10000,{discountPercentage:30,discountScope:'order'});
 assert.equal(other.discountPercentage,20);
});
