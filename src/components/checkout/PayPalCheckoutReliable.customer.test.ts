import { describe, expect, it } from 'vitest';
import {
  type CustomerFormState,
  validateCheckoutCustomer,
} from './checkoutCustomer';

const completeCustomer = (): CustomerFormState => ({
  firstName: 'Avery',
  lastName: 'Morgan',
  email: 'avery@example.com',
  phone: '617-555-0100',
  country: 'US',
  street: '1 Main Street',
  street2: '',
  city: 'Boston',
  state: 'MA',
  zip: '02108',
  shippingSame: true,
  shippingName: '',
  shippingStreet: '',
  shippingStreet2: '',
  shippingCity: '',
  shippingState: '',
  shippingZip: '',
  shippingCountry: 'US',
});

describe('validateCheckoutCustomer', () => {
  it('accepts complete billing details when shipping matches billing', () => {
    expect(validateCheckoutCustomer(completeCustomer())).toBeNull();
  });

  it('identifies the exact first field that needs attention', () => {
    const customer = completeCustomer();
    customer.firstName = '';

    expect(validateCheckoutCustomer(customer)).toEqual({
      field: 'firstName',
      message: 'Enter your first name.',
    });
  });

  it('rejects malformed email addresses', () => {
    const customer = completeCustomer();
    customer.email = 'avery@invalid';

    expect(validateCheckoutCustomer(customer)).toEqual({
      field: 'email',
      message: 'Enter a valid email address.',
    });
  });

  it('requires a complete alternate shipping address only when selected', () => {
    const customer = completeCustomer();
    customer.shippingSame = false;

    expect(validateCheckoutCustomer(customer)).toEqual({
      field: 'shippingName',
      message: 'Enter the shipping name.',
    });

    Object.assign(customer, {
      shippingName: 'Jordan Morgan',
      shippingStreet: '2 Beacon Street',
      shippingCity: 'Boston',
      shippingState: 'MA',
      shippingZip: '02108',
      shippingCountry: 'US',
    });

    expect(validateCheckoutCustomer(customer)).toBeNull();
  });
});
