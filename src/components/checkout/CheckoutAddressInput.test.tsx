// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutAddressInput, applySuggestedAddress } from './CheckoutAddressInput';
import { createEmptyCheckoutCustomer } from './checkoutCustomerDraft';

let root: Root, host: HTMLDivElement;
const select = vi.fn();
const address = { street: '1600 Pennsylvania Avenue NW', city: 'Washington', state: 'DC', zip: '20500', country: 'US' };
function Fixture() {
  const [value, setValue] = useState('');
  return <><CheckoutAddressInput id="street" value={value} onChange={event => setValue(event.target.value)} onAddressSelected={result => { select(result); setValue(result.street); }} /><button type="button">Next field</button></>;
}
const enter = async (value: string) => {
  await act(async () => {
    const input = host.querySelector('input')!; input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); select.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('checkout address autocomplete', () => {
  it('debounces typing, selects by keyboard, and fills the chosen address', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ suggestions: [{ id: 'one', label: '1600 Pennsylvania Ave NW, Washington, DC' }] }))
      .mockResolvedValueOnce(Response.json({ address })); vi.stubGlobal('fetch', fetch);
    await enter('160'); await act(async () => vi.advanceTimersByTimeAsync(350)); expect(fetch).not.toHaveBeenCalled();
    await enter('1600'); await enter('1600 Penn'); await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(fetch).toHaveBeenCalledTimes(1); expect(host.querySelector('[role="option"]')).not.toBeNull();
    await act(async () => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await act(async () => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(select).toHaveBeenCalledWith(address); expect(host.querySelector('input')!.value).toBe(address.street);
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    const first = JSON.parse(fetch.mock.calls[0][1].body), second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(first.sessionToken).toBe(second.sessionToken);
  });
  it('ignores old search results after newer typing and lets Escape dismiss suggestions', async () => {
    let resolveOld: (result: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(Response.json({ suggestions: [{ id: 'new', label: 'New result' }] })); vi.stubGlobal('fetch', fetch);
    await enter('1600'); await act(async () => vi.advanceTimersByTimeAsync(350));
    await enter('1600 Penn'); await act(async () => vi.advanceTimersByTimeAsync(350));
    await act(async () => resolveOld!(Response.json({ suggestions: [{ id: 'old', label: 'Wrong old result' }] })));
    expect(host.textContent).toContain('New result'); expect(host.textContent).not.toContain('Wrong old result');
    await act(async () => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="listbox"]')).toBeNull(); expect(host.querySelector('input')!.value).toBe('1600 Penn');
  });
  it('does not overwrite a new manual address with a late selection response', async () => {
    let resolveDetails: (result: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ suggestions: [{ id: 'one', label: 'Public landmark' }] }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveDetails = resolve; })));
    await enter('1600'); await act(async () => vi.advanceTimersByTimeAsync(350));
    await act(async () => (host.querySelector('[role="option"]') as HTMLElement).click());
    await enter('A different address'); await act(async () => resolveDetails!(Response.json({ address })));
    expect(select).not.toHaveBeenCalled(); expect(host.querySelector('input')!.value).toBe('A different address');
  });
  it('keeps manual entry available after provider failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await enter('1600'); await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(host.textContent).toContain('enter your address manually'); expect(host.querySelector('input')!.disabled).toBe(false);
  });
  it('preserves units, identity and the other address when applying a selection', () => {
    const current = { ...createEmptyCheckoutCustomer('test@example.com'), street2: 'Suite 20', shippingStreet2: 'Apt 3', shippingCity: 'Existing city' };
    expect(applySuggestedAddress(current, address, false)).toMatchObject({ ...address, street2: 'Suite 20', email: 'test@example.com', shippingCity: 'Existing city' });
    expect(applySuggestedAddress(current, address, true)).toMatchObject({ shippingStreet: address.street, shippingStreet2: 'Apt 3', shippingCity: 'Washington', street2: 'Suite 20', street: '' });
  });
});
