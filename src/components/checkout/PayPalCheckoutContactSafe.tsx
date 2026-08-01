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
 * Keeps checkout simple while guaranteeing a usable customer email.
 *
 * PayPal collects the customer's name and shipping details inside its secure
 * card/wallet flow. The site asks only for the email needed for the store's
 * confirmation and tracking messages because guest-card payments do not always
 * return that email to the merchant API.
 */
const PayPalCheckoutContactSafe: React.FC<PayPalCheckoutProps> = (props) => {
  const { user } = useAuth();
  const [guestEmail, setGuestEmail] = useState(() => readSessionValue(CONTACT_EMAIL_KEY));
  const [attempted, setAttempted] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const contactBlockedRef = useRef(false);

  const customerEmail = useMemo(
    () => String(user?.email || guestEmail).trim().toLowerCase(),
    [guestEmail, user?.email],
  );

  const contactValid = EMAIL_PATTERN.test(customerEmail);
  const isGuest = !user?.email;

  const focusEmail = () => {
    emailInputRef.current?.focus();
  };

  const requireEmail = () => {
    contactBlockedRef.current = true;
    setAttempted(true);
    window.setTimeout(focusEmail, 0);
  };

  useEffect(() => {
    if (!isGuest || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(CONTACT_EMAIL_KEY, guestEmail.trim());
      // Remove the obsolete duplicate-name field value left by the prior build.
      window.sessionStorage.removeItem('bof-checkout-contact-name');
    } catch {
      // A blocked storage API must not prevent checkout; React state remains authoritative.
    }
  }, [guestEmail, isGuest]);

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
        requireEmail();
        const error = new Error(CONTACT_REQUIRED_CODE) as Error & { code?: string };
        error.code = CONTACT_REQUIRED_CODE;
        throw error;
      }

      contactBlockedRef.current = false;

      try {
        const payload = JSON.parse(init.body);

        if (url.includes('/.netlify/functions/create-order')) {
          payload.email = customerEmail;
        }

        if (url.includes('/.netlify/functions/paypal-create-order')) {
          payload.email = customerEmail;
        }

        if (url.includes('/.netlify/functions/paypal-capture-minimal')) {
          payload.customerInfo = {
            ...(payload.customerInfo || {}),
            email: customerEmail,
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
  }, [contactValid, customerEmail]);

  const handleSuccess = (orderId: string, orderData?: any) => {
    props.onSuccess(orderId, {
      ...(orderData || {}),
      email: customerEmail,
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
      requireEmail();
      return;
    }

    props.onError(error);
  };

  return (
    <div className="space-y-3">
      {isGuest ? (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700">
            Email for order confirmation and tracking
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
              aria-invalid={attempted && !contactValid}
              className={`mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 ${
                attempted && !contactValid
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                  : 'border-slate-300 focus:border-[#18448D] focus:ring-blue-100'
              }`}
              placeholder="you@example.com"
            />
          </label>
          {attempted && !contactValid ? (
            <p className="text-xs font-medium text-red-600">
              Enter a valid email so we can send your order confirmation.
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              PayPal securely collects your name and shipping details after you continue.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-emerald-800">
          Order updates will be sent to <strong>{customerEmail}</strong>.
        </p>
      )}

      <div className="relative">
        <OriginalPayPalCheckout
          {...props}
          disabled={Boolean(props.disabled)}
          onSuccess={handleSuccess}
          onError={handlePaymentError}
        />
        {isGuest && !contactValid ? (
          <button
            type="button"
            aria-label="Enter email for order updates before paying"
            className="absolute inset-0 z-20 cursor-pointer bg-transparent"
            onClick={requireEmail}
          />
        ) : null}
      </div>
    </div>
  );
};

export default PayPalCheckoutContactSafe;
