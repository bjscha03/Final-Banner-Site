// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StripeCheckout from './StripeCheckout';
import { readCheckoutCustomerDraft } from './checkoutCustomerDraft';
import { useAutomaticFirstOrderDiscount } from '@/hooks/useAutomaticFirstOrderDiscount';
import { useCartStore } from '@/store/cart';
import { FIRST_ORDER_DISCOUNT } from '@/lib/firstOrderPromotion';

const mocks = vi.hoisted(() => ({
  stripe: { createConfirmationToken: vi.fn() },
  elements: { submit: vi.fn() },
  onConfirm: null as null | ((event: any, elements: any) => Promise<void>),
  error: vi.fn(), success: vi.fn(),
}));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => children,
  PaymentElement: () => <div>Secure card fields</div>,
  useStripe: () => mocks.stripe, useElements: () => mocks.elements,
}));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock('./IsolatedExpressWallet', () => ({ default: (props: any) => {
  mocks.onConfirm = props.onConfirm;
  return <div>Native wallet</div>;
} }));
vi.mock('./useDeliveryAddressCheck', () => ({ useDeliveryAddressCheck: () => ({ check: async () => true, checking: false, reviewPanel: null }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null }), getCurrentUser: async () => null }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useAbandonedCartCapture', () => ({ useAbandonedCartCapture: () => ({
  markPaymentStarted: vi.fn(), getCartId: () => null, getSessionId: () => null, getRecoveryAttribution: () => null,
}) }));
vi.mock('@/lib/checkoutDiagnostics', () => ({ trackCheckoutDiagnostic: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ gtag: vi.fn(), trackPaymentInfoAdded: vi.fn(), trackShippingInfoEntered: vi.fn() }));
vi.mock('@/lib/serverAuth', () => ({ authorizedHeaders: async () => ({}) }));

function Harness() {
  const offer = useAutomaticFirstOrderDiscount({ user: null });
  const discount = useCartStore(state => state.discountCode);
  const total = discount ? 6063 : 7579;
  return <><p>{offer.message}</p><StripeCheckout publishableKey="pk_test_mock" total={total}
    disabled={offer.checking} onError={mocks.error} onSuccess={mocks.success} /></>;
}
let root: Root; let host: HTMLDivElement;
const response = (status: number, body: object) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  useCartStore.setState({ items: [{ id: 'test-banner', product_type: 'banner', width_in: 24, height_in: 63,
    material: '13oz', quantity: 1, unit_price_cents: 7150, line_total_cents: 7150, file_key: 'test/artwork.png' } as any],
    discountCode: { ...FIRST_ORDER_DISCOUNT }, sameDayHitService: false, saturdayDelivery: false });
  mocks.stripe.createConfirmationToken.mockResolvedValue({ confirmationToken: { id: 'ctoken_test' } });
  mocks.elements.submit.mockResolvedValue({});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('wallet discount rejection recovery', () => {
  it('rechecks the wallet email, presents the corrected total, and requires a new payment action', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('stripe-create-payment-intent')) return response(400, { error: 'DISCOUNT_CODE_INVALID', message: 'New customers only' });
      if (url.endsWith('validate-discount-code')) return response(200, { valid: false });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<Harness />));
    const paymentFailed = vi.fn();
    await act(async () => mocks.onConfirm!({
      expressPaymentType: 'apple_pay', paymentFailed,
      billingDetails: { email: 'returning@example.com', name: 'Returning Customer', phone: '5025550100',
        address: { line1: '123 Test St', city: 'Louisville', state: 'KY', postal_code: '40299', country: 'US' } },
      shippingAddress: { name: 'Returning Customer', address: { line1: '123 Test St', city: 'Louisville', state: 'KY', postal_code: '40299', country: 'US' } },
    }, mocks.elements));
    expect(readCheckoutCustomerDraft().email).toBe('returning@example.com');
    expect(paymentFailed).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0][0].message).toContain('Review the updated total');
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(useCartStore.getState().discountCode).toBeNull();
    expect(host.textContent).toContain('Pay $75.79');
    expect(host.textContent).toContain('price has been updated');
    expect(host.querySelector<HTMLInputElement>('#stripe-email')?.value).toBe('returning@example.com');
    expect(request.mock.calls.filter(([url]) => url.endsWith('stripe-create-payment-intent'))).toHaveLength(1);
    expect(mocks.stripe.createConfirmationToken).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it('keeps an uncertain provider-bound payment locked instead of repricing or resubmitting', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('stripe-create-payment-intent')) return response(503, {
        error: 'DISCOUNT_CODE_INVALID', details: { paymentStatusUnknown: true, orderId: 'order-test', paymentIntentId: 'pi_test' },
      });
      if (url.endsWith('stripe-payment-status')) return response(200, {
        status: 'requires_action', requiresAction: true, clientSecret: 'pi_test_secret_test',
        orderId: 'order-test', paymentIntentId: 'pi_test',
      });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<Harness />));
    await act(async () => mocks.onConfirm!({
      expressPaymentType: 'apple_pay', paymentFailed: vi.fn(),
      billingDetails: { email: 'returning@example.com', name: 'Returning Customer', phone: '5025550100' },
    }, mocks.elements));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(useCartStore.getState().discountCode?.code).toBe('NEW20');
    expect(readCheckoutCustomerDraft().email).toBe('');
    expect(host.textContent).toContain('Resume secure authentication');
    expect(request.mock.calls.filter(([url]) => url.endsWith('stripe-create-payment-intent'))).toHaveLength(1);
    expect(request.mock.calls.some(([url]) => url.endsWith('validate-discount-code'))).toBe(false);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
