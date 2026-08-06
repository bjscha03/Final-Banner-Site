import { describe, expect, it } from 'vitest';
import { getDisplayOrderTotalCents, getExpectedOrderTotalCents } from './order-totals';

describe('order total display and reporting ledger', () => {
  it('uses the stored payment total even when a legacy reconstruction is higher', () => {
    expect(getDisplayOrderTotalCents({
      subtotal_cents: 6000,
      tax_cents: 360,
      same_day_fee_cents: 509,
      total_cents: 6360,
    })).toBe(6360);
  });

  it('reconstructs a total only when a legacy row has no stored payment total', () => {
    const order = {
      subtotal_cents: 6000,
      tax_cents: 360,
      same_day_fee_cents: 509,
      total_cents: 0,
    };
    expect(getExpectedOrderTotalCents(order)).toBe(6869);
    expect(getDisplayOrderTotalCents(order)).toBe(6869);
  });
});
