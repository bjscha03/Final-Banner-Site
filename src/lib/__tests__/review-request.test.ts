import { describe, expect, it } from 'vitest';
import type { Order } from '../orders/types';
import {
  formatReviewRequestSentAt,
  getFinalReviewAvailableAt,
  shouldHideReviewRequests,
  getReviewRequestCustomerEmail,
  getReviewRequestEligibility,
  isValidReviewRequestEmail,
} from '../review-request';

const order = {
  id: '2ad3018b-680a-463e-b761-9fdcf8a0d993',
  user_id: null,
  email: 'review-test@example.com',
  review_request_customer_email: 'canonical@example.com',
  status: 'paid',
  subtotal_cents: 2000,
  tax_cents: 120,
  total_cents: 2120,
  currency: 'usd',
  created_at: '2026-08-03T20:00:00.000Z',
  items: [],
  payment_method: 'paypal',
  paypal_capture_id: 'capture-test',
  payment_reconciliation_status: 'complete',
} satisfies Order;

describe('Admin review-request presentation rules', () => {
  it('disables review requests after a partial refund even if an earlier email was sent', () => {
    const eligibility = getReviewRequestEligibility({ ...order, partial_refund_cents: 1, review_request_last_sent_at: '2026-09-01' });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toMatch(/partial refund/);
  });
  it('uses the server-resolved canonical customer email', () => {
    expect(getReviewRequestCustomerEmail(order)).toBe('canonical@example.com');
    expect(isValidReviewRequestEmail('bad address')).toBe(false);
  });

  it('allows paid lifecycle orders and disables ineligible orders', () => {
    expect(getReviewRequestEligibility(order).eligible).toBe(true);
    expect(getReviewRequestEligibility({ ...order, status: 'shipped' }).eligible).toBe(true);
    expect(getReviewRequestEligibility({ ...order, status: 'pending', paypal_capture_id: null }).eligible).toBe(false);
    expect(getReviewRequestEligibility({ ...order, status: 'failed' }).eligible).toBe(false);
    expect(getReviewRequestEligibility({ ...order, status: 'paid', is_test_order: true }).eligible).toBe(false);
  });

  it('formats the persisted latest-send timestamp and handles invalid values', () => {
    expect(formatReviewRequestSentAt('2026-08-03T20:42:00.000Z')).toContain('2026');
    expect(formatReviewRequestSentAt('not-a-date')).toBe('');
  });
});

it('final attempt uses exactly 72 hours and rejects missing or invalid second timestamps', () => {
  expect(getFinalReviewAvailableAt('2026-10-23T12:00:00Z')).toBe(Date.parse('2026-10-26T12:00:00Z'));
  expect(getFinalReviewAvailableAt(null)).toBe(null);
  expect(getFinalReviewAvailableAt('invalid')).toBe(null);
});
it('hides all review controls for refunded orders and completed customers', () => {
  expect(shouldHideReviewRequests(order)).toBe(false);
  expect(shouldHideReviewRequests({ ...order, status: 'refunded' })).toBe(true);
  expect(shouldHideReviewRequests({ ...order, partial_refund_cents: 1 })).toBe(true);
  expect(shouldHideReviewRequests({ ...order, review_customer_completed: true })).toBe(true);
  expect(getReviewRequestEligibility({ ...order, review_customer_completed: true }).eligible).toBe(false);
  expect(getReviewRequestEligibility({ ...order, review_state_unavailable: true }).eligible).toBe(false);
});
