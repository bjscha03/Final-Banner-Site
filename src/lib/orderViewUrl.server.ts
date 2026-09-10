import tokenModule from '../../netlify/functions/_shared/order-confirmation-token.cjs';

type PaidOrderForView = {
  id: string;
  status: string;
  total_cents?: number;
  created_at?: string;
  payment_method?: string;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  checkout_idempotency_key?: string | null;
};

const { createGuestOrderViewUrl: createSignedUrl } = tokenModule as {
  createGuestOrderViewUrl: (origin: string, order: PaidOrderForView) => string;
};

export const createGuestOrderViewUrl = (origin: string, order: PaidOrderForView): string =>
  createSignedUrl(origin, order);
