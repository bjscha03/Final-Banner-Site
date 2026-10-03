// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StripeCheckout from './StripeCheckout';
import PayPalCheckoutReliable from './PayPalCheckoutReliable';
import { readCheckoutCustomerDraft } from './checkoutCustomerDraft';
import { trackCheckoutDiagnostic } from '@/lib/checkoutDiagnostics';

const mocks = vi.hoisted(() => ({
  stripe: { createConfirmationToken: vi.fn() },
  elements: { submit: vi.fn() },
  capture: vi.fn(),
  paypalProvider: vi.fn(() => null),
  cart: { items: [], discountCode: null, sameDayHitService: false, saturdayDelivery: false },
}));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => children,
  ExpressCheckoutElement: () => null,
  PaymentElement: () => <div>Secure card fields</div>,
  useStripe: () => mocks.stripe,
  useElements: () => mocks.elements,
}));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: mocks.paypalProvider, PayPalButtons: () => null,
  PayPalCardFieldsForm: () => null, PayPalCardFieldsProvider: () => null,
  usePayPalCardFields: () => ({}),
}));
vi.mock('./checkoutEnvironment', () => ({ shouldUseDeployPreviewTestCheckout: () => true }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/store/cart', () => ({ useCartStore: () => mocks.cart }));
vi.mock('@/hooks/useAbandonedCartCapture', () => ({ useAbandonedCartCapture: (input: any) => {
  mocks.capture(input);
  return { markPaymentStarted: vi.fn(), getCartId: () => null, getSessionId: () => null, getRecoveryAttribution: () => null };
} }));
vi.mock('@/lib/checkoutDiagnostics', () => ({ trackCheckoutDiagnostic: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ gtag: vi.fn(), trackPaymentInfoAdded: vi.fn(), trackShippingInfoEntered: vi.fn() }));
vi.mock('@/lib/serverAuth', () => ({ authorizedHeaders: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
const render = () => root.render(<StripeCheckout publishableKey="pk_test_mock" total={3392} onSuccess={vi.fn()} onError={vi.fn()} />);
const enter = async (id: string, value: string) => {
  const input = host.querySelector<HTMLInputElement>(`#stripe-${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
beforeEach(async () => {
  vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => render());
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('checkout contact form', () => {
  it('makes the real contact form reviewable in preview without mounting a payment provider', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await act(async () => root.render(<PayPalCheckoutReliable total={3392} onSuccess={vi.fn()} onError={vi.fn()} />));
    expect(host.querySelector('input')?.id).toBe('checkout-email');
    expect(host.textContent).toContain('Place Test Order — No Payment');
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(mocks.paypalProvider).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('collects email first, feeds capture, and preserves the draft after returning from artwork editing', async () => {
    expect(host.querySelector('input')?.id).toBe('stripe-email');
    expect(host.querySelector<HTMLDetailsElement>('details')?.open).toBe(false);
    expect(host.querySelector('#stripe-shippingStreet')).toBeNull();
    await enter('email', 'checkout-test@example.com');
    await enter('firstName', 'Test');
    await enter('street', '123 Preview Street');
    expect(mocks.capture).toHaveBeenLastCalledWith(expect.objectContaining({ customer: expect.objectContaining({ email: 'checkout-test@example.com' }) }));
    expect(readCheckoutCustomerDraft().street).toBe('123 Preview Street');
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => render());
    expect(host.querySelector<HTMLInputElement>('#stripe-email')?.value).toBe('checkout-test@example.com');
    expect(host.querySelector<HTMLInputElement>('#stripe-street')?.value).toBe('123 Preview Street');
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(host.querySelector('#stripe-shippingStreet')).not.toBeNull();
  });

  it('identifies a missing email and stops before submitting payment fields or creating a payment', async () => {
    const pay = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Pay $33.92')!;
    await act(async () => pay.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Enter your email address.');
    expect(host.querySelector('#stripe-email')?.getAttribute('aria-invalid')).toBe('true');
    expect(mocks.elements.submit).not.toHaveBeenCalled();
    expect(mocks.stripe.createConfirmationToken).not.toHaveBeenCalled();
    expect(trackCheckoutDiagnostic).toHaveBeenCalledWith('validation_blocked', { provider: 'stripe', method: 'card', field: 'email' });
  });
});
