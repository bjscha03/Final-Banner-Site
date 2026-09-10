import type { CustomerFormState } from './checkoutCustomer';

type CheckoutDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type StoredCheckoutCustomerDraft = {
  version: 1;
  updatedAt: number;
  customer: CustomerFormState;
};

const CHECKOUT_CUSTOMER_DRAFT_KEY = 'bof-checkout-customer-v1';
const CHECKOUT_CUSTOMER_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

const STRING_FIELDS: Array<keyof Omit<CustomerFormState, 'shippingSame'>> = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'country',
  'street',
  'street2',
  'city',
  'state',
  'zip',
  'shippingName',
  'shippingStreet',
  'shippingStreet2',
  'shippingCity',
  'shippingState',
  'shippingZip',
  'shippingCountry',
];

const getSessionStorage = (): CheckoutDraftStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

const resolveStorage = (storage?: CheckoutDraftStorage | null): CheckoutDraftStorage | null => (
  storage === undefined ? getSessionStorage() : storage
);

export const createEmptyCheckoutCustomer = (email = ''): CustomerFormState => ({
  firstName: '',
  lastName: '',
  email,
  phone: '',
  country: 'US',
  street: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
  shippingSame: true,
  shippingName: '',
  shippingStreet: '',
  shippingStreet2: '',
  shippingCity: '',
  shippingState: '',
  shippingZip: '',
  shippingCountry: 'US',
});

const sanitizeCustomer = (value: unknown, fallbackEmail = ''): CustomerFormState => {
  const customer = createEmptyCheckoutCustomer(fallbackEmail);
  if (!value || typeof value !== 'object') return customer;

  const source = value as Record<string, unknown>;
  for (const field of STRING_FIELDS) {
    if (typeof source[field] === 'string') customer[field] = source[field];
  }
  customer.shippingSame = source.shippingSame !== false;

  // Checkout currently ships only within the United States. Keep the provider
  // value as the ISO code even if browser autofill populated an older draft.
  customer.country = 'US';
  customer.shippingCountry = 'US';
  if (!customer.email && fallbackEmail) customer.email = fallbackEmail;
  return customer;
};

export const readCheckoutCustomerDraft = (
  fallbackEmail = '',
  storage?: CheckoutDraftStorage | null,
): CustomerFormState => {
  const target = resolveStorage(storage);
  if (!target) return createEmptyCheckoutCustomer(fallbackEmail);

  try {
    const raw = target.getItem(CHECKOUT_CUSTOMER_DRAFT_KEY);
    if (!raw) return createEmptyCheckoutCustomer(fallbackEmail);
    const parsed = JSON.parse(raw) as Partial<StoredCheckoutCustomerDraft>;
    if (
      parsed.version !== 1
      || typeof parsed.updatedAt !== 'number'
      || Date.now() - parsed.updatedAt > CHECKOUT_CUSTOMER_DRAFT_TTL_MS
    ) {
      target.removeItem(CHECKOUT_CUSTOMER_DRAFT_KEY);
      return createEmptyCheckoutCustomer(fallbackEmail);
    }
    return sanitizeCustomer(parsed.customer, fallbackEmail);
  } catch {
    try {
      target.removeItem(CHECKOUT_CUSTOMER_DRAFT_KEY);
    } catch {
      // Storage may be blocked; an in-memory form still remains usable.
    }
    return createEmptyCheckoutCustomer(fallbackEmail);
  }
};

export const writeCheckoutCustomerDraft = (
  customer: CustomerFormState,
  storage?: CheckoutDraftStorage | null,
): void => {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    const draft: StoredCheckoutCustomerDraft = {
      version: 1,
      updatedAt: Date.now(),
      customer: sanitizeCustomer(customer),
    };
    target.setItem(CHECKOUT_CUSTOMER_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing/storage restrictions should never block checkout.
  }
};

export const clearCheckoutCustomerDraft = (storage?: CheckoutDraftStorage | null): void => {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.removeItem(CHECKOUT_CUSTOMER_DRAFT_KEY);
  } catch {
    // The draft expires independently if storage is unavailable.
  }
};
