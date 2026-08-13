import { describe, expect, it, vi } from 'vitest';
import {
  clearCheckoutCustomerDraft,
  createEmptyCheckoutCustomer,
  readCheckoutCustomerDraft,
  writeCheckoutCustomerDraft,
} from './checkoutCustomerDraft';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
};

describe('checkoutCustomerDraft', () => {
  it('preserves contact and address details across payment providers', () => {
    const storage = createStorage();
    const customer = {
      ...createEmptyCheckoutCustomer(),
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '555-0100',
      street: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    };

    writeCheckoutCustomerDraft(customer, storage);

    expect(readCheckoutCustomerDraft('', storage)).toEqual(customer);
  });

  it('normalizes country values to the supported ISO code', () => {
    const storage = createStorage();
    writeCheckoutCustomerDraft({
      ...createEmptyCheckoutCustomer(),
      country: 'United States',
      shippingCountry: 'United States',
    }, storage);

    const customer = readCheckoutCustomerDraft('', storage);
    expect(customer.country).toBe('US');
    expect(customer.shippingCountry).toBe('US');
  });

  it('clears customer details after a completed order', () => {
    const storage = createStorage();
    writeCheckoutCustomerDraft({
      ...createEmptyCheckoutCustomer(),
      email: 'customer@example.com',
    }, storage);

    clearCheckoutCustomerDraft(storage);

    expect(readCheckoutCustomerDraft('signed-in@example.com', storage)).toEqual(
      createEmptyCheckoutCustomer('signed-in@example.com'),
    );
  });

  it('discards expired drafts', () => {
    const storage = createStorage();
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    writeCheckoutCustomerDraft({
      ...createEmptyCheckoutCustomer(),
      email: 'old@example.com',
    }, storage);
    now.mockReturnValue(1_000 + (3 * 60 * 60 * 1000));

    expect(readCheckoutCustomerDraft('new@example.com', storage).email).toBe('new@example.com');
    now.mockRestore();
  });
});
