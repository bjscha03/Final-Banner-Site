import { describe, expect, it } from 'vitest';
import {
  EMPTY_ABANDONED_CART_FILTERS,
  filterAndSortAbandonedCarts,
  isRecoveryEmailEligible,
  summarizeAbandonedCarts,
  summarizeOutcomeComparison,
  type AbandonedCartAdminRecord,
} from './abandoned-cart-admin';

const cart = (overrides: Partial<AbandonedCartAdminRecord> = {}): AbandonedCartAdminRecord => ({
  id: 'cart-1',
  user_id: null,
  session_id: 'guest-session',
  customer_kind: 'guest',
  customer_first_name: null,
  customer_last_name: null,
  email: 'shopper@example.com',
  phone: null,
  item_count: 1,
  source_item_count: 1,
  stored_item_count: 1,
  snapshot_completeness: 'complete',
  item_quantity: 2,
  item_summaries: [{
    product_type: 'banner',
    width_in: 48,
    height_in: 24,
    dimensions: '48″ × 24″',
    area_sqft: 8,
    material: '13oz',
    quantity: 2,
    line_total_cents: 6000,
    has_artwork: true,
  }],
  subtotal_cents: 6000,
  discount_cents: 600,
  tax_cents: 324,
  estimated_total_cents: 5724,
  captured_value_cents: 5724,
  total_value: 57.24,
  currency: 'USD',
  checkout_stage: 'contact',
  has_artwork: true,
  recovery_status: 'abandoned',
  recovery_emails_sent: 1,
  discount_code: null,
  last_recovery_email_at: '2026-08-15T14:00:00.000Z',
  recovery_suppressed_at: null,
  recovery_suppression_reason: null,
  last_activity_at: '2026-08-15T13:00:00.000Z',
  abandoned_at: '2026-08-15T14:00:00.000Z',
  recovered_at: null,
  recovered_order_id: null,
  created_at: '2026-08-15T12:00:00.000Z',
  first_item_thumbnail: null,
  ...overrides,
});

describe('abandoned-cart admin analytics', () => {
  it('filters by captured date, size, value, stage, email presence, and status', () => {
    const matching = cart();
    const other = cart({
      id: 'cart-2',
      email: null,
      checkout_stage: 'cart',
      recovery_status: 'active',
      estimated_total_cents: 2000,
      created_at: '2026-07-01T12:00:00.000Z',
      item_summaries: [{ ...matching.item_summaries[0], width_in: 96, dimensions: '96″ × 24″' }],
    });

    const result = filterAndSortAbandonedCarts([other, matching], {
      ...EMPTY_ABANDONED_CART_FILTERS,
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      sizeQuery: '48x24',
      minValue: '50',
      maxValue: '60',
      checkoutStage: 'contact',
      emailPresence: 'with_email',
      recoveryStatus: 'abandoned',
    }, 'activity_desc');

    expect(result.map((entry) => entry.id)).toEqual(['cart-1']);
  });

  it('sorts by estimated value without mutating the input array', () => {
    const low = cart({ id: 'low', estimated_total_cents: 2000, captured_value_cents: 2000 });
    const high = cart({ id: 'high', estimated_total_cents: 9000, captured_value_cents: 9000 });
    const input = [low, high];

    const result = filterAndSortAbandonedCarts(input, EMPTY_ABANDONED_CART_FILTERS, 'value_desc');

    expect(result.map((entry) => entry.id)).toEqual(['high', 'low']);
    expect(input.map((entry) => entry.id)).toEqual(['low', 'high']);
  });

  it('labels recovered-after-email as correlation and computes full facets', () => {
    const recovered = cart({
      id: 'recovered',
      recovery_status: 'recovered',
      recovery_emails_sent: 2,
      recovered_order_id: 'order-retained',
      recovered_order_status: 'paid',
      recovered_revenue_state: 'retained',
    });
    const suppressed = cart({
      id: 'suppressed',
      recovery_suppression_reason: 'unsubscribed',
      recovery_suppressed_at: '2026-08-15T14:30:00.000Z',
    });
    const directPurchase = cart({
      id: 'direct-purchase',
      recovery_status: 'recovered',
      recovery_emails_sent: 0,
      abandoned_at: null,
      captured_value_cents: 90_000,
      item_summaries: [{ ...cart().item_summaries[0], dimensions: '120″ × 60″', width_in: 120, height_in: 60 }],
      checkout_stage: 'payment_started',
    });

    const summary = summarizeAbandonedCarts([recovered, suppressed, directPurchase]);

    expect(summary.recoveredCount).toBe(1);
    expect(summary.recoveredRetainedCount).toBe(1);
    expect(summary.recoveredRefundedCount).toBe(0);
    expect(summary.recoveredRevenueUnknownCount).toBe(0);
    expect(summary.recoveredValueCents).toBe(5724);
    expect(summary.recoveredAfterEmailCount).toBe(1);
    expect(summary.recoveredAfterEmailRetainedCount).toBe(1);
    expect(summary.recoveredAfterEmailValueCents).toBe(5724);
    expect(summary.suppressedCount).toBe(1);
    expect(summary.abandonmentCohortCount).toBe(2);
    expect(summary.topSizes).toEqual([{ label: '48″ × 24″', count: 2 }]);
    expect(summary.valueBands).toEqual([{ label: '$50–$99', count: 2 }]);
    expect(summary.checkoutStages).toEqual([{ label: 'contact', count: 2 }]);
  });

  it('keeps recovery events but excludes refunded and historically unknown links from retained value', () => {
    const retained = cart({
      id: 'retained',
      recovery_status: 'recovered',
      recovered_order_id: 'order-retained',
      recovered_order_status: 'fulfilled',
      recovered_revenue_state: 'retained',
      captured_value_cents: 10_000,
    });
    const refunded = cart({
      id: 'refunded',
      recovery_status: 'recovered',
      recovered_order_id: 'order-refunded',
      recovered_order_status: 'refunded',
      recovered_revenue_state: 'refunded',
      captured_value_cents: 20_000,
    });
    const historicalUnknown = cart({
      id: 'historical-unknown',
      recovery_status: 'recovered',
      recovered_order_id: null,
      recovered_order_status: null,
      recovered_revenue_state: 'unknown',
      captured_value_cents: 30_000,
    });

    const summary = summarizeAbandonedCarts([retained, refunded, historicalUnknown]);

    expect(summary.recoveredCount).toBe(3);
    expect(summary.recoveredRetainedCount).toBe(1);
    expect(summary.recoveredRefundedCount).toBe(1);
    expect(summary.recoveredRevenueUnknownCount).toBe(1);
    expect(summary.recoveredValueCents).toBe(10_000);
    expect(summary.recoveredAfterEmailCount).toBe(3);
    expect(summary.recoveredAfterEmailRetainedCount).toBe(1);
    expect(summary.recoveredAfterEmailValueCents).toBe(10_000);
  });

  it('compares mutually exclusive post-rollout terminal outcomes once per cart', () => {
    const terminal = (id: string, outcome: 'abandoned' | 'completed', overrides: Partial<AbandonedCartAdminRecord> = {}) => cart({
      id,
      checkout_stage: 'contact',
      checkout_stage_updated_at: '2026-09-01T10:00:00.000Z',
      recovery_status: outcome === 'abandoned' ? 'abandoned' : 'recovered',
      abandoned_at: outcome === 'abandoned' ? '2026-09-01T11:00:00.000Z' : null,
      recovered_at: outcome === 'completed' ? '2026-09-01T11:00:00.000Z' : null,
      ...overrides,
    });
    const smallItems = [{ ...cart().item_summaries[0], area_sqft: 8, width_in: 48, height_in: 24 }];
    const largeMixedItems = [
      { ...cart().item_summaries[0], area_sqft: 8, width_in: 48, height_in: 24 },
      { ...cart().item_summaries[0], area_sqft: 18, width_in: 72, height_in: 36 },
    ];
    const records = [
      ...Array.from({ length: 10 }, (_, index) => terminal(`small-a-${index}`, 'abandoned', { item_summaries: smallItems, captured_value_cents: 6000 })),
      ...Array.from({ length: 10 }, (_, index) => terminal(`small-c-${index}`, 'completed', { item_summaries: smallItems, captured_value_cents: 6000 })),
      terminal('large-a', 'abandoned', { item_summaries: largeMixedItems, captured_value_cents: 60_000 }),
      terminal('large-c', 'completed', { item_summaries: largeMixedItems, captured_value_cents: 60_000 }),
      terminal('poster-excluded-from-banner-size', 'completed', {
        item_summaries: [{ ...cart().item_summaries[0], product_type: 'poster', area_sqft: 24, width_in: 72, height_in: 48 }],
        captured_value_cents: 30_000,
      }),
      terminal('active-censored', 'completed', { recovery_status: 'active', abandoned_at: null }),
      terminal('historical-unknown', 'abandoned', { checkout_stage_updated_at: null }),
    ];

    const comparison = summarizeOutcomeComparison(records);

    expect(comparison.terminalSampleSize).toBe(23);
    expect(comparison.valueClassifiedSampleSize).toBe(23);
    expect(comparison.sizeClassifiedSampleSize).toBe(22);
    expect(comparison.sizeBands[0]).toMatchObject({
      key: 'small_medium',
      abandonedCount: 10,
      completedCount: 10,
      sampleSize: 20,
      abandonmentRate: 0.5,
      sufficientSample: true,
    });
    expect(comparison.sizeBands[1]).toMatchObject({
      key: 'large_plus',
      abandonedCount: 1,
      completedCount: 1,
      sampleSize: 2,
      abandonmentRate: null,
      sufficientSample: false,
    });
    expect(comparison.valueBands.find((band) => band.key === '$50–$99')).toMatchObject({ sampleSize: 20, abandonmentRate: 0.5 });
    expect(comparison.valueBands.find((band) => band.key === '$500+')).toMatchObject({ sampleSize: 2, abandonmentRate: null });
  });

  it('disables recovery for missing email, completed, expired, and suppressed carts', () => {
    expect(isRecoveryEmailEligible(cart())).toBe(true);
    expect(isRecoveryEmailEligible(cart({ recovery_status: 'active', abandoned_at: null }))).toBe(false);
    expect(isRecoveryEmailEligible(cart({ email: null }))).toBe(false);
    expect(isRecoveryEmailEligible(cart({ recovery_status: 'recovered' }))).toBe(false);
    expect(isRecoveryEmailEligible(cart({ recovery_status: 'expired' }))).toBe(false);
    expect(isRecoveryEmailEligible(cart({ recovery_suppression_reason: 'hard_bounce' }))).toBe(false);
  });
});
