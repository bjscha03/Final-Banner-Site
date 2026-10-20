import { describe, it, expect } from 'vitest';
import { specialtyDisplayPrice, productDisplayPrice } from './specialtyDisplayPrice';

describe('specialty displayed price matches order promotion rules', () => {
  it('applies NEW20 once to the full quantity including selected options', () => {
    const price = specialtyDisplayPrice(44900 * 3, { code:'NEW20', discountPercentage:20 });
    expect(price).toEqual({ totalCents:107760, discountCents:26940, label:'20% off applied' });
  });
  it('returns the full price when eligibility removes the offer', () => {
    expect(specialtyDisplayPrice(44900, null)).toEqual({ totalCents:44900, discountCents:0, label:null });
  });
  it('preserves the specialty 20% ceiling for another code', () => {
    expect(specialtyDisplayPrice(44900, { code:'SARAH30', discountPercentage:30 }).totalCents).toBe(35920);
  });
  it('does not apply a banner-only code to a display', () => {
    expect(specialtyDisplayPrice(44900, { code:'20OFF', discountPercentage:20, discountScope:'qualifying_small_banner_lines' }).discountCents).toBe(0);
  });
});

it('yard signs and magnets apply NEW20 to their own base price without banner quantity tiers',()=>{
  for(const productType of ['yard_sign','car_magnet'] as const) {
    expect(productDisplayPrice(9975,{code:'NEW20',discountPercentage:20},productType).totalCents).toBe(7980);
    expect(productDisplayPrice(9975,{code:'20OFF',discountPercentage:20,discountScope:'qualifying_small_banner_lines'},productType).discountCents).toBe(0);
  }
});
