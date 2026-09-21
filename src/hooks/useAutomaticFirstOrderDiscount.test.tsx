// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutomaticFirstOrderDiscount } from './useAutomaticFirstOrderDiscount';
import { useCartStore } from '@/store/cart';
import { FIRST_ORDER_DISCOUNT } from '@/lib/firstOrderPromotion';
import { CHECKOUT_CUSTOMER_DRAFT_CHANGED } from '@/components/checkout/checkoutCustomerDraft';
import { writeActiveCheckoutMarker } from '@/components/checkout/checkoutPaymentState';

let root: Root; let container: HTMLDivElement;
function Harness({ user = null, enabled = true }: { user?: { id: string; email: string } | null; enabled?: boolean }) {
  const offer = useAutomaticFirstOrderDiscount({ user, enabled });
  return <div data-status={offer.status} data-checking={offer.checking}>{offer.message}</div>;
}
const render = async (element = <Harness />) => { await act(async () => root.render(element)); };
const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(350); }); };
const valid = () => Promise.resolve({ ok: true, json: async () => ({ valid: true, discount: { code: 'NEW20', discountPercentage: 20 } }) });
beforeEach(() => {
  vi.useFakeTimers(); sessionStorage.clear(); localStorage.clear();
  useCartStore.setState({ items: [], discountCode: null });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', vi.fn(valid));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('automatic first-order offer', () => {
  it('prices a guest immediately without a click, with an eligibility qualifier', async () => {
    await render(); expect(useCartStore.getState().discountCode?.code).toBe('NEW20');
    expect(container.textContent).toContain('Eligibility confirmed'); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not overwrite a manually applied better code', async () => {
    useCartStore.setState({ discountCode: { ...FIRST_ORDER_DISCOUNT, code: 'REVIEW25', discountPercentage: 25, automaticFirstOrder: false } });
    await render(); expect(useCartStore.getState().discountCode?.code).toBe('REVIEW25');
  });
  it('rechecks a guest email and removes the discount before returning-customer payment', async () => {
    await render(); vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ valid: false }) } as Response);
    await act(async () => window.dispatchEvent(new CustomEvent(CHECKOUT_CUSTOMER_DRAFT_CHANGED, { detail: { email: 'returning@example.com' } })));
    expect(container.querySelector('div')?.dataset.checking).toBe('true'); await settle();
    expect(useCartStore.getState().discountCode).toBeNull(); expect(container.textContent).toContain('price has been updated');
  });
  it('checks signed-in customers before granting their offer', async () => {
    await render(<Harness user={{ id: '11111111-1111-4111-8111-111111111111', email: 'first@example.com' }} />);
    expect(useCartStore.getState().discountCode).toBeNull(); await settle();
    expect(useCartStore.getState().discountCode?.code).toBe('NEW20');
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).email).toBe('first@example.com');
  });
  it('does not change an active provider authorization', async () => {
    writeActiveCheckoutMarker({ provider: 'stripe', checkoutKey: 'existing-payment-key-12345', phase: 'requires_action' });
    await render(<Harness enabled={false} />); await settle();
    expect(useCartStore.getState().discountCode).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed on an eligibility service error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await render(<Harness user={{ id: '11111111-1111-4111-8111-111111111111', email: 'first@example.com' }} />); await settle();
    expect(useCartStore.getState().discountCode).toBeNull(); expect(container.textContent).toContain('Please retry');
  });
  it('ignores a stale eligible response after the checkout email changes', async () => {
    let resolveOld!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await render(<Harness user={{ id: '11111111-1111-4111-8111-111111111111', email: 'first@example.com' }} />);
    await settle();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ valid: false }) } as Response);
    await act(async () => window.dispatchEvent(new CustomEvent(CHECKOUT_CUSTOMER_DRAFT_CHANGED, { detail: { email: 'returning@example.com' } })));
    await settle();
    await act(async () => resolveOld({ ok: true, json: async () => ({ valid: true, discount: { code: 'NEW20' } }) } as Response));
    expect(useCartStore.getState().discountCode).toBeNull();
    expect(container.querySelector('div')?.dataset.status).toBe('ineligible');
  });

});
