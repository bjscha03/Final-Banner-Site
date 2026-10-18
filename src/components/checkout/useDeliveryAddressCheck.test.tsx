// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeliveryAddressCheck } from './useDeliveryAddressCheck';
import { createEmptyCheckoutCustomer } from './checkoutCustomerDraft';

const customer = { ...createEmptyCheckoutCustomer(), street: '1600 Pennsylvania Avenue NW', city: 'Washington', state: 'DC', zip: '20500' };
const pay = vi.fn();
let root: Root, host: HTMLDivElement;
function Fixture() {
  const [value, setValue] = useState(customer);
  const check = useDeliveryAddressCheck(value, setValue);
  return <>{check.reviewPanel}<button onClick={async () => { if (await check.check()) pay(); }}>Pay</button>
    <button onClick={() => setValue(current => ({ ...current, zip: '00000' }))}>Change ZIP</button></>;
}
const click = async (label: string) => act(async () => { Array.from(host.querySelectorAll('button')).find(button => button.textContent === label)!.click(); });
beforeEach(async () => {
  vi.stubEnv('VITE_CHECKOUT_ADDRESS_VALIDATION_ENABLED', 'true');
  pay.mockClear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('delivery address payment review', () => {
  it('only continues directly when validation confirms the address', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ valid: true })); vi.stubGlobal('fetch', fetch);
    await click('Pay'); expect(pay).toHaveBeenCalledTimes(1);
    await click('Pay'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('pauses payment for corrections and honors explicit confirmation only for that address', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ valid: false, message: 'Check apartment number.' })));
    vi.stubGlobal('fetch', fetch);
    await click('Pay'); expect(pay).not.toHaveBeenCalled(); expect(host.textContent).toContain('Check apartment number.');
    await click('Use address as entered'); await click('Pay'); expect(pay).toHaveBeenCalledTimes(1);
    await click('Change ZIP'); await click('Pay'); expect(pay).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('lets the customer review and continue during a lookup outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await click('Pay'); expect(pay).not.toHaveBeenCalled(); expect(host.textContent).toContain('temporarily unavailable');
    await click('Use address as entered'); await click('Pay'); expect(pay).toHaveBeenCalledTimes(1);
  });
  it('cannot pay with a stale address if the customer edits while validation is pending', async () => {
    let resolve: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })));
    await click('Pay'); await click('Change ZIP');
    await act(async () => resolve!(Response.json({ valid: true })));
    expect(pay).not.toHaveBeenCalled();
  });
});
