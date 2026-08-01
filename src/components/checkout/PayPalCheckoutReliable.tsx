import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { Clock3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { getStoredAttribution } from '@/lib/attribution';
import { useCartStore } from '@/store/cart';
import { shouldUseDeployPreviewTestCheckout } from './checkoutEnvironment';

interface PayPalCheckoutProps {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  cardFirstLayout?: boolean;
}

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live' | null;
}

type StoredCheckout = {
  checkoutKey: string;
  internalOrderId: string | null;
  state: 'idle' | 'processing' | 'verification';
  message?: string;
  updatedAt: number;
};

const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const preparationFlights = new Map<string, Promise<string>>();

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

const firstNonEmpty = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const readJson = async (response: Response): Promise<any> => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const extractShipping = (captureResult: any) => {
  const direct = captureResult?.shippingAddress || null;
  const paypalShipping = captureResult?.paypalData?.purchase_units?.[0]?.shipping || null;
  const payer = captureResult?.paypalData?.payer || null;
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
  && payload?.doNotRetry !== true,
);

const requiresVerificationLock = (payload: any, status: number): boolean => Boolean(
  status === 202
  || payload?.doNotRetry
  || payload?.paymentStatusUnknown
  || payload?.reconciliationRequired,
);

const trackPaymentClick = (method: 'card' | 'paypal') => {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'payment_button_click', {
    payment_method: method,
    device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
  });
};

const PayPalCheckoutReliable: React.FC<PayPalCheckoutProps> = ({
  total,
  onSuccess,
  onError,
  disabled = false,
  cardFirstLayout = false,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { items, discountCode, sameDayHitService, saturdayDelivery } = useCartStore();
  const isDeployPreview = shouldUseDeployPreviewTestCheckout();

  const [paypalConfig, setPayPalConfig] = useState<PayPalConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const internalOrderIdRef = useRef<string | null>(null);
  const checkoutKeyRef = useRef<string>('');
  const approvalFlightRef = useRef<Promise<void> | null>(null);
  const verificationLockedRef = useRef(false);

  const checkoutSignature = useMemo(() => JSON.stringify({
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
      final_render_file_key: item.final_render_file_key || null,
      yard_sign_design_count: item.yard_sign_design_count || null,
    })),
  }), [total, discountCode?.code, sameDayHitService, saturdayDelivery, items]);

  const storageKey = useMemo(
    () => `bof-paypal-checkout-v4:${hash(checkoutSignature)}`,
    [checkoutSignature],
  );

  if (!checkoutKeyRef.current && typeof window !== 'undefined') {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') as StoredCheckout | null;
      checkoutKeyRef.current = saved?.checkoutKey || randomId();
      internalOrderIdRef.current = saved?.internalOrderId || null;
      if (
        saved?.state === 'verification'
        && saved.internalOrderId
        && Date.now() - Number(saved.updatedAt || 0) < VERIFICATION_TTL_MS
      ) {
        verificationLockedRef.current = true;
      }
    } catch {
      checkoutKeyRef.current = randomId();
    }
  }

  const persistState = (state: StoredCheckout['state'], message?: string) => {
    if (typeof window === 'undefined') return;
    const value: StoredCheckout = {
      checkoutKey: checkoutKeyRef.current || randomId(),
      internalOrderId: internalOrderIdRef.current,
      state,
      message,
      updatedAt: Date.now(),
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  };

  const clearState = () => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(storageKey);
  };

  const lockForVerification = (message?: string) => {
    const text = message || 'We are confirming your payment. Do not submit another payment.';
    verificationLockedRef.current = true;
    setVerificationMessage(text);
    setCheckoutError(null);
    persistState('verification', text);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') as StoredCheckout | null;
      if (
        saved?.state === 'verification'
        && saved.internalOrderId
        && Date.now() - Number(saved.updatedAt || 0) < VERIFICATION_TTL_MS
      ) {
        internalOrderIdRef.current = saved.internalOrderId;
        checkoutKeyRef.current = saved.checkoutKey || checkoutKeyRef.current || randomId();
        lockForVerification(saved.message);
      }
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

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
        const response = await fetch('/.netlify/functions/paypal-config', { signal: controller.signal });
        const payload = await readJson(response);
        if (!response.ok || !payload?.enabled || !payload?.clientId) {
          throw new Error(payload?.error || 'Secure checkout is temporarily unavailable.');
        }
        setPayPalConfig(payload);
      } catch (error) {
        console.error('[PayPalCheckout] config load failed', error);
        setPayPalConfig({ enabled: false, clientId: null, environment: null });
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
    if (verificationLockedRef.current) throw new Error('PAYMENT_VERIFICATION_LOCKED');
    setIsPreparing(true);
    setCheckoutError(null);

    try {
      if (!internalOrderIdRef.current) {
        const guestEmail = user?.email || `guest-${checkoutKeyRef.current.slice(0, 18)}@bannersonthefly.com`;
        const pendingResponse = await fetch('/.netlify/functions/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id || null,
            email: guestEmail,
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
        if (!pendingResponse.ok || !pending?.orderId) {
          throw new Error(pending?.message || pending?.error || 'Could not save the order before payment.');
        }
        internalOrderIdRef.current = pending.orderId;
        persistState('idle');
      }

      const response = await fetch('/.netlify/functions/paypal-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internalOrderId: internalOrderIdRef.current,
          totalCents: total,
          items,
          email: user?.email || null,
          user_id: user?.id || null,
          discountCode,
          sameDayHitService: Boolean(sameDayHitService),
          saturdayDelivery: Boolean(saturdayDelivery),
          attribution: getStoredAttribution(),
        }),
      });
      const payload = await readJson(response);

      if (requiresVerificationLock(payload, response.status)) {
        lockForVerification(payload?.message);
        throw new Error('PAYMENT_VERIFICATION_LOCKED');
      }
      if (!response.ok || !payload?.paypalOrderId) {
        throw new Error(payload?.message || payload?.providerCode || payload?.error || 'Could not start PayPal checkout.');
      }
      return payload.paypalOrderId;
    } finally {
      setIsPreparing(false);
    }
  };

  const handleCreateOrder = (): Promise<string> => {
    const flightKey = `${checkoutSignature}:${internalOrderIdRef.current || checkoutKeyRef.current}`;
    const existing = preparationFlights.get(flightKey);
    if (existing) return existing;

    const flight = preparePayPalOrder().catch((error) => {
      preparationFlights.delete(flightKey);
      throw error;
    });
    preparationFlights.set(flightKey, flight);
    return flight;
  };

  const approveOnce = async (data: any, actions: any) => {
    setIsCapturing(true);
    setCheckoutError(null);
    persistState('processing');

    try {
      const response = await fetch('/.netlify/functions/paypal-capture-minimal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderID: data.orderID,
          internalOrderId: internalOrderIdRef.current,
        }),
      });
      const payload = await readJson(response);

      if (isCompletedCapture(payload)) {
        const internalOrderId = internalOrderIdRef.current || payload.internalOrderId || data.orderID;
        const shippingAddress = extractShipping(payload);
        clearState();
        toast({
          title: 'Payment Successful!',
          description: `Your payment of $${(total / 100).toFixed(2)} was completed.`,
        });
        onSuccess(internalOrderId, {
          ...payload,
          shippingAddress,
          subtotal_cents: payload.subtotal_cents ?? total,
          tax_cents: payload.tax_cents ?? 0,
          total_cents: payload.total_cents ?? total,
        });
        return;
      }

      const providerCode = payload?.providerCode || payload?.error;
      if (payload?.restartPayment || providerCode === 'INSTRUMENT_DECLINED') {
        persistState('idle');
        toast({
          title: 'Payment method declined',
          description: payload?.message || 'Choose another card or payment method and try again.',
          variant: 'destructive',
        });
        if (typeof actions?.restart === 'function') {
          await actions.restart();
          return;
        }
        throw new Error(payload?.message || 'Payment method declined.');
      }

      if (requiresVerificationLock(payload, response.status)) {
        lockForVerification(payload?.message);
        toast({
          title: 'Confirming payment',
          description: payload?.message || 'We are confirming your payment. Do not submit another payment.',
        });
        return;
      }

      const message = payload?.message || payload?.providerCode || payload?.error || 'Payment could not be completed.';
      persistState('idle');
      setCheckoutError(message);
      onError(new Error(message));
    } catch (error) {
      if (verificationLockedRef.current) return;
      const message = error instanceof Error ? error.message : 'Payment could not be completed.';
      if (message === 'PAYMENT_VERIFICATION_LOCKED') return;
      persistState('idle');
      setCheckoutError(message);
      onError(error);
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
    console.error('[PayPalCheckout] provider error', error);
    setIsPreparing(false);
    setIsCapturing(false);
    persistState('idle');
    const message = 'PayPal could not complete the payment. Please choose a payment method and try again.';
    setCheckoutError(message);
    onError(error instanceof Error ? error : new Error(message));
  };

  if (isDeployPreview) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <strong>Deploy Preview Test Checkout:</strong> Create an order without processing a real payment.
        </div>
        <Button onClick={handleTestPayment} disabled={disabled || isPreparing} variant="outline" className="w-full" size="lg">
          {isPreparing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing Test Order...</> : 'Place Test Order — No Payment'}
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

  if (!paypalConfig?.enabled || !paypalConfig.clientId) {
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
    disableFunding: 'paylater,credit',
  };

  const buttonsDisabled = disabled || isPreparing || isCapturing || Boolean(verificationMessage);

  const renderButton = (fundingSource?: 'card' | 'paypal') => (
    <PayPalButtons
      key={`${fundingSource || 'default'}-${total}`}
      fundingSource={fundingSource as any}
      style={fundingSource === 'card'
        ? { layout: 'vertical', color: 'black', shape: 'rect', label: 'checkout', height: 45 }
        : { layout: 'vertical', color: fundingSource === 'paypal' ? 'gold' : 'blue', shape: 'rect', label: 'paypal', height: 42 }}
      disabled={buttonsDisabled}
      onClick={() => {
        setCheckoutError(null);
        if (fundingSource) trackPaymentClick(fundingSource);
      }}
      createOrder={handleCreateOrder}
      onApprove={handleApprove}
      onError={handleProviderError}
      onCancel={() => {
        if (verificationLockedRef.current) return;
        persistState('idle');
        setCheckoutError(null);
        toast({ title: 'Payment Cancelled', description: 'No payment was completed.' });
      }}
    />
  );

  return (
    <div className="space-y-4">
      {verificationMessage ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-2">
            <Clock3 className="mt-0.5 h-4 w-4 flex-none text-blue-700" />
            <span className="text-sm text-blue-900">{verificationMessage}</span>
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

      {checkoutError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {checkoutError}
        </div>
      ) : null}

      {!verificationMessage ? (
        <PayPalScriptProvider options={initialOptions}>
          <p className="mb-3 text-xs text-gray-600">Pay securely by card or PayPal. No PayPal account required.</p>
          {cardFirstLayout ? (
            <div className="space-y-2.5">
              {renderButton('card')}
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-[#E7D9C7]" />
                <span className="text-[11px] text-[#8B7355]">or</span>
                <span className="h-px flex-1 bg-[#E7D9C7]" />
              </div>
              {renderButton('paypal')}
            </div>
          ) : renderButton()}
        </PayPalScriptProvider>
      ) : null}
    </div>
  );
};

export default PayPalCheckoutReliable;
