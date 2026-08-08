import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { CircleAlert, Clock3, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { getStoredAttribution } from '@/lib/attribution';
import {
  trackPaymentInfoAdded,
  trackShippingInfoEntered,
  type AnalyticsItem,
} from '@/lib/analytics';
import { getItemDisplayName, getProductCategory } from '@/lib/product-display';
import { useCartStore, type CanonicalCartQuote } from '@/store/cart';
import {
  type CustomerFormState,
  validateCheckoutCustomer,
} from './checkoutCustomer';
import {
  buildStripeCheckoutSignature,
  clearStripeCheckoutState,
  createStripeCheckoutState,
  isStripeKeyOnlyRecovery,
  observeStripeKeyOnlyAbsence,
  readStripeCheckoutState,
  type StoredStripeCheckout,
  writeStripeCheckoutState,
} from './stripeCheckoutState';
import type {
  ActiveCheckoutMarker,
  CheckoutPaymentPhase,
  CheckoutPaymentStateEvent,
} from './checkoutPaymentState';
import { getStripeExpressShippingRates } from './stripeExpressShipping';
import { isValidCheckoutPhone, selectWalletCheckoutPhone } from './stripeWalletPhone';

interface StripeCheckoutProps {
  publishableKey: string;
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  onSwitchToPayPal?: () => void;
  resumeCheckout?: ActiveCheckoutMarker | null;
  onPaymentStateChange?: (state: CheckoutPaymentStateEvent) => void;
  onCanonicalQuote?: (quote: CanonicalCartQuote, serverTotalCents: number) => boolean;
}

type SubmittedCustomer = {
  email: string;
  name: string;
  phone: string;
  billingAddress: Address;
  shippingAddress: Address;
};

type Address = {
  name: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type WalletDetails = {
  expressPaymentType?: string;
  billingDetails?: any;
  shippingAddress?: any;
};

const CREATE_ENDPOINT = '/.netlify/functions/stripe-create-payment-intent';
const FINALIZE_ENDPOINT = '/.netlify/functions/stripe-finalize-order';
const STATUS_ENDPOINT = '/.netlify/functions/stripe-payment-status';
const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 15;

const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();

const getStripePromise = (publishableKey: string) => {
  let promise = stripePromiseCache.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, promise);
  }
  return promise;
};

const readJson = async (response: Response): Promise<any> => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const hasSupportedWallet = (event: any): boolean => {
  const methods = event?.availablePaymentMethods || event?.paymentMethods || {};
  const available = (value: any) => value === true || value?.available === true;
  return available(methods.applePay) || available(methods.googlePay);
};

const humanizeStripeError = (error: any): string => {
  const code = String(
    error?.details?.providerCode
    || error?.providerCode
    || error?.code
    || error?.decline_code
    || '',
  ).toLowerCase();
  if (code === 'card_declined' || code === 'generic_decline') {
    return 'Your card was declined. Try another card or choose PayPal.';
  }
  if (code === 'insufficient_funds') {
    return 'This card has insufficient funds. Try another payment method.';
  }
  if (code === 'expired_card') return 'This card has expired. Check the date or try another card.';
  if (code === 'incorrect_cvc') return 'The card security code is incorrect. Check it and try again.';
  if (code === 'processing_error') return 'The payment network could not process this card. Please try again.';
  if (code === 'payment_intent_unexpected_state') {
    return 'This payment session expired. Your cart is safe—please try again.';
  }
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  return 'We could not complete the payment. Your cart is safe—please try again.';
};

const isDefinitivePaymentFailure = (error: any): boolean => {
  if (error?.paymentStatusUnknown === true || error?.doNotRetry === true) return false;
  const code = String(
    error?.details?.providerCode
    || error?.providerCode
    || error?.code
    || error?.decline_code
    || '',
  ).toLowerCase();
  const status = String(error?.payment_intent?.status || '').toLowerCase();
  return error?.type === 'card_error'
    || status === 'requires_payment_method'
    || status === 'canceled'
    || [
      'card_declined',
      'expired_card',
      'incorrect_cvc',
      'insufficient_funds',
      'payment_intent_authentication_failure',
      'payment_intent_unexpected_state',
    ].includes(code);
};

const normalizeWalletAddress = (raw: any, fallbackName = ''): Address => ({
  name: raw?.name || fallbackName || '',
  street: raw?.address?.line1 || raw?.line1 || raw?.addressLine?.[0] || '',
  street2: raw?.address?.line2 || raw?.line2 || raw?.addressLine?.[1] || '',
  city: raw?.address?.city || raw?.city || raw?.locality || '',
  state: raw?.address?.state || raw?.state || raw?.administrativeArea || '',
  zip: raw?.address?.postal_code || raw?.postal_code || raw?.postalCode || '',
  country: raw?.address?.country || raw?.country || raw?.countryCode || 'US',
});

const walletCustomer = (event: WalletDetails, fallbackPhone: string): SubmittedCustomer => {
  const billing = event.billingDetails || {};
  const name = billing.name || event.shippingAddress?.name || '';
  const billingAddress = normalizeWalletAddress(billing, name);
  const shippingAddress = normalizeWalletAddress(event.shippingAddress, name);
  return {
    email: billing.email || '',
    name,
    phone: selectWalletCheckoutPhone({
      billingPhone: billing.phone,
      shippingPhone: event.shippingAddress?.phone,
      fallbackPhone,
    }),
    billingAddress,
    shippingAddress,
  };
};

const formCustomer = (customer: CustomerFormState): SubmittedCustomer => {
  const name = `${customer.firstName.trim()} ${customer.lastName.trim()}`.trim();
  const billingAddress: Address = {
    name,
    street: customer.street.trim(),
    street2: customer.street2.trim(),
    city: customer.city.trim(),
    state: customer.state.trim(),
    zip: customer.zip.trim(),
    country: customer.country.trim().toUpperCase(),
  };
  const shippingAddress: Address = customer.shippingSame
    ? billingAddress
    : {
        name: customer.shippingName.trim(),
        street: customer.shippingStreet.trim(),
        street2: customer.shippingStreet2.trim(),
        city: customer.shippingCity.trim(),
        state: customer.shippingState.trim(),
        zip: customer.shippingZip.trim(),
        country: customer.shippingCountry.trim().toUpperCase(),
      };
  return {
    email: customer.email.trim(),
    name,
    phone: customer.phone.trim(),
    billingAddress,
    shippingAddress,
  };
};

const isPaidPayload = (payload: any): boolean => Boolean(
  payload?.ok === true
  && payload?.paid === true
  && (payload?.finalized === true || payload?.order?.payment_status === 'paid')
  && (payload?.orderId || payload?.order?.id)
  && payload?.confirmationToken,
);

const StripeCheckoutForm: React.FC<Omit<StripeCheckoutProps, 'publishableKey'> & {
  signature: string;
}> = ({
  total,
  onSuccess,
  onError,
  disabled = false,
  onSwitchToPayPal,
  resumeCheckout,
  onPaymentStateChange,
  onCanonicalQuote,
  signature,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const { items, discountCode, sameDayHitService, saturdayDelivery } = useCartStore();
  const resumedStripe = resumeCheckout?.provider === 'stripe' ? resumeCheckout : null;
  const [walletsReady, setWalletsReady] = useState(false);
  const [walletsAvailable, setWalletsAvailable] = useState(false);
  const [walletPhoneRequired, setWalletPhoneRequired] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(() => (
    resumedStripe
      ? (resumedStripe.phase === 'requires_action'
          ? 'Restoring the bank authentication required for this payment…'
          : 'Restoring and securely verifying your payment…')
      : null
  ));
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [pendingNextAction, setPendingNextAction] = useState<{
    paymentIntentId: string;
    clientSecret: string;
  } | null>(null);
  const [customer, setCustomer] = useState<CustomerFormState>({
    firstName: '',
    lastName: '',
    email: user?.email || '',
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
  const initialState = useMemo(() => {
    const stored = readStripeCheckoutState(signature) || createStripeCheckoutState(signature);
    if (!resumedStripe?.checkoutKey) return stored;
    return {
      ...stored,
      checkoutKey: resumedStripe.checkoutKey,
      orderId: resumedStripe.orderId || stored.orderId,
      paymentIntentId: resumedStripe.paymentIntentId || stored.paymentIntentId,
      phase: resumedStripe.phase === 'requires_action'
        ? 'requires_action' as const
        : resumedStripe.phase === 'verifying' || resumedStripe.phase === 'processing'
          ? 'verifying' as const
          : 'confirming' as const,
      updatedAt: resumedStripe.updatedAt,
    };
  }, [resumedStripe?.checkoutKey, resumedStripe?.orderId, resumedStripe?.paymentIntentId, resumedStripe?.phase, resumedStripe?.updatedAt, signature]);
  const recoveryRef = useRef<StoredStripeCheckout>(initialState);
  const paymentFlightRef = useRef<Promise<void> | null>(null);
  const pollingFlightRef = useRef<Promise<void> | null>(null);
  const initialPollStartedForKeyRef = useRef<string | null>(null);
  const keyOnlyRecoveryRef = useRef(isStripeKeyOnlyRecovery(initialState));
  const nextActionFlightRef = useRef<Promise<void> | null>(null);
  const nextActionAttemptedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const customerDetailsRef = useRef<HTMLDivElement>(null);
  const walletPhoneRef = useRef<HTMLInputElement>(null);
  const submittedCustomerRef = useRef<SubmittedCustomer | null>(null);
  const shippingTrackedRef = useRef(false);
  const paymentTrackedRef = useRef(new Set<string>());

  const analyticsItems = useMemo<AnalyticsItem[]>(() => items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    return {
      item_id: String(item.id),
      item_name: getItemDisplayName(item),
      item_category: getProductCategory(item.product_type),
      item_variant: item.material || item.product_type || 'banner',
      price: Math.round(Number(item.line_total_cents || 0) / quantity),
      quantity,
    };
  }), [items]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!customer.email && user?.email) {
      setCustomer((current) => ({ ...current, email: user.email || '' }));
    }
  }, [customer.email, user?.email]);

  useEffect(() => {
    if (walletsReady) return;
    const timeout = window.setTimeout(() => {
      setWalletsAvailable(false);
      setWalletsReady(true);
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [walletsReady]);

  useEffect(() => {
    const loadingMessage = 'Card payment fields could not load. Refresh the page or choose PayPal.';
    if (stripe && elements) {
      setCheckoutError((current) => current === loadingMessage ? null : current);
      return;
    }
    const timeout = window.setTimeout(() => setCheckoutError(loadingMessage), 8000);
    return () => window.clearTimeout(timeout);
  }, [elements, stripe]);

  const persistRecovery = useCallback((updates: Partial<StoredStripeCheckout>) => {
    const next: StoredStripeCheckout = {
      ...recoveryRef.current,
      ...updates,
      signature,
      updatedAt: Date.now(),
    };
    recoveryRef.current = next;
    writeStripeCheckoutState(next);
    const phase: CheckoutPaymentPhase = next.phase === 'confirming'
      ? 'authorizing'
      : next.phase === 'requires_action'
        ? 'requires_action'
        : 'verifying';
    onPaymentStateChange?.({
      active: next.phase !== 'idle',
      provider: 'stripe',
      checkoutKey: next.checkoutKey,
      phase,
      orderId: next.orderId,
      paymentIntentId: next.paymentIntentId,
      totalCents: total,
    });
  }, [onPaymentStateChange, signature, total]);

  const clearRecovery = useCallback(() => {
    const completedCheckoutKey = recoveryRef.current.checkoutKey;
    clearStripeCheckoutState(signature);
    recoveryRef.current = createStripeCheckoutState(signature);
    nextActionAttemptedRef.current.clear();
    keyOnlyRecoveryRef.current = false;
    setPendingNextAction(null);
    onPaymentStateChange?.({
      active: false,
      provider: 'stripe',
      checkoutKey: completedCheckoutKey,
      phase: 'verifying',
      totalCents: total,
    });
  }, [onPaymentStateChange, signature, total]);

  const rotateRecovery = useCallback(() => {
    const abandonedCheckoutKey = recoveryRef.current.checkoutKey;
    clearStripeCheckoutState(signature);
    const next = createStripeCheckoutState(signature);
    recoveryRef.current = next;
    writeStripeCheckoutState(next);
    nextActionAttemptedRef.current.clear();
    keyOnlyRecoveryRef.current = false;
    setPendingNextAction(null);
    onPaymentStateChange?.({
      active: false,
      provider: 'stripe',
      checkoutKey: abandonedCheckoutKey,
      phase: 'verifying',
      totalCents: total,
    });
  }, [onPaymentStateChange, signature, total]);

  const resetForRetry = useCallback((message?: string | null) => {
    nextActionAttemptedRef.current.clear();
    keyOnlyRecoveryRef.current = false;
    persistRecovery({ paymentIntentId: null, phase: 'idle' });
    setPendingNextAction(null);
    if (mountedRef.current) {
      setIsProcessing(false);
      setIsPolling(false);
      setVerificationMessage(null);
      setCheckoutError(message || null);
    }
  }, [persistRecovery]);

  const updateCustomer = <K extends keyof CustomerFormState>(
    field: K,
    value: CustomerFormState[K],
  ) => {
    setCustomer((current) => ({ ...current, [field]: value }));
    setCheckoutError(null);
  };

  const finishPaid = useCallback((payload: any) => {
    if (!isPaidPayload(payload)) {
      throw new Error('The payment was received, but the order is still being verified.');
    }
    const orderId = payload.orderId || payload.order.id;
    const order = payload.order || {};
    clearRecovery();
    setIsProcessing(false);
    setIsPolling(false);
    setVerificationMessage(null);
    setCheckoutError(null);
    onSuccess(orderId, {
      ...order,
      orderId,
      orderNumber: payload.orderNumber || order.order_number || null,
      orderConfirmationToken: payload.confirmationToken,
      shippingAddress: payload.shippingAddress
        || order.shippingAddress
        || order.shipping_address
        || submittedCustomerRef.current?.shippingAddress
        || null,
      customerEmail: payload.customerEmail || order.customer_email || submittedCustomerRef.current?.email || null,
      customerName: payload.customerName || order.customer_name || submittedCustomerRef.current?.name || null,
      customerPhone: payload.customerPhone || order.customer_phone || submittedCustomerRef.current?.phone || null,
      subtotal_cents: order.subtotal_cents,
      tax_cents: order.tax_cents,
      shipping_cents: order.shipping_cents,
      total_cents: order.total_cents,
      applied_discount_cents: order.applied_discount_cents,
      applied_discount_label: order.applied_discount_label,
      applied_discount_type: order.applied_discount_type,
    });
  }, [clearRecovery, onSuccess]);

  const pollPaymentStatus = useCallback(async (attempts = POLL_ATTEMPTS): Promise<void> => {
    if (pollingFlightRef.current) return pollingFlightRef.current;
    const flight = (async () => {
      const { checkoutKey } = recoveryRef.current;
      if (!checkoutKey) return;
      setIsPolling(true);
      setIsProcessing(false);
      setCheckoutError(null);
      setVerificationMessage('Your payment is being securely verified. Please keep this page open.');
      persistRecovery({ phase: 'verifying' });
      let absentKeyObservations = 0;

      for (let attempt = 0; attempt < attempts && mountedRef.current; attempt += 1) {
        try {
          const response = await fetch(STATUS_ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ checkoutKey }),
          });
          const payload = await readJson(response);
          if (response.ok && isPaidPayload(payload)) {
            finishPaid(payload);
            return;
          }

          const boundOrderId = typeof payload?.orderId === 'string' ? payload.orderId : null;
          const boundPaymentIntentId = typeof payload?.paymentIntentId === 'string'
            ? payload.paymentIntentId
            : null;
          if (boundOrderId || boundPaymentIntentId) {
            if (boundPaymentIntentId || payload?.activePayment === true) {
              keyOnlyRecoveryRef.current = false;
            }
            persistRecovery({
              orderId: boundOrderId || recoveryRef.current.orderId,
              paymentIntentId: boundPaymentIntentId || recoveryRef.current.paymentIntentId,
              phase: payload?.status === 'requires_action' ? 'requires_action' : 'verifying',
            });
          }

          if (
            payload?.status === 'requires_action'
            && payload?.requiresAction === true
            && typeof payload?.clientSecret === 'string'
            && payload.clientSecret
            && boundPaymentIntentId
          ) {
            // Never surprise the customer by reopening a wallet/3DS sheet from
            // a poll or reload. Authentication resumes only from their button.
            setPendingNextAction({
              paymentIntentId: boundPaymentIntentId,
              clientSecret: payload.clientSecret,
            });
            setIsPolling(false);
            setIsProcessing(false);
            setVerificationMessage('Your bank needs one more authentication step. Select Resume secure authentication to continue.');
            return;
          }

          const keyIsNotStarted = response.status === 404 || payload?.status === 'not_started';
          if (keyOnlyRecoveryRef.current && keyIsNotStarted) {
            // A lost browser response can race the server's first durable
            // order write. This state is reconstructed after a reload as well
            // as after an in-page fetch failure. Require the full bounded
            // absence window before declaring the flight safe to retry.
            const observation = observeStripeKeyOnlyAbsence(absentKeyObservations);
            absentKeyObservations = observation.observations;
            if (observation.safeToRetry) {
              keyOnlyRecoveryRef.current = false;
              resetForRetry(payload?.message || 'No payment was completed. Review the order and try again.');
              return;
            }
          } else if (response.status === 404 || payload?.safeToRetry === true) {
            keyOnlyRecoveryRef.current = false;
            resetForRetry(payload?.message || 'No payment was completed. Review the order and try again.');
            return;
          } else {
            absentKeyObservations = 0;
          }

          const verificationLocked = payload?.doNotRetry === true
            || payload?.paymentStatusUnknown === true
            || payload?.details?.doNotRetry === true
            || payload?.details?.paymentStatusUnknown === true;
          const terminal = !verificationLocked && (
            response.status === 409
            || ['requires_payment_method', 'canceled'].includes(payload?.status)
          );
          if (terminal) {
            const message = humanizeStripeError(payload);
            resetForRetry(message);
            onError(new Error(message));
            return;
          }
        } catch {
          // A transient status failure is safe to retry. Stripe/webhooks remain
          // authoritative and the persisted identifiers survive a refresh.
        }
        if (attempt < attempts - 1) await sleep(POLL_INTERVAL_MS);
      }

      if (mountedRef.current) {
        setIsPolling(false);
        setVerificationMessage('Verification is taking longer than usual. Your cart is safe, and you will not be charged twice.');
      }
    })().finally(() => {
      pollingFlightRef.current = null;
    });
    pollingFlightRef.current = flight;
    return flight;
  }, [finishPaid, onError, persistRecovery, resetForRetry]);

  useEffect(() => {
    if (!initialState.checkoutKey || initialState.phase === 'idle') return;
    if (initialPollStartedForKeyRef.current === initialState.checkoutKey) return;
    initialPollStartedForKeyRef.current = initialState.checkoutKey;
    void pollPaymentStatus();
  }, [initialState.checkoutKey, initialState.phase, pollPaymentStatus]);

  useEffect(() => {
    if (!resumedStripe?.checkoutKey) return;
    const current = recoveryRef.current;
    const resumedPhase = resumedStripe.phase === 'requires_action'
      ? 'requires_action'
      : resumedStripe.phase === 'authorizing'
        ? 'confirming'
        : 'verifying';
    const changed = current.checkoutKey !== resumedStripe.checkoutKey
      || (!current.orderId && Boolean(resumedStripe.orderId))
      || (!current.paymentIntentId && Boolean(resumedStripe.paymentIntentId))
      || current.phase !== resumedPhase;
    if (!changed) return;
    const next: StoredStripeCheckout = {
      ...current,
      checkoutKey: resumedStripe.checkoutKey,
      orderId: resumedStripe.orderId || current.orderId,
      paymentIntentId: resumedStripe.paymentIntentId || current.paymentIntentId,
      phase: resumedPhase,
      updatedAt: resumedStripe.updatedAt,
    };
    recoveryRef.current = next;
    writeStripeCheckoutState(next);
    void pollPaymentStatus();
  }, [pollPaymentStatus, resumedStripe?.checkoutKey, resumedStripe?.orderId, resumedStripe?.paymentIntentId, resumedStripe?.phase, resumedStripe?.updatedAt]);

  const trackCheckoutDetails = useCallback((method: string) => {
    if (!shippingTrackedRef.current) {
      shippingTrackedRef.current = trackShippingInfoEntered({
        items: analyticsItems,
        value: total,
        coupon: discountCode?.code || null,
      });
    }
    if (!paymentTrackedRef.current.has(method)) {
      const queued = trackPaymentInfoAdded({
        paymentType: 'stripe',
        items: analyticsItems,
        value: total,
        coupon: discountCode?.code || null,
      });
      if (queued) paymentTrackedRef.current.add(method);
    }
  }, [analyticsItems, discountCode?.code, total]);

  const postJson = useCallback(async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    return { response, payload };
  }, []);

  const finalizeOrder = useCallback(async () => {
    const { paymentIntentId, orderId, checkoutKey } = recoveryRef.current;
    if (!paymentIntentId || !orderId) throw new Error('Payment verification details are missing.');
    try {
      const { response, payload } = await postJson(FINALIZE_ENDPOINT, {
        paymentIntentId,
        orderId,
        checkoutKey,
      });
      if (response.ok && isPaidPayload(payload)) {
        finishPaid(payload);
        return;
      }
      if (response.status === 202 || payload?.status === 'processing') {
        await pollPaymentStatus();
        return;
      }
      const verificationLocked = payload?.doNotRetry === true
        || payload?.paymentStatusUnknown === true
        || payload?.details?.doNotRetry === true
        || payload?.details?.paymentStatusUnknown === true;
      const terminal = !verificationLocked && (
        response.status === 409
        || ['requires_payment_method', 'canceled'].includes(payload?.status)
      );
      if (terminal) {
        const message = humanizeStripeError(payload);
        resetForRetry(message);
        onError(new Error(message));
        return;
      }
      await pollPaymentStatus();
    } catch {
      await pollPaymentStatus();
    }
  }, [finishPaid, onError, pollPaymentStatus, postJson, resetForRetry]);

  const resumeRequiredAction = useCallback((): Promise<void> => {
    if (nextActionFlightRef.current) return nextActionFlightRef.current;
    const pending = pendingNextAction;
    if (!stripe || !pending) return Promise.resolve();

    const flight = (async () => {
      setIsProcessing(true);
      setCheckoutError(null);
      setVerificationMessage('Opening your bank’s secure authentication…');
      persistRecovery({
        paymentIntentId: pending.paymentIntentId,
        phase: 'requires_action',
      });
      nextActionAttemptedRef.current.add(pending.paymentIntentId);
      const actionResult = await stripe.handleNextAction({ clientSecret: pending.clientSecret });
      if (actionResult.error) {
        if (isDefinitivePaymentFailure(actionResult.error)) {
          const message = humanizeStripeError(actionResult.error);
          resetForRetry(message);
          onError(actionResult.error);
          return;
        }
        // Network/browser interruption is ambiguous. Keep the exact binding
        // and explicit resume button; never auto-open authentication again.
        setVerificationMessage('Authentication was interrupted before we received a final result. Check payment status, then resume only if prompted.');
        setCheckoutError(null);
        persistRecovery({ phase: 'requires_action' });
        return;
      }

      setPendingNextAction(null);
      persistRecovery({ phase: 'verifying' });
      await finalizeOrder();
    })().finally(() => {
      nextActionFlightRef.current = null;
      if (mountedRef.current) setIsProcessing(false);
    });
    nextActionFlightRef.current = flight;
    return flight;
  }, [finalizeOrder, onError, pendingNextAction, persistRecovery, resetForRetry, stripe]);

  const completePayment = useCallback(async (
    method: string,
    submittedCustomer: SubmittedCustomer,
  ) => {
    if (!stripe || !elements) throw new Error('Secure payment fields are still loading.');
    if (disabled) throw new Error('Please resolve the cart issue above before paying.');

    submittedCustomerRef.current = submittedCustomer;
    setCheckoutError(null);
    setCheckoutNotice(null);
    setVerificationMessage(null);
    setIsProcessing(true);
    persistRecovery({ phase: 'confirming' });
    trackCheckoutDetails(method);
    // Redirect-based authentication returns to checkout, where the persisted
    // PaymentIntent/order binding is verified server-side before we navigate
    // to the success page. The success page is never used as fulfillment.
    const returnUrl = `${window.location.origin}/checkout?stripe_return=1`;

    const tokenResult = await stripe.createConfirmationToken({
      elements,
      params: {
        payment_method_data: {
          billing_details: {
            name: submittedCustomer.name || undefined,
            email: submittedCustomer.email || undefined,
            phone: submittedCustomer.phone || undefined,
            address: {
              line1: submittedCustomer.billingAddress.street || undefined,
              line2: submittedCustomer.billingAddress.street2 || undefined,
              city: submittedCustomer.billingAddress.city || undefined,
              state: submittedCustomer.billingAddress.state || undefined,
              postal_code: submittedCustomer.billingAddress.zip || undefined,
              country: submittedCustomer.billingAddress.country || 'US',
            },
          },
        },
        shipping: {
          name: submittedCustomer.shippingAddress.name || submittedCustomer.name,
          phone: submittedCustomer.phone || undefined,
          address: {
            line1: submittedCustomer.shippingAddress.street,
            line2: submittedCustomer.shippingAddress.street2 || undefined,
            city: submittedCustomer.shippingAddress.city,
            state: submittedCustomer.shippingAddress.state,
            postal_code: submittedCustomer.shippingAddress.zip,
            country: submittedCustomer.shippingAddress.country || 'US',
          },
        },
        return_url: returnUrl,
      },
    });
    if (tokenResult.error || !tokenResult.confirmationToken) {
      throw tokenResult.error || new Error('Could not securely prepare this payment.');
    }

    let createResult: Awaited<ReturnType<typeof postJson>>;
    try {
      createResult = await postJson(CREATE_ENDPOINT, {
        confirmationTokenId: tokenResult.confirmationToken.id,
        checkoutKey: recoveryRef.current.checkoutKey,
        items,
        expectedTotalCents: total,
        userId: user?.id || null,
        customer: {
          email: submittedCustomer.email,
          name: submittedCustomer.name,
          phone: submittedCustomer.phone,
        },
        billingAddress: submittedCustomer.billingAddress,
        shippingAddress: submittedCustomer.shippingAddress,
        discountCode: discountCode?.code ? { code: discountCode.code } : null,
        sameDayHitService,
        saturdayDelivery,
        attribution: getStoredAttribution(),
      });
    } catch (error) {
      // The POST may have reached the server even when its response was lost.
      // Keep the checkout-key-only marker and ask the server for its bound
      // state; a 404/not_started response is what safely unlocks a retry.
      persistRecovery({ phase: 'verifying' });
      throw Object.assign(
        error instanceof Error ? error : new Error('Payment confirmation response was interrupted.'),
        { paymentStatusUnknown: true, checkoutKeyOnlyRecovery: true },
      );
    }
    const { response, payload } = createResult;
    if (response.ok && isPaidPayload(payload)) {
      finishPaid(payload);
      return;
    }
    const recoveryDetails = payload?.details || {};
    if (
      response.status === 409
      && (payload?.error === 'STALE_CART_TOTAL' || payload?.code === 'STALE_CART_TOTAL')
      && recoveryDetails.restartCheckout === true
      && recoveryDetails.canonicalQuote
    ) {
      const serverTotalCents = Number(recoveryDetails.serverTotalCents);
      const applied = onCanonicalQuote?.(
        recoveryDetails.canonicalQuote as CanonicalCartQuote,
        serverTotalCents,
      ) === true;
      rotateRecovery();
      throw Object.assign(new Error(applied
        ? 'The server found updated pricing. Review the new total before submitting a fresh payment.'
        : 'The server found updated pricing, but this cart could not be updated safely. Refresh checkout before paying.'), {
        code: 'STALE_CART_TOTAL',
        canonicalQuoteApplied: applied,
      });
    }
    if (
      payload?.error === 'CHECKOUT_DETAILS_CHANGED'
      && recoveryDetails.restartCheckout === true
    ) {
      // The cart is unchanged but the recipient/contact details were edited.
      // The old idempotency key is deliberately abandoned so the next click
      // creates a new, correctly bound pending order. Declines never use this.
      rotateRecovery();
      throw Object.assign(new Error(payload?.message || 'Checkout details changed. Review them and try again.'), {
        code: 'CHECKOUT_DETAILS_CHANGED',
      });
    }
    const recoveryOrderId = recoveryDetails.orderId || payload?.orderId;
    const recoveryPaymentIntentId = recoveryDetails.paymentIntentId || payload?.paymentIntentId;
    if (
      typeof recoveryOrderId === 'string'
      && typeof recoveryPaymentIntentId === 'string'
      && recoveryPaymentIntentId.startsWith('pi_')
    ) {
      // Persist even when the create/confirm response is a 503. The server may
      // have confirmed the payment before its Stripe request failed, so status
      // recovery must win over presenting another charge button.
      persistRecovery({
        orderId: recoveryOrderId,
        paymentIntentId: recoveryPaymentIntentId,
        phase: response.ok ? 'confirming' : 'verifying',
      });
    }
    if (!response.ok || !payload?.clientSecret || !payload?.paymentIntentId || !payload?.orderId) {
      const message = payload?.message || payload?.error || 'The cart changed before payment. Review your total and try again.';
      throw Object.assign(new Error(message), {
        type: response.status === 402 ? 'card_error' : undefined,
        code: response.status === 402
          ? (recoveryDetails.providerCode || recoveryDetails.stripeCode || recoveryDetails.code || 'card_declined')
          : (payload?.code || payload?.error),
        payment_intent: recoveryDetails.status
          ? { status: recoveryDetails.status }
          : undefined,
        paymentStatusUnknown: recoveryDetails.paymentStatusUnknown === true,
        doNotRetry: recoveryDetails.doNotRetry === true,
      });
    }
    if (Number(payload.amount) !== total || String(payload.currency).toLowerCase() !== 'usd') {
      throw new Error('Your total changed before payment. Review the updated cart and try again.');
    }

    persistRecovery({ orderId: payload.orderId, paymentIntentId: payload.paymentIntentId, phase: 'confirming' });

    // The server creates *and confirms* the PaymentIntent with the
    // ConfirmationToken. Stripe.js is only responsible for a customer action
    // (for example 3DS) when Stripe explicitly reports requires_action. A
    // second client-side confirmation would be incompatible with that flow.
    if (payload.status === 'requires_action') {
      nextActionAttemptedRef.current.add(payload.paymentIntentId);
      persistRecovery({ phase: 'requires_action' });
      const actionResult = await stripe.handleNextAction({
        clientSecret: payload.clientSecret,
      });
      if (actionResult.error) {
        if (isDefinitivePaymentFailure(actionResult.error)) throw actionResult.error;
        setPendingNextAction({
          paymentIntentId: payload.paymentIntentId,
          clientSecret: payload.clientSecret,
        });
        setVerificationMessage('Authentication was interrupted before we received a final result. Check payment status, then resume only if prompted.');
        persistRecovery({ phase: 'requires_action' });
        return;
      }
    } else if (['requires_payment_method', 'canceled'].includes(payload.status)) {
      throw Object.assign(new Error('The payment method was not accepted. Try another card or choose PayPal.'), {
        code: 'card_declined',
        payment_intent: { status: payload.status },
      });
    }
    await finalizeOrder();
  }, [
    disabled,
    discountCode?.code,
    elements,
    finalizeOrder,
    finishPaid,
    items,
    onCanonicalQuote,
    persistRecovery,
    postJson,
    rotateRecovery,
    sameDayHitService,
    saturdayDelivery,
    stripe,
    total,
    trackCheckoutDetails,
    user?.id,
  ]);

  const startPayment = useCallback((method: string, submittedCustomer: SubmittedCustomer) => {
    if (paymentFlightRef.current) return paymentFlightRef.current;
    const flight = completePayment(method, submittedCustomer)
      .catch(async (error) => {
        const hasProviderBinding = Boolean(
          recoveryRef.current.paymentIntentId && recoveryRef.current.orderId,
        );
        const requiresKeyOnlyRecovery = error?.checkoutKeyOnlyRecovery === true
          || error?.paymentStatusUnknown === true
          || error?.doNotRetry === true;
        if (!hasProviderBinding && requiresKeyOnlyRecovery) keyOnlyRecoveryRef.current = true;
        if ((hasProviderBinding || requiresKeyOnlyRecovery) && !isDefinitivePaymentFailure(error)) {
          setCheckoutError(null);
          setVerificationMessage('We are checking whether the payment completed. Please do not submit it again.');
          await pollPaymentStatus();
          return;
        }
        const message = humanizeStripeError(error);
        resetForRetry(message);
        onError(error instanceof Error ? error : new Error(message));
        throw error;
      })
      .finally(() => {
        paymentFlightRef.current = null;
        if (mountedRef.current) setIsProcessing(false);
      });
    paymentFlightRef.current = flight;
    return flight;
  }, [completePayment, onError, pollPaymentStatus, resetForRetry]);

  const submitCard = async () => {
    if (!stripe || !elements || paymentFlightRef.current) return;
    const validation = validateCheckoutCustomer(customer);
    if (validation) {
      setCheckoutError(validation.message);
      window.requestAnimationFrame(() => {
        if (validation.field === 'phone' && walletPhoneRequired) {
          walletPhoneRef.current?.focus();
          return;
        }
        customerDetailsRef.current?.querySelector<HTMLInputElement>(
          `[data-stripe-field="${validation.field}"]`,
        )?.focus();
      });
      return;
    }
    const submitResult = await elements.submit();
    if (submitResult.error) {
      setCheckoutError(humanizeStripeError(submitResult.error));
      return;
    }
    await startPayment('card', formCustomer(customer)).catch(() => undefined);
  };

  const customerFields: Array<{
    field: keyof CustomerFormState;
    label: string;
    type?: React.HTMLInputTypeAttribute;
    inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
    autoComplete?: string;
    wide?: boolean;
  }> = [
    { field: 'firstName', label: 'First name', autoComplete: 'given-name' },
    { field: 'lastName', label: 'Last name', autoComplete: 'family-name' },
    { field: 'email', label: 'Email', type: 'email', inputMode: 'email', autoComplete: 'email' },
    { field: 'phone', label: 'Phone', type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
    { field: 'country', label: 'Country', autoComplete: 'country' },
    { field: 'street', label: 'Street address', autoComplete: 'address-line1', wide: true },
    { field: 'street2', label: 'Apartment / suite (optional)', autoComplete: 'address-line2', wide: true },
    { field: 'city', label: 'City', autoComplete: 'address-level2' },
    { field: 'state', label: 'State', autoComplete: 'address-level1' },
    { field: 'zip', label: 'ZIP code', inputMode: 'numeric', autoComplete: 'postal-code' },
  ];

  const shippingFields: Array<{
    field: keyof CustomerFormState;
    label: string;
    autoComplete?: string;
    inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
    wide?: boolean;
  }> = [
    { field: 'shippingName', label: 'Shipping name', autoComplete: 'shipping name' },
    { field: 'shippingStreet', label: 'Shipping address', autoComplete: 'shipping address-line1', wide: true },
    { field: 'shippingStreet2', label: 'Shipping apartment / suite (optional)', autoComplete: 'shipping address-line2', wide: true },
    { field: 'shippingCity', label: 'Shipping city', autoComplete: 'shipping address-level2' },
    { field: 'shippingState', label: 'Shipping state', autoComplete: 'shipping address-level1' },
    { field: 'shippingZip', label: 'Shipping ZIP code', inputMode: 'numeric', autoComplete: 'shipping postal-code' },
    { field: 'shippingCountry', label: 'Shipping country', autoComplete: 'shipping country' },
  ];

  const currentValidation = checkoutError ? validateCheckoutCustomer(customer) : null;
  const busy = isProcessing || isPolling || Boolean(verificationMessage);
  const walletPhoneIsInvalid = walletPhoneRequired && !isValidCheckoutPhone(customer.phone);
  const focusWalletPhone = () => {
    window.requestAnimationFrame(() => walletPhoneRef.current?.focus());
  };
  const requireWalletPhone = () => {
    const message = 'Your wallet did not share a phone number. Enter a phone number for order updates, then select the wallet again. No payment was created.';
    setWalletPhoneRequired(true);
    setCheckoutError(message);
    focusWalletPhone();
    return message;
  };

  return (
    <div className="space-y-5">
      {!verificationMessage ? <section
        aria-labelledby="express-checkout-heading"
        className={walletsReady && !walletsAvailable ? 'hidden' : 'block'}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 id="express-checkout-heading" className="text-base font-bold text-[#0B1F3A]">
              Express checkout
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">The fastest available wallet appears automatically.</p>
          </div>
          <ShieldCheck className="h-5 w-5 flex-none text-emerald-600" aria-hidden="true" />
        </div>
        {walletPhoneRequired ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <label htmlFor="stripe-wallet-phone" className="block text-sm font-semibold text-slate-900">
              Phone number for wallet checkout *
            </label>
            <Input
              ref={walletPhoneRef}
              id="stripe-wallet-phone"
              className="mt-1 h-11 bg-white text-base sm:text-sm"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              aria-invalid={walletPhoneIsInvalid || undefined}
              aria-describedby="stripe-wallet-phone-help stripe-checkout-error"
              value={customer.phone}
              onChange={(event) => updateCustomer('phone', event.target.value)}
            />
            <p id="stripe-wallet-phone-help" className="mt-1 text-xs text-slate-700">
              Google Pay may not share a phone number. We use this only for your order and delivery updates.
            </p>
          </div>
        ) : null}
        <div className="relative min-h-[48px]">
          {!walletsReady ? (
            <div className="absolute inset-0 h-[48px] animate-pulse rounded-md bg-slate-100" aria-label="Loading available express payment methods" />
          ) : null}
          <div className={walletsReady ? 'opacity-100' : 'pointer-events-none opacity-0'}>
          <ExpressCheckoutElement
            options={{
              allowedShippingCountries: ['US'],
              billingAddressRequired: true,
              buttonHeight: 48,
              buttonType: { applePay: 'buy', googlePay: 'buy' },
              emailRequired: true,
              layout: { maxColumns: 2, maxRows: 1, overflow: 'never' },
              paymentMethods: {
                applePay: 'auto',
                googlePay: 'auto',
                link: 'never',
                paypal: 'never',
                amazonPay: 'never',
                klarna: 'never',
              },
              phoneNumberRequired: true,
              shippingAddressRequired: true,
              shippingRates: getStripeExpressShippingRates(),
            }}
            onReady={(event: any) => {
              setWalletsAvailable(hasSupportedWallet(event));
              setWalletsReady(true);
            }}
            onAvailablePaymentMethodsChange={(event: any) => {
              setWalletsAvailable(hasSupportedWallet(event));
              setWalletsReady(true);
            }}
            onLoadError={() => {
              setWalletsAvailable(false);
              setWalletsReady(true);
            }}
            onClick={(event: any) => {
              if (disabled || busy) {
                const message = busy
                  ? 'Another payment is already being securely verified. Check its status before trying again.'
                  : 'Please resolve the cart issue above before paying.';
                event.reject?.();
                setCheckoutError(message);
                return;
              }
              if (walletPhoneRequired && !isValidCheckoutPhone(customer.phone)) {
                event.reject?.();
                requireWalletPhone();
                return;
              }
              event.resolve?.({ shippingRates: getStripeExpressShippingRates() });
            }}
            onShippingAddressChange={(event: any) => event.resolve?.({
              shippingRates: getStripeExpressShippingRates(),
            })}
            onCancel={() => {
              if (!busy) {
                setCheckoutError(null);
                setCheckoutNotice('Express checkout was closed. No payment was completed. You can try again whenever you’re ready.');
                window.setTimeout(() => {
                  if (mountedRef.current) setCheckoutNotice(null);
                }, 4000);
              }
            }}
            onConfirm={async (event: any) => {
              if (!elements || busy) {
                const message = busy
                  ? 'Another payment is already being securely verified. Check its status before trying again.'
                  : 'Secure payment fields are not ready. Close the wallet and try again.';
                setCheckoutError(message);
                event.paymentFailed?.({ reason: 'fail', message });
                return;
              }
              const submittedWalletCustomer = walletCustomer(event, customer.phone);
              if (!isValidCheckoutPhone(submittedWalletCustomer.phone)) {
                const message = requireWalletPhone();
                event.paymentFailed?.({ reason: 'invalid_payment_data', message });
                return;
              }
              const submitResult = await elements.submit();
              if (submitResult.error) {
                const message = humanizeStripeError(submitResult.error);
                setCheckoutError(message);
                event.paymentFailed?.({ reason: 'invalid_payment_data', message });
                return;
              }
              try {
                await startPayment(event.expressPaymentType || 'wallet', submittedWalletCustomer);
              } catch (error) {
                event.paymentFailed?.({
                  reason: 'fail',
                  message: humanizeStripeError(error),
                });
              }
            }}
            />
          </div>
        </div>
      </section> : null}

      {!verificationMessage && walletsAvailable ? (
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium text-slate-500">or pay another way</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      ) : null}

      {!verificationMessage && onSwitchToPayPal ? (
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full border-[#18448D]/30 bg-white font-bold text-[#18448D] hover:bg-blue-50"
            disabled={disabled || busy}
            onClick={onSwitchToPayPal}
          >
            Pay with PayPal
          </Button>
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-500">or use a card</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </div>
      ) : null}

      {verificationMessage ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4" role="status" aria-live="polite">
          <div className="flex items-start gap-2">
            {isPolling
              ? <Loader2 className="mt-0.5 h-4 w-4 flex-none animate-spin text-blue-700" />
              : <Clock3 className="mt-0.5 h-4 w-4 flex-none text-blue-700" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-900">{verificationMessage}</p>
              {pendingNextAction && !isPolling ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 bg-[#18448D] text-white hover:bg-[#12366f]"
                  disabled={isProcessing}
                  onClick={() => void resumeRequiredAction()}
                >
                  {isProcessing
                    ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Opening authentication…</>
                    : 'Resume secure authentication'}
                </Button>
              ) : null}
              {!isPolling && recoveryRef.current.paymentIntentId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`${pendingNextAction ? 'ml-2' : ''} mt-3 border-blue-300 bg-white text-blue-800 hover:bg-blue-100`}
                  onClick={() => void pollPaymentStatus()}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Check payment status
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {checkoutError ? (
        <div id="stripe-checkout-error" role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
          <CircleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>{checkoutError}</span>
        </div>
      ) : null}

      {checkoutNotice ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
          {checkoutNotice}
        </div>
      ) : null}

      {!verificationMessage ? (
        <section aria-labelledby="card-payment-heading" className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#18448D]" aria-hidden="true" />
            <h3 id="card-payment-heading" className="text-base font-bold text-[#0B1F3A]">Credit or debit card</h3>
          </div>

          <div ref={customerDetailsRef} className="rounded-lg bg-slate-50/80 p-3 sm:p-4">
            <h4 className="mb-3 text-sm font-bold text-[#0B1F3A]">Contact &amp; delivery</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {customerFields
                .filter(({ field }) => field !== 'phone' || !walletPhoneRequired)
                .map(({ field, label, type = 'text', inputMode, autoComplete, wide }) => {
                const required = field !== 'street2';
                const isInvalid = currentValidation?.field === field;
                return (
                  <label key={field} htmlFor={`stripe-${field}`} className={`text-sm font-medium text-slate-800 ${wide ? 'sm:col-span-2' : ''}`}>
                    {label}{required ? ' *' : ''}
                    <Input
                      id={`stripe-${field}`}
                      data-stripe-field={field}
                      className="mt-1 h-11 bg-white text-base sm:text-sm"
                      type={type}
                      inputMode={field === 'zip' && customer.country.trim().toUpperCase() !== 'US' ? 'text' : inputMode}
                      autoComplete={autoComplete}
                      autoCapitalize={field === 'state' || field === 'country' ? 'characters' : undefined}
                      required={required}
                      aria-invalid={isInvalid || undefined}
                      aria-describedby={isInvalid ? 'stripe-checkout-error' : undefined}
                      value={String(customer[field])}
                      onChange={(event) => updateCustomer(field, event.target.value as never)}
                    />
                  </label>
                );
              })}

              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-800 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 flex-none accent-[#18448D]"
                  checked={customer.shippingSame}
                  onChange={(event) => updateCustomer('shippingSame', event.target.checked)}
                />
                Shipping address is the same as billing
              </label>

              {!customer.shippingSame ? shippingFields.map(({ field, label, inputMode, autoComplete, wide }) => {
                const required = field !== 'shippingStreet2';
                const isInvalid = currentValidation?.field === field;
                return (
                  <label key={field} htmlFor={`stripe-${field}`} className={`text-sm font-medium text-slate-800 ${wide ? 'sm:col-span-2' : ''}`}>
                    {label}{required ? ' *' : ''}
                    <Input
                      id={`stripe-${field}`}
                      data-stripe-field={field}
                      className="mt-1 h-11 bg-white text-base sm:text-sm"
                      inputMode={field === 'shippingZip' && customer.shippingCountry.trim().toUpperCase() !== 'US' ? 'text' : inputMode}
                      autoComplete={autoComplete}
                      autoCapitalize={field === 'shippingState' || field === 'shippingCountry' ? 'characters' : undefined}
                      required={required}
                      aria-invalid={isInvalid || undefined}
                      aria-describedby={isInvalid ? 'stripe-checkout-error' : undefined}
                      value={String(customer[field])}
                      onChange={(event) => updateCustomer(field, event.target.value as never)}
                    />
                  </label>
                );
              }) : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
            <PaymentElement
              options={{
                layout: { type: 'accordion', defaultCollapsed: false, radios: false, spacedAccordionItems: false },
                paymentMethodOrder: ['card'],
                wallets: { applePay: 'never', googlePay: 'never' },
                terms: { card: 'never' },
              }}
              onLoadError={() => setCheckoutError('Card payment fields could not load. Refresh the page or choose PayPal.')}
            />
          </div>

          <Button
            type="button"
            size="lg"
            className="h-12 w-full bg-[#FF6A00] text-base font-bold text-white shadow-sm hover:bg-[#E85F00] focus-visible:ring-[#18448D]"
            disabled={disabled || busy || !stripe || !elements}
            onClick={() => void submitCard()}
          >
            {isProcessing
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Completing secure payment…</>
              : `Pay $${(total / 100).toFixed(2)}`}
          </Button>
        </section>
      ) : null}

    </div>
  );
};

const StripeCheckout: React.FC<StripeCheckoutProps> = ({ publishableKey, total, ...props }) => {
  const { items, discountCode, sameDayHitService, saturdayDelivery } = useCartStore();
  const signature = useMemo(() => buildStripeCheckoutSignature({
    total,
    discountCode,
    sameDayHitService,
    saturdayDelivery,
    items,
  }), [discountCode, items, sameDayHitService, saturdayDelivery, total]);
  const stripePromise = useMemo(() => getStripePromise(publishableKey), [publishableKey]);
  const options = useMemo<StripeElementsOptions>(() => ({
    mode: 'payment',
    amount: total,
    currency: 'usd',
    paymentMethodTypes: ['card'],
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#18448D',
        colorBackground: '#ffffff',
        colorText: '#0B1F3A',
        colorDanger: '#B42318',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        borderRadius: '8px',
        spacingUnit: '4px',
      },
      rules: {
        '.Input': { border: '1px solid #CBD5E1', boxShadow: 'none', padding: '12px' },
        '.Input:focus': { border: '1px solid #18448D', boxShadow: '0 0 0 2px rgba(24,68,141,0.12)' },
        '.Label': { fontWeight: '600', color: '#334155' },
      },
    },
    loader: 'auto',
  }), [total]);

  if (!publishableKey || total <= 0) return null;

  return (
    <Elements key={signature} stripe={stripePromise} options={options}>
      <StripeCheckoutForm {...props} total={total} signature={signature} />
    </Elements>
  );
};

export default StripeCheckout;
