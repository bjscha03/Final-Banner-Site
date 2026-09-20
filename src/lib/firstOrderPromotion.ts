import type { DiscountCode } from '@/store/cart';
export const FIRST_ORDER_APPLIED_LABEL = '20% off first order applied';
export const FIRST_ORDER_DISCOUNT: DiscountCode = {
  id: 'NEW20_PROMO', code: 'NEW20', discountPercentage: 20,
  discountAmountCents: null, expiresAt: '2099-12-31T23:59:59Z',
  source: 'new_customer', automaticFirstOrder: true,
};
