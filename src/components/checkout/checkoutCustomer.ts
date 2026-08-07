export type CustomerFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  shippingSame: boolean;
  shippingName: string;
  shippingStreet: string;
  shippingStreet2: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingCountry: string;
};

export type CheckoutCustomerValidation = {
  field: keyof CustomerFormState;
  message: string;
};

const REQUIRED_BILLING_FIELDS: Array<{
  field: keyof CustomerFormState;
  message: string;
}> = [
  { field: 'firstName', message: 'Enter your first name.' },
  { field: 'lastName', message: 'Enter your last name.' },
  { field: 'email', message: 'Enter your email address.' },
  { field: 'phone', message: 'Enter your phone number.' },
  { field: 'country', message: 'Enter your billing country.' },
  { field: 'street', message: 'Enter your billing street address.' },
  { field: 'city', message: 'Enter your billing city.' },
  { field: 'state', message: 'Enter your billing state.' },
  { field: 'zip', message: 'Enter your billing ZIP code.' },
];

const REQUIRED_SHIPPING_FIELDS: Array<{
  field: keyof CustomerFormState;
  message: string;
}> = [
  { field: 'shippingName', message: 'Enter the shipping name.' },
  { field: 'shippingStreet', message: 'Enter the shipping street address.' },
  { field: 'shippingCity', message: 'Enter the shipping city.' },
  { field: 'shippingState', message: 'Enter the shipping state.' },
  { field: 'shippingZip', message: 'Enter the shipping ZIP code.' },
  { field: 'shippingCountry', message: 'Enter the shipping country.' },
];

export function validateCheckoutCustomer(customer: CustomerFormState): CheckoutCustomerValidation | null {
  const missingBilling = REQUIRED_BILLING_FIELDS.find(({ field }) => !String(customer[field]).trim());
  if (missingBilling) return missingBilling;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
    return { field: 'email', message: 'Enter a valid email address.' };
  }

  if (!customer.shippingSame) {
    const missingShipping = REQUIRED_SHIPPING_FIELDS.find(({ field }) => !String(customer[field]).trim());
    if (missingShipping) return missingShipping;
  }

  return null;
}
