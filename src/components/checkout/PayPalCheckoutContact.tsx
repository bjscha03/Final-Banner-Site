import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import OriginalPayPalCheckout from './PayPalCheckout';

type PayPalCheckoutProps = {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  cardFirstLayout?: boolean;
};

type CustomerInfo = {
  fullName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const STORAGE_KEY = 'bof-checkout-customer-info';

const emptyCustomerInfo: CustomerInfo = {
  fullName: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
};

const trimCustomerInfo = (value: CustomerInfo): CustomerInfo => ({
  fullName: value.fullName.trim(),
  address1: value.address1.trim(),
  address2: value.address2.trim(),
  city: value.city.trim(),
  state: value.state.trim().toUpperCase(),
  postalCode: value.postalCode.trim(),
  country: (value.country || 'US').trim().toUpperCase(),
});

const isComplete = (value: CustomerInfo) => {
  const info = trimCustomerInfo(value);
  return Boolean(
    info.fullName
    && info.address1
    && info.city
    && info.state
    && info.postalCode
    && info.country,
  );
};

const getInitialInfo = (): CustomerInfo => {
  if (typeof window === 'undefined') return emptyCustomerInfo;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyCustomerInfo;
    const parsed = JSON.parse(stored) || {};
    return {
      fullName: String(parsed.fullName || ''),
      address1: String(parsed.address1 || ''),
      address2: String(parsed.address2 || ''),
      city: String(parsed.city || ''),
      state: String(parsed.state || ''),
      postalCode: String(parsed.postalCode || ''),
      country: String(parsed.country || 'US'),
    };
  } catch {
    return emptyCustomerInfo;
  }
};

const PayPalCheckoutContact: React.FC<PayPalCheckoutProps> = (props) => {
  const { user } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(getInitialInfo);
  const customerInfoRef = useRef(customerInfo);

  useEffect(() => {
    customerInfoRef.current = customerInfo;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(customerInfo));
    } catch {
      // Checkout remains usable when storage is unavailable.
    }
  }, [customerInfo]);

  useEffect(() => {
    setCustomerInfo((current) => ({
      ...current,
      fullName: current.fullName || user?.full_name || '',
    }));
  }, [user?.full_name]);

  const complete = useMemo(() => isComplete(customerInfo), [customerInfo]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const originalFetch = window.fetch;
    const patchedFetch: typeof window.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const relevantEndpoint = [
        '/.netlify/functions/create-order',
        '/.netlify/functions/paypal-create-order',
        '/.netlify/functions/paypal-capture-minimal',
        '/.netlify/functions/paypal-capture-order',
      ].find((endpoint) => requestUrl.includes(endpoint));

      if (!relevantEndpoint || method !== 'POST' || typeof init.body !== 'string') {
        return originalFetch(input as RequestInfo | URL, init);
      }

      let body: Record<string, any>;
      try {
        body = JSON.parse(init.body || '{}');
      } catch {
        return originalFetch(input as RequestInfo | URL, init);
      }

      const info = trimCustomerInfo(customerInfoRef.current);
      if (!isComplete(info)) {
        return originalFetch(input as RequestInfo | URL, init);
      }

      const shippingAddress = {
        name: info.fullName,
        line1: info.address1,
        line2: info.address2 || null,
        city: info.city,
        state: info.state,
        postalCode: info.postalCode,
        country: info.country,
      };

      if (relevantEndpoint.endsWith('/create-order')) {
        // Do not replace the payment email here. PayPal/card checkout owns the
        // one customer email entry and the capture endpoint persists it.
        body.customer_name = info.fullName;
        body.customer_first_name = info.fullName.split(/\s+/)[0] || null;
        body.shipping_name = info.fullName;
        body.shipping_street = info.address1;
        body.shipping_street2 = info.address2 || null;
        body.shipping_city = info.city;
        body.shipping_state = info.state;
        body.shipping_zip = info.postalCode;
        body.shipping_country = info.country;
        body.shippingAddress = shippingAddress;
      }

      if (relevantEndpoint.endsWith('/paypal-create-order')) {
        body.shippingAddress = {
          name: info.fullName,
          address_line_1: info.address1,
          ...(info.address2 ? { address_line_2: info.address2 } : {}),
          admin_area_2: info.city,
          admin_area_1: info.state,
          postal_code: info.postalCode,
          country_code: info.country,
        };
      }

      if (
        relevantEndpoint.endsWith('/paypal-capture-minimal')
        || relevantEndpoint.endsWith('/paypal-capture-order')
      ) {
        body.customerInfo = info;
      }

      return originalFetch(input as RequestInfo | URL, {
        ...init,
        body: JSON.stringify(body),
      });
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = originalFetch;
    };
  }, []);

  const update = (field: keyof CustomerInfo, value: string) => {
    setCustomerInfo((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#18448D]/20 bg-blue-50/60 p-4" aria-labelledby="checkout-contact-heading">
        <div className="mb-3">
          <h3 id="checkout-contact-heading" className="text-base font-bold text-[#18448D]">Shipping information</h3>
          <p className="mt-1 text-xs text-gray-600">Enter your shipping details once. Your payment email is collected securely in the card or PayPal step below.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-gray-700">Full name</span>
            <Input value={customerInfo.fullName} onChange={(event) => update('fullName', event.target.value)} autoComplete="name" placeholder="Full name" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-gray-700">Street address</span>
            <Input value={customerInfo.address1} onChange={(event) => update('address1', event.target.value)} autoComplete="shipping address-line1" placeholder="Street address" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-gray-700">Apartment, suite, unit (optional)</span>
            <Input value={customerInfo.address2} onChange={(event) => update('address2', event.target.value)} autoComplete="shipping address-line2" placeholder="Apartment, suite, unit" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-700">City</span>
            <Input value={customerInfo.city} onChange={(event) => update('city', event.target.value)} autoComplete="shipping address-level2" placeholder="City" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-700">State</span>
            <Input value={customerInfo.state} onChange={(event) => update('state', event.target.value)} autoComplete="shipping address-level1" placeholder="PA" maxLength={2} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-700">ZIP code</span>
            <Input value={customerInfo.postalCode} onChange={(event) => update('postalCode', event.target.value)} autoComplete="shipping postal-code" placeholder="16859" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-700">Country</span>
            <Input value="United States" readOnly aria-readonly="true" />
          </label>
        </div>

        {!complete && (
          <p className="mt-3 text-xs font-medium text-red-700">Complete the required shipping fields to enable payment.</p>
        )}
      </section>

      <OriginalPayPalCheckout {...props} disabled={Boolean(props.disabled || !complete)} />
    </div>
  );
};

export default PayPalCheckoutContact;
