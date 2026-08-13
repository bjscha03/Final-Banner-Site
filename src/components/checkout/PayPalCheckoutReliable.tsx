import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PayPalButtons,
  PayPalCardFieldsForm,
  PayPalCardFieldsProvider,
  PayPalScriptProvider,
  usePayPalCardFields,
} from '@paypal/react-paypal-js';
import { Clock3, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { getStoredAttribution } from '@/lib/attribution';
import { useCartStore, type CanonicalCartQuote } from '@/store/cart';
import { shouldUseDeployPreviewTestCheckout } from './checkoutEnvironment';
import { gtag, trackPaymentInfoAdded, trackShippingInfoEntered, type AnalyticsItem } from '@/lib/analytics';
import { getItemDisplayName, getProductCategory } from '@/lib/product-display';
import {
  type CustomerFormState,
  validateCheckoutCustomer,
} from './checkoutCustomer';
import {
  clearCheckoutCustomerDraft,
  readCheckoutCustomerDraft,
  writeCheckoutCustomerDraft,
} from './checkoutCustomerDraft';
import type {
  ActiveCheckoutMarker,
  CheckoutPaymentPhase,
  CheckoutPaymentStateEvent,
} from './checkoutPaymentState';
import { togglePayPalCardFields } from './paypalCardDisclosure';

interface PayPalCheckoutProps {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  /** Checkout already has an unresolved provider authorization. */
  providerLocked?: boolean;
  cardFirstLayout?: boolean;
  /** Hide PayPal-hosted card fields when Stripe already supplies the card form. */
  paypalOnly?: boolean;
  resumeCheckout?: ActiveCheckoutMarker | null;
  onPaymentStateChange?: (state: CheckoutPaymentStateEvent) => void;
  onCanonicalQuote?: (quote: CanonicalCartQuote, serverTotalCents: number) => boolean;
}

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live' | null;
  components?: string;
  clientToken?: string;
}

type SubmittedCustomer = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  shippingSameAsBilling: boolean;
  billingAddress: {
    name: string;
    street: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  shippingAddress: {
    name: string;
    street: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
};

const InlineCardSubmit: React.FC<{
  disabled: boolean;
  beforeSubmit: () => boolean;
}> = ({ disabled, beforeSubmit }) => {
  const { cardFieldsForm } = usePayPalCardFields();

  return (
    <Button
      type="button"
      className="mt-3 w-full"
      size="lg"
      disabled={disabled || !cardFieldsForm}
      onClick={() => {
        if (beforeSubmit()) void cardFieldsForm?.submit();
      }}
    >
      Pay Now
    </Button>
  );
};

type StoredCheckout = {
  checkoutKey: string;
  internalOrderId: string | null;
  state: 'authorizing' | 'processing' | 'verification';
  message?: string;
  signature: string;
  updatedAt: number;
};

const VERIFICATION_POLL_INTERVAL_MS = 2000;
const VERIFICATION_MAX_ATTEMPTS = 15;
const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const PAYPAL_RECOVERY_STORAGE_KEY = 'bof-paypal-checkout-v6';

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }
  throw new Error('Secure checkout requires a browser with cryptographic random-number support.');
};

const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

export const buildCheckoutIdentitySignature = ({
  total,
  discountCode,
  sameDayHitService,
  saturdayDelivery,
  items,
}: {
  total: number;
  discountCode?: { code?: string | null } | null;
  sameDayHitService?: boolean;
  saturdayDelivery?: boolean;
  items: any[];
}) => JSON.stringify({
  total,
  discount: discountCode?.code || null,
  sameDayHitService: Boolean(sameDayHitService),
  saturdayDelivery: Boolean(saturdayDelivery),
  items: items.map((item) => ({
    id: item.id,
    product_type: item.product_type || 'banner',
    width_in: item.width_in,
    height_in: item.height_in,
    quantity: item.quantity,
    line_total_cents: item.line_total_cents,
    material: item.material,
    file_key: item.file_key || null,
    thumbnail_url: item.thumbnail_url || null,
    web_preview_url: item.web_preview_url || null,
    final_render_file_key: item.final_render_file_key || null,
    artwork: item.artwork_manifest ? {
      publicId: item.artwork_manifest.publicId || null,
      version: item.artwork_manifest.version ?? null,
      originalUrl: item.artwork_manifest.originalUrl || null,
    } : null,
    placement: item.placement_preview ? {
      sourceIdentity: item.placement_preview.sourceIdentity || null,
      compositionSignature: item.placement_preview.compositionSignature || null,
      compositionRevision: item.placement_preview.compositionRevision ?? null,
      previewUrl: item.placement_preview.previewUrl || item.placement_preview.url || null,
      previewPublicId: item.placement_preview.previewPublicId || item.placement_preview.publicId || null,
    } : null,
    yard_sign_design_count: item.yard_sign_design_count || null,
    yard_sign_designs: Array.isArray(item.yard_sign_designs)
      ? item.yard_sign_designs.map((design: any) => ({
          id: design.id,
          fileKey: design.fileKey || null,
          compositionSignature: design.placementPreview?.compositionSignature || null,
          compositionRevision: design.placementPreview?.compositionRevision ?? null,
          previewUrl: design.placementPreview?.previewUrl
            || design.placementPreview?.url
            || design.previewThumbnailUrl
            || null,
        }))
      : null,
  })),
});

const readJson = async (response: Response): Promise<any> => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const firstNonEmpty = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const extractShipping = (payload: any) => {
  const direct = payload?.shippingAddress || null;
  const paypalShipping = payload?.paypalData?.purchase_units?.[0]?.shipping || null;
  const payer = payload?.paypalData?.payer || null;
  const address = direct || paypalShipping?.address || payer?.address || {};
  const name = firstNonEmpty(
    direct?.name,
    paypalShipping?.name?.full_name,
    `${payer?.name?.given_name || ''} ${payer?.name?.surname || ''}`,
  );
  const street = firstNonEmpty(direct?.street, address?.address_line_1, address?.line1, address?.street);
  const street2 = firstNonEmpty(direct?.street2, address?.address_line_2, address?.line2, address?.street2);
  const city = firstNonEmpty(direct?.city, address?.admin_area_2, address?.city);
  const state = firstNonEmpty(direct?.state, address?.admin_area_1, address?.state, address?.region);
  const zip = firstNonEmpty(direct?.zip, address?.postal_code, address?.zip);
  const country = firstNonEmpty(direct?.country, address?.country_code, address?.country) || 'US';
  if (!(name || street || city || state || zip)) return null;
  return { name, street, street2, city, state, zip, country };
};

const isCompletedCapture = (payload: any): boolean => Boolean(
  payload?.paymentCaptured === true
  && payload?.captureStatus === 'COMPLETED'
  && payload?.captureID
  && payload?.reconciliationRequired !== true
  && payload?.paymentStatusUnknown !== true
  && payload?.doNotRetry !== true
  && payload?.details?.paymentStatusUnknown !== true
  && payload?.details?.doNotRetry !== true,
);

const requiresVerification = (payload: any, status: number): boolean => Boolean(
  status === 202
  || payload?.doNotRetry === true
  || payload?.paymentStatusUnknown === true
  || payload?.reconciliationRequired === true
  || payload?.details?.doNotRetry === true
  || payload?.details?.paymentStatusUnknown === true
);

const isDefinitiveFailure = (payload: any, status: number): boolean => Boolean(
  payload?.paymentCaptured !== true
  && payload?.reconciliationRequired !== true
  && payload?.paymentStatusUnknown !== true
  && payload?.details?.paymentStatusUnknown !== true
  && payload?.details?.doNotRetry !== true
  && (
    status === 422
    || payload?.retryAllowed === true
    || payload?.details?.providerCode === 'INSTRUMENT_DECLINED'
    || payload?.providerCode === 'INSTRUMENT_DECLINED'
    || payload?.error === 'INSTRUMENT_DECLINED'
  ),
);

const trackPaymentClick = (method: 'card' | 'paypal') => {
  gtag('event', 'payment_button_click', {
    payment_method: method,
    device_type: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
  });
};

const PayPalCheckoutReliable: React.FC<PayPalCheckoutProps> = ({
  total,
  onSuccess,
  onError,
  disabled = false,
  providerLocked = false,
  cardFirstLayout = false,
  paypalOnly = false,
  resumeCheckout = null,
  onPaymentStateChange,
  onCanonicalQuote,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { items, discountCode, sameDayHitService, saturdayDelivery } = useCartStore();
  const isDeployPreview = shouldUseDeployPreviewTestCheckout();

  const [paypalConfig, setPayPalConfig] = useState<PayPalConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cardFieldsExpanded, setCardFieldsExpanded] = useState(false);
  const [customer, setCustomer] = useState<CustomerFormState>(() => (
    readCheckoutCustomerDraft(user?.email || '')
  ));

  const resumedPayPal = resumeCheckout?.provider === 'paypal' ? resumeCheckout : null;
  const internalOrderIdRef = useRef<string | null>(resumedPayPal?.orderId || null);
  const checkoutKeyRef = useRef<string>(resumedPayPal?.checkoutKey || randomId());
  const createFlightRef = useRef<Promise<string> | null>(null);
  const approvalFlightRef = useRef<Promise<void> | null>(null);
  const verificationLockedRef = useRef(false);
  const pollingRef = useRef(false);
  const lastDeclineAtRef = useRef(0);
  const staleCartHandledAtRef = useRef(0);
  const approvedOrderDataRef = useRef<any>(null);
  const shippingChangeDataRef = useRef<any>(null);
  const submittedCustomerRef = useRef<SubmittedCustomer | null>(null);
  const customerDetailsRef = useRef<HTMLDivElement>(null);
  const checkoutSignatureRef = useRef<string | null>(null);
  const activeBindingRef = useRef(Boolean(resumedPayPal));
  const recoveryHydratedKeyRef = useRef<string | null>(null);
  const shippingInfoTrackedRef = useRef(false);
  const paymentInfoTrackedRef = useRef(new Set<'card' | 'paypal'>());
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
    if (!customer.email && user?.email) {
      setCustomer((current) => {
        const next = { ...current, email: user.email || '' };
        writeCheckoutCustomerDraft(next);
        return next;
      });
    }
  }, [customer.email, user?.email]);

  const updateCustomer = <K extends keyof CustomerFormState>(
    field: K,
    value: CustomerFormState[K],
  ) => {
    setCustomer((current) => {
      const next = { ...current, [field]: value };
      writeCheckoutCustomerDraft(next);
      return next;
    });
  };

  const validateCustomer = useCallback(
    () => validateCheckoutCustomer(customer),
    [customer],
  );

  const getSubmittedCustomer = useCallback((): SubmittedCustomer => {
    const fullName = `${customer.firstName.trim()} ${customer.lastName.trim()}`.trim();
    const billingAddress = {
      name: fullName,
      street: customer.street.trim(),
      street2: customer.street2.trim(),
      city: customer.city.trim(),
      state: customer.state.trim().toUpperCase(),
      zip: customer.zip.trim(),
      country: customer.country.trim().toUpperCase(),
    };
    const shippingAddress = customer.shippingSame
      ? { ...billingAddress }
      : {
          name: customer.shippingName.trim(),
          street: customer.shippingStreet.trim(),
          street2: customer.shippingStreet2.trim(),
          city: customer.shippingCity.trim(),
          state: customer.shippingState.trim().toUpperCase(),
          zip: customer.shippingZip.trim(),
          country: customer.shippingCountry.trim().toUpperCase(),
        };

    return {
      firstName: customer.firstName.trim(),
      lastName: customer.lastName.trim(),
      fullName,
      email: customer.email.trim().toLowerCase(),
      phone: customer.phone.trim(),
      address1: billingAddress.street,
      address2: billingAddress.street2,
      city: billingAddress.city,
      state: billingAddress.state,
      postalCode: billingAddress.zip,
      country: billingAddress.country,
      shippingSameAsBilling: customer.shippingSame,
      billingAddress,
      shippingAddress,
    };
  }, [customer]);

  const checkoutSignature = useMemo(() => buildCheckoutIdentitySignature({
    total,
    discountCode,
    sameDayHitService,
    saturdayDelivery,
    items,
  }), [total, discountCode, sameDayHitService, saturdayDelivery, items]);

  useEffect(() => {
    if (checkoutSignatureRef.current === null) {
      checkoutSignatureRef.current = checkoutSignature;
      return;
    }
    if (checkoutSignatureRef.current === checkoutSignature) return;

    // Once PayPal/internal-order authorization begins, cart hydration or Back
    // navigation must not discard the only recovery binding. Checkout locks
    // mutations and the server verifies the originally bound order.
    if (activeBindingRef.current || verificationLockedRef.current) return;

    // A pending internal/PayPal order is valid for exactly one cart artwork
    // identity. A replacement placement artifact must start a fresh flight;
    // otherwise checkout can submit the newly displayed item against an order
    // prepared with the previous thumbnail/artwork bytes.
    checkoutSignatureRef.current = checkoutSignature;
    internalOrderIdRef.current = null;
    checkoutKeyRef.current = randomId();
    createFlightRef.current = null;
    approvalFlightRef.current = null;
    verificationLockedRef.current = false;
    pollingRef.current = false;
    approvedOrderDataRef.current = null;
    shippingChangeDataRef.current = null;
    setIsPreparing(false);
    setIsCapturing(false);
    setIsPolling(false);
    setVerificationMessage(null);
    setCheckoutError(null);
  }, [checkoutSignature]);

  const persistState = useCallback((state: StoredCheckout['state'], message?: string) => {
    if (typeof window === 'undefined') return;
    const value: StoredCheckout = {
      checkoutKey: checkoutKeyRef.current || randomId(),
      internalOrderId: internalOrderIdRef.current,
      state,
      message,
      signature: checkoutSignatureRef.current || checkoutSignature,
      updatedAt: Date.now(),
    };
    activeBindingRef.current = true;
    try {
      window.sessionStorage.setItem(PAYPAL_RECOVERY_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Checkout's in-memory provider-neutral lock still protects this flight.
    }
    const phase: CheckoutPaymentPhase = state === 'verification' ? 'verifying' : state;
    onPaymentStateChange?.({
      active: true,
      provider: 'paypal',
      checkoutKey: value.checkoutKey,
      phase,
      orderId: value.internalOrderId,
      totalCents: total,
    });
  }, [checkoutSignature, onPaymentStateChange, total]);

  const clearState = useCallback(() => {
    activeBindingRef.current = false;
    try {
      if (typeof window !== 'undefined') window.sessionStorage.removeItem(PAYPAL_RECOVERY_STORAGE_KEY);
    } catch {
      // The fixed marker expires independently if storage is unavailable.
    }
    onPaymentStateChange?.({
      active: false,
      provider: 'paypal',
      checkoutKey: checkoutKeyRef.current,
      phase: 'verifying',
      orderId: internalOrderIdRef.current,
      totalCents: total,
    });
  }, [onPaymentStateChange, total]);

  const resetForRetry = useCallback((message?: string) => {
    verificationLockedRef.current = false;
    pollingRef.current = false;
    createFlightRef.current = null;
    approvalFlightRef.current = null;
    setIsPolling(false);
    setVerificationMessage(null);
    setCheckoutError(message || null);
    clearState();
    if (checkoutSignatureRef.current !== checkoutSignature) {
      checkoutSignatureRef.current = checkoutSignature;
      internalOrderIdRef.current = null;
      checkoutKeyRef.current = randomId();
      approvedOrderDataRef.current = null;
      shippingChangeDataRef.current = null;
    }
  }, [checkoutSignature, clearState]);

  const rotatePendingBinding = useCallback(() => {
    // STALE_CART_TOTAL is returned before PayPal order creation/capture. It is
    // therefore safe—and required—to abandon only this pending checkout key.
    // Declines and ambiguous provider outcomes never use this path.
    clearState();
    verificationLockedRef.current = false;
    pollingRef.current = false;
    createFlightRef.current = null;
    approvalFlightRef.current = null;
    internalOrderIdRef.current = null;
    checkoutKeyRef.current = randomId();
    checkoutSignatureRef.current = checkoutSignature;
    approvedOrderDataRef.current = null;
    shippingChangeDataRef.current = null;
    setIsPreparing(false);
    setIsCapturing(false);
    setIsPolling(false);
    setVerificationMessage(null);
  }, [checkoutSignature, clearState]);

  const finishSuccess = useCallback((payload: any, fallbackOrderId?: string | null) => {
    const internalOrderId = payload?.internalOrderId
      || fallbackOrderId
      || internalOrderIdRef.current
      || payload?.orderID;
    if (!internalOrderId) throw new Error('Completed payment is missing its internal order ID.');

    verificationLockedRef.current = false;
    pollingRef.current = false;
    setIsPolling(false);
    setVerificationMessage(null);
    setCheckoutError(null);
    clearState();
    clearCheckoutCustomerDraft();

    const shippingAddress = extractShipping(payload)
      || submittedCustomerRef.current?.shippingAddress
      || null;
    toast({
      title: 'Payment Successful!',
      description: `Your payment of $${(total / 100).toFixed(2)} was completed.`,
    });
    onSuccess(internalOrderId, {
      ...payload,
      customerEmail: payload?.customerEmail || submittedCustomerRef.current?.email || null,
      customerName: payload?.customerName || submittedCustomerRef.current?.fullName || null,
      customerPhone: payload?.customerPhone || submittedCustomerRef.current?.phone || null,
      shippingAddress,
      subtotal_cents: payload?.subtotal_cents ?? total,
      tax_cents: payload?.tax_cents ?? 0,
      total_cents: payload?.total_cents ?? total,
    });
  }, [clearState, onSuccess, toast, total]);

  const pollPaymentStatus = useCallback(async () => {
    const internalOrderId = internalOrderIdRef.current;
    if (!internalOrderId || pollingRef.current) return;

    pollingRef.current = true;
    setIsPolling(true);

    try {
      for (
        let attempt = 0;
        attempt < VERIFICATION_MAX_ATTEMPTS && verificationLockedRef.current;
        attempt += 1
      ) {
        let response: Response | null = null;
        let payload: any = {};
        try {
          response = await fetch('/.netlify/functions/paypal-payment-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              internalOrderId,
              checkoutKey: checkoutKeyRef.current,
              approvedOrderData: approvedOrderDataRef.current,
              shippingChangeData: shippingChangeDataRef.current,
              customerInfo: submittedCustomerRef.current,
            }),
          });
          payload = await readJson(response);
        } catch (error) {
          console.error('[PayPalCheckout] payment status poll failed', error);
        }

        if (response && isCompletedCapture(payload)) {
          finishSuccess(payload, internalOrderId);
          return;
        }

        if (response && isDefinitiveFailure(payload, response.status)) {
          const message = payload?.message
            || 'Your card was declined. Use a different card or payment method and try again.';
          lastDeclineAtRef.current = Date.now();
          resetForRetry(message);
          toast({
            title: 'Payment method declined',
            description: message,
            variant: 'destructive',
          });
          return;
        }

        if (
          response?.status === 200
          && payload?.retryAllowed === true
          && payload?.paymentCaptured !== true
        ) {
          resetForRetry(payload?.message || 'No payment was completed. You may try again.');
          return;
        }

        if (attempt < VERIFICATION_MAX_ATTEMPTS - 1) {
          await sleep(VERIFICATION_POLL_INTERVAL_MS);
        }
      }

      if (verificationLockedRef.current) {
        const message = 'PayPal verification is taking longer than usual. Do not submit another payment; use Check payment status below.';
        setVerificationMessage(message);
        persistState('verification', message);
      }
    } finally {
      pollingRef.current = false;
      setIsPolling(false);
    }
  }, [finishSuccess, persistState, resetForRetry, toast]);

  const startVerification = useCallback((message?: string) => {
    const text = message || 'We are confirming your payment. Do not submit another payment.';
    verificationLockedRef.current = true;
    setCheckoutError(null);
    setVerificationMessage(text);
    persistState('verification', text);
    void pollPaymentStatus();
  }, [persistState, pollPaymentStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(
        window.sessionStorage.getItem(PAYPAL_RECOVERY_STORAGE_KEY) || 'null',
      ) as StoredCheckout | null;
      const marker = resumeCheckout?.provider === 'paypal' ? resumeCheckout : null;
      const checkoutKey = marker?.checkoutKey || saved?.checkoutKey;
      const internalOrderId = marker?.orderId || saved?.internalOrderId;
      if (checkoutKey && recoveryHydratedKeyRef.current === checkoutKey) return;
      if (checkoutKey) recoveryHydratedKeyRef.current = checkoutKey;
      if (checkoutKey) checkoutKeyRef.current = checkoutKey;
      if (internalOrderId) internalOrderIdRef.current = internalOrderId;

      if (
        internalOrderId
        && (
          marker
          || (saved && Date.now() - Number(saved.updatedAt || 0) < VERIFICATION_TTL_MS)
        )
      ) {
        startVerification(saved?.message || 'We are restoring and verifying your PayPal payment. Do not submit another payment.');
      } else if (marker && !internalOrderId) {
        resetForRetry('PayPal setup was interrupted before authorization. No payment was completed; you may try again.');
      }
    } catch {
      window.sessionStorage.removeItem(PAYPAL_RECOVERY_STORAGE_KEY);
    }
  }, [resetForRetry, resumeCheckout, startVerification]);

  useEffect(() => {
    if (isDeployPreview) {
      setPayPalConfig(null);
      setIsLoadingConfig(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    const load = async () => {
      try {
        const response = await fetch('/.netlify/functions/paypal-config', {
          signal: controller.signal,
        });
        const payload = await readJson(response);
        if (!response.ok || !payload?.enabled || !payload?.clientId) {
          throw new Error(payload?.error || 'Secure checkout is temporarily unavailable.');
        }
        if (payload.components !== 'buttons,card-fields' || !payload.clientToken) {
          throw new Error('Unsupported PayPal checkout configuration.');
        }
        setPayPalConfig(payload);
      } catch (error) {
        console.error('[PayPalCheckout] config load failed', error);
        setPayPalConfig({
          enabled: false,
          clientId: null,
          environment: null,
          components: 'buttons,card-fields',
        });
      } finally {
        window.clearTimeout(timeout);
        setIsLoadingConfig(false);
      }
    };

    void load();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isDeployPreview]);

  const handleTestPayment = async () => {
    setIsPreparing(true);
    setCheckoutError(null);
    try {
      const response = await fetch('/.netlify/functions/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id || null,
          email: user?.email || `preview-${checkoutKeyRef.current}@bannersonthefly.com`,
          subtotal_cents: total,
          tax_cents: 0,
          total_cents: total,
          currency: 'usd',
          items,
          discountCode,
          sameDayHitService: Boolean(sameDayHitService),
          saturdayDelivery: Boolean(saturdayDelivery),
          attribution: getStoredAttribution(),
          checkout_mode: 'admin_deploy_preview_test',
          payment_method: 'admin_deploy_preview_test',
        }),
      });
      const payload = await readJson(response);
      if (!response.ok || !(payload?.id || payload?.orderId)) {
        throw new Error(payload?.message || payload?.error || 'Test order failed.');
      }
      clearState();
      clearCheckoutCustomerDraft();
      onSuccess(payload.id || payload.orderId, payload.order);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test order failed.';
      setCheckoutError(message);
      onError(error);
    } finally {
      setIsPreparing(false);
    }
  };

  const preparePayPalOrder = async (): Promise<string> => {
    const startedCheckoutSignature = checkoutSignature;
    if (verificationLockedRef.current) throw new Error('PAYMENT_VERIFICATION_LOCKED');
    setIsPreparing(true);
    setCheckoutError(null);
    persistState('authorizing');

    try {
      const submitted = submittedCustomerRef.current;
      if (!submitted) throw new Error('Complete the required customer information before payment.');

      if (!internalOrderIdRef.current) {
        const pendingResponse = await fetch('/.netlify/functions/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id || null,
            email: submitted.email,
            customer_name: submitted.fullName,
            customer_first_name: submitted.firstName,
            customer_phone: submitted.phone,
            shipping_name: submitted.shippingAddress.name,
            shipping_street: submitted.shippingAddress.street,
            shipping_street2: submitted.shippingAddress.street2,
            shipping_city: submitted.shippingAddress.city,
            shipping_state: submitted.shippingAddress.state,
            shipping_zip: submitted.shippingAddress.zip,
            shipping_country: submitted.shippingAddress.country,
            shippingAddress: submitted.shippingAddress,
            billingAddress: submitted.billingAddress,
            customer: submitted,
            customerInfo: submitted,
            subtotal_cents: total,
            tax_cents: 0,
            total_cents: total,
            currency: 'usd',
            payment_method: 'paypal',
            payment_status: 'pending',
            checkout_idempotency_key: checkoutKeyRef.current,
            items,
            discountCode,
            sameDayHitService: Boolean(sameDayHitService),
            saturdayDelivery: Boolean(saturdayDelivery),
            attribution: getStoredAttribution(),
          }),
        });
        const pending = await readJson(pendingResponse);
        if (checkoutSignatureRef.current !== startedCheckoutSignature) {
          throw new Error('CHECKOUT_IDENTITY_CHANGED');
        }
        const pendingDetails = pending?.details || {};
        if (
          pendingResponse.status === 409
          && (pending?.error === 'STALE_CART_TOTAL' || pending?.code === 'STALE_CART_TOTAL')
          && pendingDetails.restartCheckout === true
          && pendingDetails.canonicalQuote
        ) {
          const serverTotalCents = Number(pendingDetails.serverTotalCents);
          const applied = onCanonicalQuote?.(
            pendingDetails.canonicalQuote as CanonicalCartQuote,
            serverTotalCents,
          ) === true;
          staleCartHandledAtRef.current = Date.now();
          rotatePendingBinding();
          throw Object.assign(new Error(applied
            ? 'The server found updated pricing. Review the new total before submitting a fresh payment.'
            : 'The server found updated pricing, but this cart could not be updated safely. Refresh checkout before paying.'), {
            code: 'STALE_CART_TOTAL',
            canonicalQuoteApplied: applied,
          });
        }
        if (!pendingResponse.ok || !pending?.orderId) {
          throw new Error(
            pending?.message || pending?.error || 'Could not save the order before payment.',
          );
        }
        internalOrderIdRef.current = pending.orderId;
        persistState('authorizing');
      }

      const response = await fetch('/.netlify/functions/paypal-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internalOrderId: internalOrderIdRef.current,
          checkoutKey: checkoutKeyRef.current,
          totalCents: total,
          items,
          email: submitted.email,
          customer: submitted,
          customerInfo: submitted,
          billingAddress: submitted.billingAddress,
          shippingAddress: submitted.shippingAddress,
          user_id: user?.id || null,
          discountCode,
          sameDayHitService: Boolean(sameDayHitService),
          saturdayDelivery: Boolean(saturdayDelivery),
          attribution: getStoredAttribution(),
        }),
      });
      const payload = await readJson(response);
      if (checkoutSignatureRef.current !== startedCheckoutSignature) {
        throw new Error('CHECKOUT_IDENTITY_CHANGED');
      }

      if (payload?.paymentCaptured === true || requiresVerification(payload, response.status)) {
        startVerification(payload?.message);
        throw new Error('PAYMENT_VERIFICATION_LOCKED');
      }
      if (!response.ok || !payload?.paypalOrderId) {
        throw new Error(
          payload?.message
          || payload?.details?.providerCode
          || payload?.providerCode
          || payload?.error
          || 'Could not start PayPal checkout.',
        );
      }
      return payload.paypalOrderId;
    } finally {
      setIsPreparing(false);
    }
  };

  const handleCreateOrder = (): Promise<string> => {
    if (createFlightRef.current) return createFlightRef.current;
    const flight = preparePayPalOrder().finally(() => {
      createFlightRef.current = null;
    });
    createFlightRef.current = flight;
    return flight;
  };

  const approveOnce = async (data: any, actions: any) => {
    setIsCapturing(true);
    setCheckoutError(null);
    persistState('processing');

    try {
      let approvedOrderData = null;
      try {
        if (typeof actions?.order?.get === 'function') {
          approvedOrderData = await actions.order.get();
          approvedOrderDataRef.current = approvedOrderData;
        }
      } catch (error) {
        console.warn('[PayPalCheckout] approved order details were unavailable', error);
      }

      const response = await fetch('/.netlify/functions/paypal-capture-minimal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderID: data.orderID,
          internalOrderId: internalOrderIdRef.current,
          checkoutKey: checkoutKeyRef.current,
          approvedOrderData,
          shippingChangeData: shippingChangeDataRef.current,
          customer: submittedCustomerRef.current,
          customerInfo: submittedCustomerRef.current,
          billingAddress: submittedCustomerRef.current?.billingAddress,
          shippingAddress: submittedCustomerRef.current?.shippingAddress,
        }),
      });
      const payload = await readJson(response);

      if (isCompletedCapture(payload)) {
        finishSuccess(payload, internalOrderIdRef.current);
        return;
      }

      if (isDefinitiveFailure(payload, response.status)) {
        const message = payload?.message
          || 'Your card was declined. Use a different card or payment method and try again.';
        lastDeclineAtRef.current = Date.now();
        resetForRetry(message);
        toast({
          title: 'Payment method declined',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      if (requiresVerification(payload, response.status)) {
        startVerification(payload?.message);
        return;
      }

      const message = payload?.message
        || payload?.details?.providerCode
        || payload?.providerCode
        || payload?.error
        || 'Payment could not be completed.';
      resetForRetry(message);
      onError(new Error(message));
    } catch (error) {
      if (verificationLockedRef.current) return;
      const message = error instanceof Error ? error.message : 'Payment could not be completed.';
      if (message === 'PAYMENT_VERIFICATION_LOCKED') return;
      // The customer already approved PayPal before capture began. A lost
      // response is therefore ambiguous: retain the exact checkout binding
      // and reconcile instead of exposing another payment attempt.
      startVerification('We are checking the PayPal payment result. Do not submit another payment.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleApprove = (data: any, actions: any): Promise<void> => {
    if (approvalFlightRef.current) return approvalFlightRef.current;
    const flight = approveOnce(data, actions).finally(() => {
      if (!verificationLockedRef.current) approvalFlightRef.current = null;
    });
    approvalFlightRef.current = flight;
    return flight;
  };

  const handleProviderError = (error: any) => {
    if (verificationLockedRef.current) return;
    if (Date.now() - lastDeclineAtRef.current < 5000) return;
    if (Date.now() - staleCartHandledAtRef.current < 5000) return;

    console.error('[PayPalCheckout] provider error', error);
    setIsPreparing(false);
    setIsCapturing(false);
    const message = 'PayPal could not complete the payment. Please choose a payment method and try again.';
    resetForRetry(message);
    onError(error instanceof Error ? error : new Error(message));
  };

  if (isDeployPreview) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <strong>Deploy Preview Test Checkout:</strong> Create an order without processing a real payment.
        </div>
        <Button
          onClick={handleTestPayment}
          disabled={disabled || isPreparing}
          variant="outline"
          className="w-full"
          size="lg"
        >
          {isPreparing
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing Test Order...</>
            : 'Place Test Order — No Payment'}
        </Button>
        {checkoutError ? <p className="text-sm text-red-700">{checkoutError}</p> : null}
      </div>
    );
  }

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        <span>Loading secure checkout…</span>
      </div>
    );
  }

  if (!paypalConfig?.enabled || !paypalConfig.clientId || !paypalConfig.clientToken) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Secure checkout is temporarily unavailable. Please refresh the page or contact support.
      </div>
    );
  }

  const initialOptions: any = {
    clientId: paypalConfig.clientId,
    currency: 'USD',
    intent: 'capture',
    commit: true,
    vault: false,
    components: paypalOnly ? 'buttons' : 'buttons,card-fields',
    dataClientToken: paypalConfig.clientToken,
    disableFunding: 'paylater,credit',
  };

  const buttonsDisabled = disabled
    || providerLocked
    || isPreparing
    || isCapturing
    || Boolean(verificationMessage);
  // Cart validation must block the actual PayPal/card submission, not the
  // disclosure control. Customers still need to be able to open the hosted
  // card form, see what information is required, and correct checkout issues.
  const cardToggleDisabled = providerLocked
    || isPreparing
    || isCapturing
    || Boolean(verificationMessage);

  const trackValidatedCheckoutDetails = (method: 'card' | 'paypal') => {
    if (!shippingInfoTrackedRef.current) {
      shippingInfoTrackedRef.current = trackShippingInfoEntered({
        items: analyticsItems,
        value: total,
        coupon: discountCode?.code || null,
      });
    }
    if (!paymentInfoTrackedRef.current.has(method)) {
      const queued = trackPaymentInfoAdded({
        paymentType: method,
        items: analyticsItems,
        value: total,
        coupon: discountCode?.code || null,
      });
      if (queued) paymentInfoTrackedRef.current.add(method);
    }
  };

  const prepareCustomerForPayment = (method: 'card' | 'paypal'): boolean => {
    const validation = validateCustomer();
    if (validation) {
      setCheckoutError(validation.message);
      window.requestAnimationFrame(() => {
        const field = customerDetailsRef.current?.querySelector<HTMLInputElement>(
          `[data-checkout-field="${validation.field}"]`,
        );
        field?.focus();
      });
      return false;
    }
    submittedCustomerRef.current = getSubmittedCustomer();
    setCheckoutError(null);
    trackValidatedCheckoutDetails(method);
    return true;
  };

  const renderPayPalButton = () => (
    <PayPalButtons
      key={`paypal-${hash(checkoutSignature)}`}
      fundingSource="paypal"
      style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 42 }}
      disabled={buttonsDisabled}
      onClick={(_data, actions) => {
        trackPaymentClick('paypal');
        if (!prepareCustomerForPayment('paypal')) return actions.reject();
        return actions.resolve();
      }}
      createOrder={handleCreateOrder}
      onApprove={handleApprove}
      onError={handleProviderError}
      onShippingChange={(data: any, actions: any) => {
        shippingChangeDataRef.current = data?.shipping_address
          || data?.shippingAddress
          || data
          || null;
        if (typeof actions?.resolve === 'function') return actions.resolve();
        return Promise.resolve();
      }}
      onCancel={() => {
        if (verificationLockedRef.current) return;
        resetForRetry(null);
        toast({ title: 'Payment Cancelled', description: 'No payment was completed.' });
      }}
    />
  );

  const customerFields: Array<{
    field: keyof CustomerFormState;
    label: string;
    type?: React.HTMLInputTypeAttribute;
    inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
    autoComplete?: string;
    wide?: boolean;
  }> = [
    { field: 'firstName', label: 'First Name *', autoComplete: 'given-name' },
    { field: 'lastName', label: 'Last Name *', autoComplete: 'family-name' },
    { field: 'email', label: 'Email *', type: 'email', inputMode: 'email', autoComplete: 'email' },
    { field: 'phone', label: 'Phone *', type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
    { field: 'street', label: 'Street Address *', autoComplete: 'address-line1', wide: true },
    { field: 'street2', label: 'Apartment / Suite', autoComplete: 'address-line2', wide: true },
    { field: 'city', label: 'City *', autoComplete: 'address-level2' },
    { field: 'state', label: 'State *', autoComplete: 'address-level1' },
    { field: 'zip', label: 'ZIP *', inputMode: 'numeric', autoComplete: 'postal-code' },
  ];

  const shippingFields: Array<{
    field: keyof CustomerFormState;
    label: string;
    inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
    autoComplete?: string;
    wide?: boolean;
  }> = [
    { field: 'shippingName', label: 'Shipping Name *', autoComplete: 'shipping name' },
    { field: 'shippingStreet', label: 'Shipping Address *', autoComplete: 'shipping address-line1', wide: true },
    { field: 'shippingStreet2', label: 'Shipping Apartment / Suite', autoComplete: 'shipping address-line2', wide: true },
    { field: 'shippingCity', label: 'Shipping City *', autoComplete: 'shipping address-level2' },
    { field: 'shippingState', label: 'Shipping State *', autoComplete: 'shipping address-level1' },
    { field: 'shippingZip', label: 'Shipping ZIP *', inputMode: 'numeric', autoComplete: 'shipping postal-code' },
  ];

  const renderCustomerDetails = () => {
    const currentValidation = checkoutError ? validateCheckoutCustomer(customer) : null;
    return (
      <section
        ref={customerDetailsRef}
        aria-labelledby="checkout-customer-heading"
        className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
      >
        <div className="mb-4">
          <h3 id="checkout-customer-heading" className="text-base font-bold text-[#0B1F3A]">
            Contact &amp; delivery
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Enter these details once, then choose card or PayPal below. We use them for your receipt, artwork questions, and delivery.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {customerFields.map(({ field, label, type = 'text', inputMode, autoComplete, wide }) => {
            const required = field !== 'street2';
            const isInvalid = currentValidation?.field === field;
            return (
              <label
                key={field}
                htmlFor={`checkout-${field}`}
                className={`text-sm font-medium text-slate-800 ${wide ? 'sm:col-span-2' : ''}`}
              >
                {label}
                <Input
                  id={`checkout-${field}`}
                  name={`billing-${field}`}
                  data-checkout-field={field}
                  className="mt-1 h-11 text-base sm:text-sm"
                  type={type}
                  inputMode={field === 'zip' && customer.country.trim().toUpperCase() !== 'US' ? 'text' : inputMode}
                  autoComplete={autoComplete}
                  autoCapitalize={field === 'state' || field === 'country' ? 'characters' : undefined}
                  required={required}
                  aria-invalid={isInvalid || undefined}
                  aria-describedby={isInvalid ? 'checkout-customer-error' : undefined}
                  value={String(customer[field])}
                  onChange={(event) => {
                    updateCustomer(field, event.target.value as never);
                    setCheckoutError(null);
                  }}
                />
              </label>
            );
          })}

          <div className="text-sm font-medium text-slate-800">
            Country *
            <div className="mt-1 flex h-11 items-center rounded-md border border-slate-200 bg-slate-100 px-3 text-slate-700" aria-label="Country: United States">
              United States
            </div>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-800 sm:col-span-2">
            <input
              type="checkbox"
              className="h-5 w-5 flex-none accent-[#18448D]"
              checked={customer.shippingSame}
              onChange={(event) => {
                updateCustomer('shippingSame', event.target.checked);
                setCheckoutError(null);
              }}
            />
            Shipping address is the same as billing
          </label>

          {!customer.shippingSame
            ? <>
              {shippingFields.map(({ field, label, inputMode, autoComplete, wide }) => {
                const required = field !== 'shippingStreet2';
                const isInvalid = currentValidation?.field === field;
                return (
                  <label
                    key={field}
                    htmlFor={`checkout-${field}`}
                    className={`text-sm font-medium text-slate-800 ${wide ? 'sm:col-span-2' : ''}`}
                  >
                    {label}
                    <Input
                      id={`checkout-${field}`}
                      name={field}
                      data-checkout-field={field}
                      className="mt-1 h-11 text-base sm:text-sm"
                      inputMode={field === 'shippingZip' && customer.shippingCountry.trim().toUpperCase() !== 'US' ? 'text' : inputMode}
                      autoComplete={autoComplete}
                      autoCapitalize={field === 'shippingState' || field === 'shippingCountry' ? 'characters' : undefined}
                      required={required}
                      aria-invalid={isInvalid || undefined}
                      aria-describedby={isInvalid ? 'checkout-customer-error' : undefined}
                      value={String(customer[field])}
                      onChange={(event) => {
                        updateCustomer(field, event.target.value as never);
                        setCheckoutError(null);
                      }}
                    />
                  </label>
                );
              })}
              <div className="text-sm font-medium text-slate-800">
                Shipping country *
                <div className="mt-1 flex h-11 items-center rounded-md border border-slate-200 bg-slate-100 px-3 text-slate-700" aria-label="Shipping country: United States">
                  United States
                </div>
              </div>
            </>
            : null}
        </div>
      </section>
    );
  };

  const renderInlineCardFields = () => (
    <div className="space-y-2.5">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full border-gray-900 bg-gray-900 text-white hover:bg-gray-800 hover:text-white"
        aria-expanded={cardFieldsExpanded}
        aria-controls="paypal-inline-card-fields"
        disabled={cardToggleDisabled}
        onClick={() => {
          setCheckoutError(null);
          setCardFieldsExpanded(togglePayPalCardFields);
          trackPaymentClick('card');
        }}
      >
        Pay with Debit or Credit Card
      </Button>

      {cardFieldsExpanded ? (
        <div id="paypal-inline-card-fields" className="rounded-lg border border-gray-200 p-4">
          <PayPalCardFieldsProvider
            createOrder={handleCreateOrder}
            onApprove={(data) => handleApprove(data, null)}
            onError={handleProviderError}
            onCancel={() => {
              if (!verificationLockedRef.current) resetForRetry(null);
            }}
          >
            <PayPalCardFieldsForm />
            <InlineCardSubmit
              disabled={buttonsDisabled}
              beforeSubmit={() => prepareCustomerForPayment('card')}
            />
          </PayPalCardFieldsProvider>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      {verificationMessage ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-2">
            {isPolling
              ? <Loader2 className="mt-0.5 h-4 w-4 flex-none animate-spin text-blue-700" />
              : <Clock3 className="mt-0.5 h-4 w-4 flex-none text-blue-700" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-blue-900">{verificationMessage}</p>
              {!isPolling ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 border-blue-300 bg-white text-blue-800 hover:bg-blue-50"
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

      {!verificationMessage && (isPreparing || isCapturing) ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span className="text-sm text-blue-900">
              {isCapturing ? 'Completing payment...' : 'Preparing secure checkout...'}
            </span>
          </div>
        </div>
      ) : null}

      {!verificationMessage ? renderCustomerDetails() : null}

      {checkoutError ? (
        <div
          id="checkout-customer-error"
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800"
        >
          {checkoutError}
        </div>
      ) : null}

      {!verificationMessage ? (
        <PayPalScriptProvider options={initialOptions}>
          <h3 className="mb-1 text-sm font-bold text-[#0B1F3A]">Choose payment method</h3>
          <p className="mb-3 text-xs text-gray-600">
            {paypalOnly ? 'Complete your order securely with PayPal.' : 'Pay securely by card or PayPal. No PayPal account required.'}
          </p>
          {paypalOnly ? (
            renderPayPalButton()
          ) : cardFirstLayout ? (
            <div className="space-y-2.5">
              {renderInlineCardFields()}
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-[#E7D9C7]" />
                <span className="text-[11px] text-[#8B7355]">or</span>
                <span className="h-px flex-1 bg-[#E7D9C7]" />
              </div>
              {renderPayPalButton()}
            </div>
          ) : (
            <div className="space-y-2.5">
              {renderPayPalButton()}
              {renderInlineCardFields()}
            </div>
          )}
        </PayPalScriptProvider>
      ) : null}
    </div>
  );
};

export default PayPalCheckoutReliable;
