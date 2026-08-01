import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import OriginalPayPalCheckout from './PayPalCheckout';

interface PayPalCheckoutProps {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  cardFirstLayout?: boolean;
}

const CONTACT_NAME_KEY = 'bof-checkout-contact-name';
const CONTACT_EMAIL_KEY = 'bof-checkout-contact-email';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readSessionValue = (key: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const getRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

/**
 * Checkout reliability wrapper.
 *
 * PayPal's hosted guest-card form can email a receipt without returning that
 * email address to the merchant API. We therefore collect the order-contact
 * name/email before enabling PayPal, persist them on the pending internal
 * order, and include them again with capture. This guarantees that customer
 * confirmations never target a generated guest-* placeholder address.
 */
const PayPalCheckoutContactSafe: React.FC<PayPalCheckoutProps> = (props) => {
  const { user } = useAuth();
  const accountName = String(
    user?.user_metadata?.full_name
      || user?.user_metadata?.name
      || '',
  ).trim();

  const [guestName, setGuestName] = useState(() => readSessionValue(CONTACT_NAME_KEY));
  const [guestEmail, setGuestEmail] = useState(() => readSessionValue(CONTACT_EMAIL_KEY));
  const [attempted, setAttempted] = useState(false);

  const customerName = useMemo(() => {
    if (accountName) return accountName;
    if (user?.email) return user.email.split('@')[0] || 'Customer';
    return guestName.trim();
  }, [accountName, guestName, user?.email]);

  const customerEmail = useMemo(
    () => String(user?.email || guestEmail).trim().toLowerCase(),
    [guestEmail, user?.email],
  );

  const contactValid = Boolean(customerName && EMAIL_PATTERN.test(customerEmail));
  const isGuest = !user?.email;

  useEffect(() => {
    if (!isGuest || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(CONTACT_NAME_KEY, guestName.trim());
      window.sessionStorage.setItem(CONTACT_EMAIL_KEY, guestEmail.trim());
    } catch {
      // A blocked storage API must not prevent checkout; React state remains authoritative.
    }
  }, [guestEmail, guestName, isGuest]);

  useEffect(() => {
    if (typeof window === 'undefined' || !contactValid) return;

    const originalFetch = window.fetch.bind(window);
    const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = getRequestUrl(input);
      const isCheckoutWrite = url.includes('/.netlify/functions/create-order')
        || url.includes('/.netlify/functions/paypal-create-order')
        || url.includes('/.netlify/functions/paypal-capture-minimal');

      if (!isCheckoutWrite || !init?.body || typeof init.body !== 'string') {
        return originalFetch(input, init);
      }

      try {
        const payload = JSON.parse(init.body);

        if (url.includes('/.netlify/functions/create-order')) {
          payload.email = customerEmail;
          payload.customer_name = customerName;
          payload.customer_first_name = customerName.split(/\s+/)[0] || customerName;
        }

        if (url.includes('/.netlify/functions/paypal-create-order')) {
          payload.email = customerEmail;
        }

        if (url.includes('/.netlify/functions/paypal-capture-minimal')) {
          payload.customerInfo = {
            ...(payload.customerInfo || {}),
            email: customerEmail,
            fullName: customerName,
          };
        }

        return originalFetch(input, {
          ...init,
          body: JSON.stringify(payload),
        });
      } catch {
        return originalFetch(input, init);
      }
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = originalFetch;
    };
  }, [contactValid, customerEmail, customerName]);

  const handleSuccess = (orderId: string, orderData?: any) => {
    props.onSuccess(orderId, {
      ...(orderData || {}),
      email: customerEmail,
      customer_name: customerName,
      customer_first_name: customerName.split(/\s+/)[0] || customerName,
      shipping_name: orderData?.shipping_name || customerName,
    });
  };

  return (
    <div className="space-y-4">
      {isGuest ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
          <p className="text-sm font-semibold text-[#18448D]">Order contact</p>
          <p className="mt-1 text-xs text-slate-600">
            Your receipt, order confirmation, and tracking updates will be sent here.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-700">
              Full name
              <input
                type="text"
                autoComplete="name"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                onBlur={() => setAttempted(true)}
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#18448D] focus:ring-2 focus:ring-blue-100"
                placeholder="Full name"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Email for confirmation
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                onBlur={() => setAttempted(true)}
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#18448D] focus:ring-2 focus:ring-blue-100"
                placeholder="you@example.com"
              />
            </label>
          </div>
          {attempted && !contactValid ? (
            <p className="mt-2 text-xs font-medium text-red-600">
              Enter your full name and a valid email before paying.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Order confirmation will be sent to <strong>{customerEmail}</strong>.
        </div>
      )}

      <OriginalPayPalCheckout
        {...props}
        disabled={Boolean(props.disabled || !contactValid)}
        onSuccess={handleSuccess}
        onError={(error) => {
          setAttempted(true);
          props.onError(error);
        }}
      />
    </div>
  );
};

export default PayPalCheckoutContactSafe;
