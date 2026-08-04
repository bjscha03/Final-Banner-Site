import { describe, expect, it } from 'vitest';
import type { Order } from '../orders/types';
import {
  formatReviewRequestSentAt,
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
