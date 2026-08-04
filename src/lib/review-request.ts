import type { Order } from './orders/types';

const ELIGIBLE_PAID_STATUSES = new Set(['paid', 'in_production', 'shipped']);

const normalize = (value: unknown): string => String(value || '').trim().toLowerCase();

export const isValidReviewRequestEmail = (value: unknown): boolean => {
  const email = normalize(value);
  return Boolean(email && email.length <= 254 && !/\s/.test(email) && /^[^@]+@[^@]+\.[^@]+$/.test(email));
};

export const getReviewRequestCustomerEmail = (order: Order): string => {
  const candidates = [order.review_request_customer_email, order.email];
  return candidates.map(normalize).find(isValidReviewRequestEmail) || '';
};

export const getReviewRequestEligibility = (order: Order): { eligible: boolean; reason: string; customerEmail: string } => {
  const paymentMethod = normalize(order.payment_method);
  if (order.is_test_order === true || paymentMethod === 'admin_deploy_preview_test') {
    return { eligible: false, reason: 'Review requests cannot be sent for test orders.', customerEmail: '' };
  }

  const customerEmail = getReviewRequestCustomerEmail(order);
  if (!customerEmail) {
    return { eligible: false, reason: 'No valid customer email is available for this order.', customerEmail: '' };
  }

  const status = normalize(order.status);
  const reconciledPayPalCapture = status === 'pending'
    && paymentMethod === 'paypal'
    && Boolean(order.paypal_capture_id)
    && ['complete', 'completed'].includes(normalize(order.payment_reconciliation_status));
  if (!ELIGIBLE_PAID_STATUSES.has(status) && !reconciledPayPalCapture) {
    return {
      eligible: false,
      reason: 'This order is not eligible because it is not a confirmed paid order.',
      customerEmail,
    };
  }

  return { eligible: true, reason: '', customerEmail };
};

export const formatReviewRequestSentAt = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};
