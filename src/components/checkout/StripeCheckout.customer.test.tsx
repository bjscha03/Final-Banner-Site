// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StripeCheckout from './StripeCheckout';
import PayPalCheckoutReliable from './PayPalCheckoutReliable';
import { createEmptyCheckoutCustomer, readCheckoutCustomerDraft, writeCheckoutCustomerDraft } from './checkoutCustomerDraft';
import { trackCheckoutDiagnostic } from '@/lib/checkoutDiagnostics';

const mocks = vi.hoisted(() => ({
  stripe: { createConfirmationToken: vi.fn() },
  elementsOptions: vi.fn(),
  paymentOptions: vi.fn(),
  paymentCallbacks: null as any,
  cardAutoReady: true,
  elements: { submit: vi.fn() },
  capture: vi.fn(),
  paypalProvider: vi.fn(() => null),
  cart: { items: [], discountCode: null, sameDayHitService: false, saturdayDelivery: false },
}));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children, options }: any) => { mocks.elementsOptions(options); return children; },
  ExpressCheckoutElement: () => null,
  PaymentElement: (props: any) => {
    mocks.paymentOptions(props.options); mocks.paymentCallbacks = props;
    React.useEffect(() => { if (mocks.cardAutoReady) props.onReady?.(); }, []);
    return <div>Secure card fields</div>;
  },
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
// Responsive wallet sizing is exercised with real media queries in browser QA.
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
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
  mocks.cardAutoReady = true;
  mocks.elements.submit.mockReset();
  mocks.stripe.createConfirmationToken.mockReset();
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => render());
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

const payButton = () => host.querySelector<HTMLButtonElement>('.checkout-pay-button')!;
const renderSlowCard = async () => {
  await act(async () => root.unmount());
  mocks.cardAutoReady = false;
  writeCheckoutCustomerDraft({ ...createEmptyCheckoutCustomer('checkout-test@example.com'),
    firstName: 'Test', lastName: 'Buyer', phone: '5025550100', street: '123 Preview Street', city: 'Louisville', state: 'KY', zip: '40299' });
  root = createRoot(host);
  await act(async () => render());
};

describe('card field readiness and submission', () => {
  it('does not submit before the card iframe is ready, even with valid saved contact details', async () => {
    await renderSlowCard();
    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    expect(mocks.elements.submit).not.toHaveBeenCalled();
    await act(async () => mocks.paymentCallbacks.onReady());
    expect(payButton().disabled).toBe(false);
    expect(host.querySelector<HTMLInputElement>('#stripe-email')?.value).toBe('checkout-test@example.com');
  });

  it('keeps failed card fields disabled and recovers when Stripe reports ready', async () => {
    await act(async () => mocks.paymentCallbacks.onLoadError());
    expect(payButton().disabled).toBe(true);
    expect(host.textContent).toContain('Card payment fields could not load');
    await act(async () => mocks.paymentCallbacks.onReady());
    expect(payButton().disabled).toBe(false);
    expect(host.textContent).not.toContain('Card payment fields could not load');
  });

  it('reports an iframe that never becomes ready even when the Stripe SDK has loaded', async () => {
    vi.useFakeTimers();
    await renderSlowCard();
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(payButton().disabled).toBe(true);
    expect(host.textContent).toContain('Card payment fields could not load');
    expect(trackCheckoutDiagnostic).toHaveBeenCalledWith('payment_fields_load_failed', expect.objectContaining({ stage: 'card_ready_timeout' }));
  });

  it('does not reload payment fields while checkout is externally locked', async () => {
    await act(async () => mocks.paymentCallbacks.onLoadError());
    await act(async () => root.render(<StripeCheckout publishableKey="pk_test_mock" total={3392} disabled onSuccess={vi.fn()} onError={vi.fn()} />));
    const reload = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Reload secure card fields'))!;
    expect(reload.disabled).toBe(true);
  });

  it('allows only one card validation while repeated clicks arrive, then releases a validation failure', async () => {
    await renderSlowCard();
    await act(async () => mocks.paymentCallbacks.onReady());
    let finish!: (value: any) => void;
    mocks.elements.submit.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => { payButton().click(); payButton().click(); });
    expect(mocks.elements.submit).toHaveBeenCalledTimes(1);
    expect(payButton().disabled).toBe(true);
    await act(async () => finish({ error: { message: 'Check your card details.' } }));
    expect(payButton().disabled).toBe(false);
    expect(mocks.stripe.createConfirmationToken).not.toHaveBeenCalled();
  });

  it('requires fresh fields after timeout, retains contact details, and ignores late old validation', async () => {
    vi.useFakeTimers();
    await renderSlowCard();
    await act(async () => mocks.paymentCallbacks.onReady());
    let finish!: (value: any) => void;
    mocks.elements.submit.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => payButton().click());
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(host.textContent).toContain('secure payment form did not respond');
    expect(payButton().disabled).toBe(true);
    const reload = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Reload secure card fields'))!;
    await act(async () => reload.click());
    expect(payButton().disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('#stripe-email')?.value).toBe('checkout-test@example.com');
    expect(host.querySelector<HTMLInputElement>('#stripe-street')?.value).toBe('123 Preview Street');
    await act(async () => mocks.paymentCallbacks.onReady());
    expect(payButton().disabled).toBe(false);
    await act(async () => finish({}));
    expect(mocks.stripe.createConfirmationToken).not.toHaveBeenCalled();
    mocks.elements.submit.mockResolvedValue({ error: { message: 'Fresh card field validation.' } });
    await act(async () => payButton().click());
    expect(mocks.elements.submit).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Fresh card field validation.');
  });

  it('continues through token creation once ready and releases a pre-payment provider failure', async () => {
    await renderSlowCard();
    await act(async () => mocks.paymentCallbacks.onReady());
    mocks.elements.submit.mockResolvedValue({});
    mocks.stripe.createConfirmationToken.mockResolvedValue({ error: { message: 'Test provider validation failure.' } });
    await act(async () => payButton().click());
    expect(mocks.elements.submit).toHaveBeenCalledTimes(1);
    expect(mocks.stripe.createConfirmationToken).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Test provider validation failure.');
    expect(payButton().disabled).toBe(false);
  });

  it('never starts payment when the customer leaves while card validation is pending', async () => {
    await renderSlowCard();
    await act(async () => mocks.paymentCallbacks.onReady());
    let finish!: (value: any) => void;
    mocks.elements.submit.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => payButton().click());
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => finish({}));
    expect(mocks.stripe.createConfirmationToken).not.toHaveBeenCalled();
  });
});

describe('checkout contact form', () => {
  it('keeps card checkout available without offering Cash App', async () => {
    expect(mocks.elementsOptions).toHaveBeenCalledWith(expect.objectContaining({ allowedPaymentMethodTypes: ['card'] }));
    expect(host.textContent).not.toContain('Cash App');
    await enter('email', 'checkout-test@example.com');
    const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Pay $33.92')!;
    await act(async () => button.click());
    expect(mocks.stripe.createConfirmationToken).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Enter your first name');
  });

  it('makes the real contact form reviewable in preview without mounting a payment provider', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await act(async () => root.render(<PayPalCheckoutReliable total={3392} onSuccess={vi.fn()} onError={vi.fn()} />));
    expect(host.querySelector('input')?.id).toBe('checkout-email');
    expect(host.textContent).toContain('Place test order · $33.92');
    expect(host.textContent).toContain('No payment will be taken.');
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Apple Pay — preview only"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="PayPal — preview only"]')?.disabled).toBe(true);
    expect(host.querySelector('.checkout-preview-card input')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(mocks.paypalProvider).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets customers review the order after card details and before submitting payment', async () => {
    await act(async () => root.render(<StripeCheckout publishableKey="pk_test_mock" total={3392} onSuccess={vi.fn()} onError={vi.fn()} orderSummary={<section data-testid="order-review">Order total $33.92</section>} />));
    const cardFields = Array.from(host.querySelectorAll('div')).find(node => node.textContent === 'Secure card fields')!;
    const summary = host.querySelector('[data-testid="order-review"]')!;
    const pay = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Pay $33.92')!;
    expect(cardFields.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary.compareDocumentPosition(pay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mocks.stripe.createConfirmationToken).not.toHaveBeenCalled();
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
