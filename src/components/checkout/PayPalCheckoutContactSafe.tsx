import React, { useEffect, useMemo, useRef, useState } from 'react';
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
const CONTACT_REQUIRED_CODE = 'CHECKOUT_CONTACT_REQUIRED';

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
 * name/email before PayPal can create an order, persist them on the pending
 * internal order, and include them again with capture. The PayPal buttons stay
 * visually active; an incomplete contact form is rejected before any order or
 * payment request can be created.
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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const contactBlockedRef = useRef(false);

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

  const focusMissingContact = () => {
    if (!customerName) {
      nameInputRef.current?.focus();
      return;
    }
    if (!EMAIL_PATTERN.test(customerEmail)) {
      emailInputRef.current?.focus();
    }
  };

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
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch.bind(window);
    const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = getRequestUrl(input);
      const isCheckoutWrite = url.includes('/.netlify/functions/create-order')
        || url.includes('/.netlify/functions/paypal-create-order')
        || url.includes('/.netlify/functions/paypal-capture-minimal');

      if (!isCheckoutWrite || !init?.body || typeof init.body !== 'string') {
        return originalFetch(input, init);
      }

      if (!contactValid) {
        contactBlockedRef.current = true;
        setAttempted(true);
        window.setTimeout(focusMissingContact, 0);
        const error = new Error(CONTACT_REQUIRED_CODE) as Error & { code?: string };
        error.code = CONTACT_REQUIRED_CODE;
        throw error;
      }

      contactBlockedRef.current = false;

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
      } catch (error) {
        if ((error as Error & { code?: string })?.code === CONTACT_REQUIRED_CODE) {
          throw error;
        }
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

  const handlePaymentError = (error: any) => {
    const message = String(error?.message || error || '');
    if (
      contactBlockedRef.current
      || error?.code === CONTACT_REQUIRED_CODE
      || message.includes(CONTACT_REQUIRED_CODE)
    ) {
      contactBlockedRef.current = false;
      setAttempted(true);
      window.setTimeout(focusMissingContact, 0);
      return;
    }

    props.onError(error);
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
                ref={nameInputRef}
                type="text"
                autoComplete="name"
                value={guestName}
                onChange={(event) => {
                  contactBlockedRef.current = false;
                  setGuestName(event.target.value);
                }}
                onBlur={() => setAttempted(true)}
                aria-invalid={attempted && !customerName}
                className={`mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 ${
                  attempted && !customerName
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-300 focus:border-[#18448D] focus:ring-blue-100'
                }`}
                placeholder="Full name"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Email for confirmation
              <input
                ref={emailInputRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(event) => {
                  contactBlockedRef.current = false;
                  setGuestEmail(event.target.value);
                }}
                onBlur={() => setAttempted(true)}
                aria-invalid={attempted && !EMAIL_PATTERN.test(customerEmail)}
                className={`mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 ${
                  attempted && !EMAIL_PATTERN.test(customerEmail)
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-300 focus:border-[#18448D] focus:ring-blue-100'
                }`}
                placeholder="you@example.com"
              />
            </label>
          </div>
          {!contactValid ? (
            <p className={`mt-2 text-xs font-medium ${attempted ? 'text-red-600' : 'text-slate-600'}`}>
              Enter your full name and a valid email before payment can continue.
            </p>
          ) : (
            <p className="mt-2 text-xs font-medium text-emerald-700">
              Confirmation will be sent to {customerEmail}.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Order confirmation will be sent to <strong>{customerEmail}</strong>.
        </div>
      )}

      <OriginalPayPalCheckout
        {...props}
        disabled={Boolean(props.disabled)}
        onSuccess={handleSuccess}
        onError={handlePaymentError}
      />
    </div>
  );
};

export default PayPalCheckoutContactSafe;
