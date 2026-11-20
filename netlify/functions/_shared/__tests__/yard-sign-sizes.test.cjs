const test = require('node:test');
const assert = require('node:assert/strict');
const { sizes, sheetSingleCents, sheetDoubleCents, findYardSignSize, validYardSignQuantity, yardSignSizeLabel } = require('../yard-sign-sizes.cjs');
const { repriceStripeCart } = require('../stripe-server-pricing.cjs');
const { computeTotals } = require('../checkoutTotals.cjs');
const expected = [
  ['24x18',24,18,10,90,1200,1400], ['12x18',18,12,20,180,800,1000],
  ['18x24',18,24,8,72,1300,1600], ['24x24',24,24,8,72,1400,1700], ['24x36',36,24,4,36,2000,2400],
];
const line = (s,q=s.minQuantity,side='single',stakes=false) => ({
  product_type:'yard_sign',width_in:s.widthIn,height_in:s.heightIn,material:'corrugated',quantity:q,
  yard_sign_sidedness:side,yard_sign_step_stakes_enabled:stakes,yard_sign_step_stakes_qty:stakes?q:0,
  yard_sign_designs:[{quantity:q}],unit_price_cents:1,line_total_cents:1,
});
test('supplier table, legacy SKU and conservative 24x36 layout are exact',()=>{
  assert.equal(sizes.length,5);
  assert.equal(sheetSingleCents,4400);assert.equal(sheetDoubleCents,5500);
  for(const [id,w,h,step,max,single,double] of expected){
    const s=sizes.find(s=>s.id===id);
    assert.deepEqual([s.widthIn,s.heightIn,s.minQuantity,s.increment,s.perSheet,s.maxQuantity,s.singleCents,s.doubleCents],[w,h,step,step,step,max,single,double]);
    assert.equal(findYardSignSize(w,h),s);assert.equal(yardSignSizeLabel({width_in:w,height_in:h}),s.label);
  }
  assert.notEqual(findYardSignSize(24,18),findYardSignSize(18,24));
  assert.equal(findYardSignSize(12,18),undefined);
});
for (const s of sizes) {
  test(`${s.id}: all nine full-sheet quantities, both sides, stakes and NEW20`,()=>{
    for(let q=s.minQuantity;q<=s.maxQuantity;q+=s.increment){
      assert.equal(validYardSignQuantity(q,s),true);
      for(const side of ['single','double']) for(const stakes of [false,true]){
        const [priced]=repriceStripeCart([line(s,q,side,stakes)]);
        const price=side==='double'?s.doubleCents:s.singleCents;
        assert.equal(priced.unit_price_cents,price);
        assert.equal(priced.line_total_cents,(price+(stakes?150:0))*q);
        assert.equal(priced.width_in,s.widthIn);assert.equal(priced.height_in,s.heightIn);
        const promotion={id:'NEW20_PROMO',code:'NEW20',discountPercentage:20,discountAmountCents:null,expiresAt:'2099-12-31T23:59:59Z',source:'new_customer',automaticFirstOrder:true};
        const totals=computeTotals([priced],0.06,{freeShipping:true},promotion);
        assert.equal(totals.applied_discount_cents,Math.round(priced.line_total_cents*.2));
        assert.equal((q/s.perSheet)*sheetSingleCents,4400*(q/s.increment));
        assert.equal((q/s.perSheet)*sheetDoubleCents,5500*(q/s.increment));
      }
    }
  });
  test(`${s.id}: partial sheets, below-min, over-max and fractional copies rejected`,()=>{
    for(const q of [0,-1,s.minQuantity-1,s.minQuantity+1,s.maxQuantity+1,s.maxQuantity+s.increment,NaN,Infinity,20.5]){
      assert.equal(validYardSignQuantity(q,s),false);
      assert.throws(()=>repriceStripeCart([line(s,q)]));
    }
  });
}
test('mixed size lines keep distinct prices, artwork counts and exact sizes',()=>{
  const output=repriceStripeCart(sizes.map(s=>({...line(s),yard_sign_designs:[{quantity:1},{quantity:s.minQuantity-1}]})));
  assert.equal(output.length,5);
  output.forEach((item,i)=>{assert.equal(item.unit_price_cents,sizes[i].singleCents);assert.equal(item.yard_sign_design_count,2)});
  assert.throws(()=>repriceStripeCart([{...line(sizes[1]),yard_sign_designs:[{quantity:19}]}]));
  assert.throws(()=>repriceStripeCart([{...line(sizes[0]),width_in:25}]));
});
